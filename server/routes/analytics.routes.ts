import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { authenticate, requirePermission } from '../middleware/auth.js';

export const analyticsRouter = Router();
analyticsRouter.use(authenticate);

analyticsRouter.get('/overview', requirePermission('analytics.view', 'dashboard.view'), (req, res) => {
  const examinationId = req.query.examinationId ? Number(req.query.examinationId) : null;
  const classId = req.query.classId ? Number(req.query.classId) : null;

  const targetExam = (examinationId
    ? db.prepare(`SELECT * FROM examinations WHERE id = ?`).get(examinationId)
    : db.prepare(`SELECT * FROM examinations ORDER BY is_active DESC, id DESC LIMIT 1`).get()) as
    | { id: number; name: string; academic_year_id: number; term_id: number }
    | undefined;

  const examId = targetExam?.id ?? 0;

  const classComparisons = db
    .prepare(
      `SELECT c.id, c.code AS classCode, c.name AS className,
              ROUND(AVG(ses.average_score), 1) AS averageScore,
              ROUND(MAX(ses.average_score), 1) AS topScore,
              ROUND(MIN(ses.average_score), 1) AS minScore,
              COUNT(ses.id) AS studentCount
       FROM classes c
       LEFT JOIN student_exam_summaries ses
         ON ses.class_id = c.id AND ses.examination_id = ? AND ses.subjects_assessed > 0
       GROUP BY c.id
       ORDER BY c.sort_order ASC`
    )
    .all(examId);

  const subjectComparisons = db
    .prepare(
      `SELECT sub.id, sub.code AS subjectCode, sub.name AS subjectName, sub.department,
              ROUND(AVG(sr.weighted_total), 1) AS averageScore,
              ROUND(MAX(sr.weighted_total), 1) AS highestScore,
              ROUND(MIN(sr.weighted_total), 1) AS lowestScore,
              SUM(CASE WHEN sr.weighted_total >= 50 THEN 1 ELSE 0 END) AS passCount,
              COUNT(sr.id) AS totalCount
       FROM subjects sub
       JOIN subject_results sr ON sr.subject_id = sub.id AND sr.examination_id = ?
       WHERE sr.weighted_total IS NOT NULL ${classId ? 'AND sr.class_id = ?' : ''}
       GROUP BY sub.id
       ORDER BY averageScore DESC`
    )
    .all(...(classId ? [examId, classId] : [examId]));

  const gradeDistribution = db
    .prepare(
      `SELECT sr.grade, COUNT(*) AS count
       FROM subject_results sr
       WHERE sr.examination_id = ? AND sr.grade IS NOT NULL AND sr.grade != 'EX'
         ${classId ? 'AND sr.class_id = ?' : ''}
       GROUP BY sr.grade
       ORDER BY sr.grade ASC`
    )
    .all(...(classId ? [examId, classId] : [examId]));

  const termTrends = db
    .prepare(
      `SELECT e.id AS examination_id, ay.year_label || ' ' || t.name AS period,
              ROUND(AVG(ses.average_score), 1) AS schoolAverage,
              COUNT(ses.id) AS assessedCount
       FROM examinations e
       JOIN academic_years ay ON ay.id = e.academic_year_id
       JOIN terms t ON t.id = e.term_id
       JOIN student_exam_summaries ses ON ses.examination_id = e.id AND ses.subjects_assessed > 0
       ${classId ? 'WHERE ses.class_id = ?' : ''}
       GROUP BY e.id
       ORDER BY ay.year_label ASC, t.term_number ASC`
    )
    .all(...(classId ? [classId] : []));

  const topPerformers = db
    .prepare(
      `SELECT ses.student_id, s.admission_number, s.first_name || ' ' || s.last_name AS full_name,
              c.code AS class_code, st.name AS stream_name,
              ses.average_score, ses.overall_grade, ses.aggregate_points, ses.class_position
       FROM student_exam_summaries ses
       JOIN students s ON s.id = ses.student_id
       JOIN classes c ON c.id = ses.class_id
       JOIN streams st ON st.id = ses.stream_id
       WHERE ses.examination_id = ? AND ses.subjects_assessed > 0
         ${classId ? 'AND ses.class_id = ?' : ''}
       ORDER BY ses.average_score DESC
       LIMIT 10`
    )
    .all(...(classId ? [examId, classId] : [examId]));

  const thresholdRow = db
    .prepare(`SELECT setting_value FROM system_settings WHERE setting_key = 'at_risk_threshold'`)
    .get() as { setting_value: string } | undefined;
  const threshold = Number(thresholdRow?.setting_value || 50);

  const belowThreshold = db
    .prepare(
      `SELECT ses.student_id, s.admission_number, s.first_name || ' ' || s.last_name AS full_name,
              c.code AS class_code, st.name AS stream_name,
              ses.average_score, ses.overall_grade, ses.subjects_assessed
       FROM student_exam_summaries ses
       JOIN students s ON s.id = ses.student_id
       JOIN classes c ON c.id = ses.class_id
       JOIN streams st ON st.id = ses.stream_id
       WHERE ses.examination_id = ? AND ses.subjects_assessed > 0 AND ses.average_score < ?
         ${classId ? 'AND ses.class_id = ?' : ''}
       ORDER BY ses.average_score ASC`
    )
    .all(...(classId ? [examId, threshold, classId] : [examId, threshold]));

  res.json({
    examination: targetExam || null,
    threshold,
    classComparisons,
    subjectComparisons,
    gradeDistribution,
    termTrends,
    topPerformers,
    belowThreshold,
  });
});

