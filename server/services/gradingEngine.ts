import { db } from '../db.js';

export interface GradingBoundary {
  id: number;
  grade: string;
  min_score: number;
  max_score: number;
  points: number;
  descriptor: string;
  remarks: string | null;
}

export interface AssessmentCategoryConfig {
  id: number;
  name: string;
  code: string;
  max_marks: number;
  weight_percentage: number;
  sort_order: number;
}

export interface MarkEntryCell {
  assessment_category_id: number;
  score: number | null;
  status_flag: 'PRESENT' | 'ABSENT' | 'EXEMPTED';
}

export function resolveGrade(
  score: number,
  boundaries: GradingBoundary[]
): GradingBoundary | null {
  const rounded = Math.round(score * 100) / 100;
  // Sort highest min_score first so boundary overlaps pick top tier deterministically
  const sorted = [...boundaries].sort((a, b) => b.min_score - a.min_score);
  for (const b of sorted) {
    if (rounded >= b.min_score && rounded <= b.max_score) {
      return b;
    }
  }
  // Fallback for decimal edge between integer boundaries (e.g., 79.6 with 80..100 & 70..79)
  const intScore = Math.round(score);
  for (const b of sorted) {
    if (intScore >= b.min_score && intScore <= b.max_score) {
      return b;
    }
  }
  return sorted[sorted.length - 1] || null;
}

/**
 * Computes weighted subject score out of 100 given configured assessment categories.
 * Handles missing assessments, ABSENT, and EXEMPTED marks cleanly:
 * - If all assessments are EXEMPTED -> returns null (excluded from subject count)
 * - If at least one PRESENT score exists -> sums (score / max_marks) * weight_percentage
 *   normalized to total active non-exempt weight so exempted components do not penalize.
 * - If all entered entries are ABSENT and no PRESENT score exists -> returns 0 (ABSENT).
 */
export function calculateWeightedSubjectScore(
  categories: AssessmentCategoryConfig[],
  entries: MarkEntryCell[]
): { weightedTotal: number | null; status: 'ASSESSED' | 'ABSENT' | 'EXEMPTED' | 'MISSING' } {
  if (categories.length === 0) {
    return { weightedTotal: null, status: 'MISSING' };
  }

  const entryMap = new Map<number, MarkEntryCell>();
  for (const e of entries) {
    entryMap.set(e.assessment_category_id, e);
  }

  let totalWeightConfigured = 0;
  let activeWeight = 0;
  let weightedSum = 0;
  let presentCount = 0;
  let absentCount = 0;
  let exemptedCount = 0;

  for (const cat of categories) {
    totalWeightConfigured += cat.weight_percentage;
    const entry = entryMap.get(cat.id);
    if (!entry) {
      continue;
    }
    if (entry.status_flag === 'EXEMPTED') {
      exemptedCount++;
      continue;
    }
    if (entry.status_flag === 'ABSENT') {
      absentCount++;
      activeWeight += cat.weight_percentage;
      continue;
    }
    if (entry.status_flag === 'PRESENT' && entry.score !== null && entry.score !== undefined) {
      presentCount++;
      activeWeight += cat.weight_percentage;
      const ratio = cat.max_marks > 0 ? entry.score / cat.max_marks : 0;
      weightedSum += ratio * cat.weight_percentage;
    }
  }

  if (exemptedCount === categories.length) {
    return { weightedTotal: null, status: 'EXEMPTED' };
  }
  if (presentCount === 0 && absentCount > 0) {
    return { weightedTotal: 0, status: 'ABSENT' };
  }
  if (presentCount === 0) {
    return { weightedTotal: null, status: 'MISSING' };
  }

  // If total weight is 100 (standard), use totalWeightConfigured minus exempted weights
  const denominator =
    exemptedCount > 0 && activeWeight > 0
      ? activeWeight
      : totalWeightConfigured > 0
        ? totalWeightConfigured
        : 100;

  const normalized = (weightedSum / denominator) * 100;
  return {
    weightedTotal: Math.round(normalized * 10) / 10,
    status: 'ASSESSED',
  };
}

/**
 * Recalculates subject_results and student_exam_summaries (including ties and class/stream ranks)
 * inside an atomic database transaction for a given examination and class.
 */
export const recalculateExaminationClass = db.transaction(
  (examinationId: number, classId: number) => {
    const exam = db
      .prepare(
        `SELECT id, academic_year_id, term_id, grading_scale_id, ranking_enabled, aggregate_enabled
         FROM examinations WHERE id = ?`
      )
      .get(examinationId) as
      | {
          id: number;
          academic_year_id: number;
          term_id: number;
          grading_scale_id: number;
          ranking_enabled: number;
          aggregate_enabled: number;
        }
      | undefined;

    if (!exam) {
      throw new Error(`Examination ${examinationId} not found`);
    }

    const categories = db
      .prepare(
        `SELECT id, name, code, max_marks, weight_percentage, sort_order
         FROM assessment_categories WHERE examination_id = ? ORDER BY sort_order ASC`
      )
      .all(examinationId) as AssessmentCategoryConfig[];

    const boundaries = db
      .prepare(
        `SELECT id, grade, min_score, max_score, points, descriptor, remarks
         FROM grading_boundaries WHERE grading_scale_id = ? ORDER BY min_score DESC`
      )
      .all(exam.grading_scale_id) as GradingBoundary[];

    const enrolments = db
      .prepare(
        `SELECT se.student_id, se.stream_id
         FROM student_enrolments se
         JOIN students s ON s.id = se.student_id
         WHERE se.academic_year_id = ? AND se.term_id = ? AND se.class_id = ?
           AND se.status = 'ENROLLED' AND s.status = 'ACTIVE'`
      )
      .all(exam.academic_year_id, exam.term_id, classId) as Array<{
      student_id: number;
      stream_id: number;
    }>;

    const classSubjects = db
      .prepare(`SELECT subject_id FROM class_subjects WHERE class_id = ?`)
      .all(classId) as Array<{ subject_id: number }>;

    const allMarks = db
      .prepare(
        `SELECT student_id, subject_id, assessment_category_id, score, status_flag
         FROM marks WHERE examination_id = ? AND class_id = ?`
      )
      .all(examinationId, classId) as Array<{
      student_id: number;
      subject_id: number;
      assessment_category_id: number;
      score: number | null;
      status_flag: 'PRESENT' | 'ABSENT' | 'EXEMPTED';
    }>;

    const marksLookup = new Map<string, MarkEntryCell[]>();
    for (const m of allMarks) {
      const key = `${m.student_id}:${m.subject_id}`;
      if (!marksLookup.has(key)) {
        marksLookup.set(key, []);
      }
      marksLookup.get(key)!.push({
        assessment_category_id: m.assessment_category_id,
        score: m.score,
        status_flag: m.status_flag,
      });
    }

    const upsertSubjectResult = db.prepare(`
      INSERT INTO subject_results (
        examination_id, student_id, class_id, stream_id, subject_id,
        weighted_total, grade, points, descriptor, calculated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(examination_id, student_id, subject_id)
      DO UPDATE SET
        stream_id = excluded.stream_id,
        weighted_total = excluded.weighted_total,
        grade = excluded.grade,
        points = excluded.points,
        descriptor = excluded.descriptor,
        calculated_at = datetime('now')
    `);

    const studentTotals: Array<{
      studentId: number;
      streamId: number;
      totalMarks: number;
      averageScore: number;
      overallGrade: string | null;
      aggregatePoints: number | null;
      subjectsAssessed: number;
      descriptor: string | null;
    }> = [];

    for (const enrol of enrolments) {
      let totalMarks = 0;
      let assessedCount = 0;
      const subjectPoints: number[] = [];

      for (const cs of classSubjects) {
        const entries = marksLookup.get(`${enrol.student_id}:${cs.subject_id}`) || [];
        const calc = calculateWeightedSubjectScore(categories, entries);

        if (calc.weightedTotal !== null) {
          const matchedGrade = resolveGrade(calc.weightedTotal, boundaries);
          upsertSubjectResult.run(
            examinationId,
            enrol.student_id,
            classId,
            enrol.stream_id,
            cs.subject_id,
            calc.weightedTotal,
            matchedGrade?.grade ?? null,
            matchedGrade?.points ?? null,
            matchedGrade?.descriptor ?? null
          );
          totalMarks += calc.weightedTotal;
          assessedCount++;
          if (matchedGrade?.points !== undefined) {
            subjectPoints.push(matchedGrade.points);
          }
        } else {
          upsertSubjectResult.run(
            examinationId,
            enrol.student_id,
            classId,
            enrol.stream_id,
            cs.subject_id,
            null,
            calc.status === 'EXEMPTED' ? 'EX' : null,
            null,
            calc.status === 'EXEMPTED' ? 'Exempted' : 'Missing'
          );
        }
      }

      const avg = assessedCount > 0 ? Math.round((totalMarks / assessedCount) * 10) / 10 : 0;
      const overallBoundary = assessedCount > 0 ? resolveGrade(avg, boundaries) : null;
      // Aggregate: sum of best 8 subject points (or all assessed subjects if <= 8)
      const bestPoints = [...subjectPoints].sort((a, b) => a - b).slice(0, 8);
      const aggregate =
        exam.aggregate_enabled && bestPoints.length > 0
          ? bestPoints.reduce((sum, p) => sum + p, 0)
          : null;

      studentTotals.push({
        studentId: enrol.student_id,
        streamId: enrol.stream_id,
        totalMarks: Math.round(totalMarks * 10) / 10,
        averageScore: avg,
        overallGrade: overallBoundary?.grade ?? null,
        aggregatePoints: aggregate,
        subjectsAssessed: assessedCount,
        descriptor: overallBoundary?.descriptor ?? null,
      });
    }

    // Standard competition ranking (1, 1, 3) with tie handling on averageScore
    const assessedStudents = studentTotals
      .filter((s) => s.subjectsAssessed > 0)
      .sort((a, b) => b.averageScore - a.averageScore || b.totalMarks - a.totalMarks);

    const classRankMap = new Map<number, number>();
    let prevScore: number | null = null;
    let currentRank = 0;
    assessedStudents.forEach((st, idx) => {
      if (prevScore === null || st.averageScore < prevScore) {
        currentRank = idx + 1;
        prevScore = st.averageScore;
      }
      classRankMap.set(st.studentId, currentRank);
    });

    // Stream competition ranking
    const streamRankMap = new Map<number, number>();
    const streamGroups = new Map<number, typeof assessedStudents>();
    for (const st of assessedStudents) {
      if (!streamGroups.has(st.streamId)) {
        streamGroups.set(st.streamId, []);
      }
      streamGroups.get(st.streamId)!.push(st);
    }
    for (const [, group] of streamGroups) {
      let sPrev: number | null = null;
      let sRank = 0;
      group.forEach((st, idx) => {
        if (sPrev === null || st.averageScore < sPrev) {
          sRank = idx + 1;
          sPrev = st.averageScore;
        }
        streamRankMap.set(st.studentId, sRank);
      });
    }

    const upsertSummary = db.prepare(`
      INSERT INTO student_exam_summaries (
        examination_id, student_id, class_id, stream_id,
        total_marks, average_score, overall_grade, aggregate_points,
        subjects_assessed, class_position, stream_position, class_size,
        performance_descriptor, calculated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(examination_id, student_id)
      DO UPDATE SET
        stream_id = excluded.stream_id,
        total_marks = excluded.total_marks,
        average_score = excluded.average_score,
        overall_grade = excluded.overall_grade,
        aggregate_points = excluded.aggregate_points,
        subjects_assessed = excluded.subjects_assessed,
        class_position = excluded.class_position,
        stream_position = excluded.stream_position,
        class_size = excluded.class_size,
        performance_descriptor = excluded.performance_descriptor,
        calculated_at = datetime('now')
    `);

    const classSize = assessedStudents.length;
    for (const st of studentTotals) {
      upsertSummary.run(
        examinationId,
        st.studentId,
        classId,
        st.streamId,
        st.totalMarks,
        st.averageScore,
        st.overallGrade,
        st.aggregatePoints,
        st.subjectsAssessed,
        exam.ranking_enabled ? classRankMap.get(st.studentId) ?? null : null,
        exam.ranking_enabled ? streamRankMap.get(st.studentId) ?? null : null,
        classSize,
        st.descriptor
      );
    }

    return {
      studentsProcessed: studentTotals.length,
      assessedStudents: classSize,
    };
  }
);