analyticsRouter.get('/risk-identification', requirePermission('analytics.view', 'comments.manage'), (req, res) => {
  const classId = req.query.classId ? Number(req.query.classId) : null;

  const settingsRows = db
    .prepare(
      `SELECT setting_key, setting_value FROM system_settings
       WHERE setting_key IN ('at_risk_threshold', 'decline_alert_threshold')`
    )
    .all() as Array<{ setting_key: string; setting_value: string }>;
  const settingsMap = Object.fromEntries(settingsRows.map((r) => [r.setting_key, Number(r.setting_value)]));
  const lowThreshold = settingsMap.at_risk_threshold || 50;
  const declineThreshold = settingsMap.decline_alert_threshold || 10;

  const exams = db
    .prepare(
      `SELECT e.id, e.name, e.academic_year_id, e.term_id, ay.year_label, t.term_number, t.name AS term_name
       FROM examinations e
       JOIN academic_years ay ON ay.id = e.academic_year_id
       JOIN terms t ON t.id = e.term_id
       ORDER BY ay.year_label DESC, t.term_number DESC LIMIT 2`
    )
    .all() as Array<{
    id: number;
    name: string;
    academic_year_id: number;
    term_id: number;
    year_label: string;
    term_number: number;
    term_name: string;
  }>;

  const currentExam = exams[0];
  const previousExam = exams[1];
  if (!currentExam) {
    res.json({ currentExam: null, previousExam: null, flaggedStudents: [] });
    return;
  }

  const currentRows = db
    .prepare(
      `SELECT ses.student_id, s.admission_number, s.first_name || ' ' || s.last_name AS full_name,
              c.id AS class_id, c.code AS class_code, st.name AS stream_name,
              ses.average_score, ses.overall_grade, ses.subjects_assessed
       FROM student_exam_summaries ses
       JOIN students s ON s.id = ses.student_id
       JOIN classes c ON c.id = ses.class_id
       JOIN streams st ON st.id = ses.stream_id
       WHERE ses.examination_id = ? AND s.status = 'ACTIVE' ${classId ? 'AND ses.class_id = ?' : ''}`
    )
    .all(...(classId ? [currentExam.id, classId] : [currentExam.id])) as Array<{
    student_id: number;
    admission_number: string;
    full_name: string;
    class_id: number;
    class_code: string;
    stream_name: string;
    average_score: number;
    overall_grade: string | null;
    subjects_assessed: number;
  }>;

  const prevMap = new Map<number, number>();
  if (previousExam) {
    const prevRows = db
      .prepare(
        `SELECT student_id, average_score FROM student_exam_summaries WHERE examination_id = ? AND subjects_assessed > 0`
      )
      .all(previousExam.id) as Array<{ student_id: number; average_score: number }>;
    for (const pr of prevRows) {
      prevMap.set(pr.student_id, pr.average_score);
    }
  }

  const lowSubjectRows = db
    .prepare(
      `SELECT sr.student_id, sub.code AS subject_code, sub.name AS subject_name, sr.weighted_total
       FROM subject_results sr
       JOIN subjects sub ON sub.id = sr.subject_id
       WHERE sr.examination_id = ? AND sr.weighted_total IS NOT NULL AND sr.weighted_total < ?`
    )
    .all(currentExam.id, lowThreshold) as Array<{
    student_id: number;
    subject_code: string;
    subject_name: string;
    weighted_total: number;
  }>;

  const lowSubjectsByStudent = new Map<number, Array<{ code: string; name: string; score: number }>>();
  for (const row of lowSubjectRows) {
    if (!lowSubjectsByStudent.has(row.student_id)) {
      lowSubjectsByStudent.set(row.student_id, []);
    }
    lowSubjectsByStudent.get(row.student_id)!.push({
      code: row.subject_code,
      name: row.subject_name,
      score: row.weighted_total,
    });
  }

  const notesRows = db
    .prepare(
      `SELECT n.*, u.full_name AS author_name
       FROM intervention_notes n JOIN users u ON u.id = n.created_by
       ORDER BY n.created_at DESC`
    )
    .all() as Array<Record<string, unknown>>;

  const flaggedStudents = currentRows
    .map((stu) => {
      const prevAvg = prevMap.get(stu.student_id) ?? null;
      const delta = prevAvg !== null ? Math.round((stu.average_score - prevAvg) * 10) / 10 : null;
      const weakSubjects = lowSubjectsByStudent.get(stu.student_id) || [];
      const expectedSubjects = (
        db.prepare(`SELECT COUNT(*) AS cnt FROM class_subjects WHERE class_id = ?`).get(stu.class_id) as {
          cnt: number;
        }
      ).cnt;
      const missingCount = Math.max(0, expectedSubjects - stu.subjects_assessed);

      const indicators: string[] = [];
      const suggestions: string[] = [];

      if (stu.average_score < lowThreshold) {
        indicators.push(`Current average (${stu.average_score}%) is below school support threshold (${lowThreshold}%)`);
        suggestions.push('Schedule structured remedial tutoring and parent academic review');
      }
      if (delta !== null && delta <= -declineThreshold) {
        indicators.push(`Performance declined by ${Math.abs(delta)} percentage points from ${previousExam?.term_name}`);
        suggestions.push('Conduct individual student mentoring session to identify recent learning barriers');
      }
      if (weakSubjects.length >= 3) {
        indicators.push(`${weakSubjects.length} subjects below ${lowThreshold}% (${weakSubjects.map((w) => w.code).join(', ')})`);
        suggestions.push('Coordinate targeted subject clinic support with respective subject teachers');
      }
      if (missingCount >= 2) {
        indicators.push(`${missingCount} subject assessments currently unrecorded`);
        suggestions.push('Verify attendance and pending coursework submissions with subject teachers');
      }

      if (indicators.length === 0) return null;

      const supportPriority =
        indicators.length >= 2 || stu.average_score < 42 ? 'HIGH' : delta !== null && delta <= -declineThreshold ? 'MODERATE' : 'MONITOR';

      return {
        studentId: stu.student_id,
        admissionNumber: stu.admission_number,
        fullName: stu.full_name,
        classCode: stu.class_code,
        streamName: stu.stream_name,
        currentAverage: stu.average_score,
        previousAverage: prevAvg,
        delta,
        overallGrade: stu.overall_grade,
        supportPriority,
        indicators,
        weakSubjects,
        missingCount,
        suggestions,
        interventionNotes: notesRows.filter((n) => n.student_id === stu.student_id),
      };
    })
    .filter(Boolean);

  res.json({
    currentExam,
    previousExam: previousExam || null,
    thresholds: { lowThreshold, declineThreshold },
    flaggedStudents,
  });
});

analyticsRouter.post('/interventions', requirePermission('analytics.view', 'comments.manage'), (req, res) => {
  const schema = z.object({
    studentId: z.number().int().positive(),
    riskLevel: z.enum(['MONITOR', 'MODERATE', 'HIGH']).default('MONITOR'),
    note: z.string().min(4).max(600),
    actionPlan: z.string().max(600).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid intervention note.' });
    return;
  }

  const activeYear = db.prepare(`SELECT id FROM academic_years WHERE is_active = 1 LIMIT 1`).get() as
    | { id: number }
    | undefined;
  const activeTerm = db.prepare(`SELECT id FROM terms WHERE is_active = 1 LIMIT 1`).get() as
    | { id: number }
    | undefined;

  const r = db
    .prepare(
      `INSERT INTO intervention_notes (student_id, academic_year_id, term_id, risk_level, note, action_plan, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?)`
    )
    .run(
      parsed.data.studentId,
      activeYear?.id ?? 1,
      activeTerm?.id ?? 1,
      parsed.data.riskLevel,
      parsed.data.note.trim(),
      parsed.data.actionPlan?.trim() || null,
      req.authUser!.id
    );

  res.status(201).json({ id: Number(r.lastInsertRowid) });
});
