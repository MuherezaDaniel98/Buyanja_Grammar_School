import { Router } from 'express';
import { db } from '../db.js';
import { authenticate } from '../middleware/auth.js';

export const dashboardRouter = Router();
dashboardRouter.use(authenticate);

dashboardRouter.get('/overview', (req, res) => {
  const user = req.authUser!;
  const yearIdParam = req.query.academicYearId ? Number(req.query.academicYearId) : null;
  const termIdParam = req.query.termId ? Number(req.query.termId) : null;
  const classIdParam = req.query.classId ? Number(req.query.classId) : null;

  const activeYear = (yearIdParam
    ? db.prepare(`SELECT * FROM academic_years WHERE id = ?`).get(yearIdParam)
    : db.prepare(`SELECT * FROM academic_years WHERE is_active = 1 LIMIT 1`).get()) as
    | { id: number; year_label: string }
    | undefined;

  const activeTerm = (termIdParam
    ? db.prepare(`SELECT * FROM terms WHERE id = ?`).get(termIdParam)
    : db
        .prepare(
          `SELECT * FROM terms WHERE academic_year_id = ? AND is_active = 1 LIMIT 1`
        )
        .get(activeYear?.id ?? 0)) as
    | { id: number; name: string; academic_year_id: number }
    | undefined;

  const currentYearId = activeYear?.id ?? 0;
  const currentTermId = activeTerm?.id ?? 0;

  const activeExam = db
    .prepare(
      `SELECT id, name, code FROM examinations WHERE academic_year_id = ? AND term_id = ? ORDER BY is_active DESC, id DESC LIMIT 1`
    )
    .get(currentYearId, currentTermId) as { id: number; name: string; code: string } | undefined;

  const examId = activeExam?.id ?? 0;

  // Core school counts from actual DB
  const studentCounts = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN s.gender = 'M' THEN 1 ELSE 0 END) AS male,
         SUM(CASE WHEN s.gender = 'F' THEN 1 ELSE 0 END) AS female
       FROM student_enrolments se
       JOIN students s ON s.id = se.student_id
       WHERE se.academic_year_id = ? AND se.term_id = ? AND se.status = 'ENROLLED' AND s.status = 'ACTIVE'
         ${classIdParam ? 'AND se.class_id = ?' : ''}`
    )
    .get(...(classIdParam ? [currentYearId, currentTermId, classIdParam] : [currentYearId, currentTermId])) as {
    total: number;
    male: number;
    female: number;
  };

  const teacherCount = (
    db.prepare(`SELECT COUNT(*) AS cnt FROM teachers WHERE status = 'ACTIVE'`).get() as {
      cnt: number;
    }
  ).cnt;
  const classCount = (db.prepare(`SELECT COUNT(*) AS cnt FROM classes`).get() as { cnt: number }).cnt;
  const streamCount = (db.prepare(`SELECT COUNT(*) AS cnt FROM streams`).get() as { cnt: number }).cnt;
  const subjectCount = (
    db.prepare(`SELECT COUNT(*) AS cnt FROM subjects WHERE is_active = 1`).get() as { cnt: number }
  ).cnt;

  // Submission & approval progress
  const subStats = db
    .prepare(
      `SELECT
         COUNT(*) AS total_slots,
         SUM(CASE WHEN status IN ('SUBMITTED', 'VERIFIED', 'APPROVED', 'PUBLISHED') THEN 1 ELSE 0 END) AS submitted_count,
         SUM(CASE WHEN status IN ('VERIFIED', 'APPROVED', 'PUBLISHED') THEN 1 ELSE 0 END) AS verified_count,
         SUM(CASE WHEN status IN ('APPROVED', 'PUBLISHED') THEN 1 ELSE 0 END) AS approved_count,
         SUM(CASE WHEN status = 'PUBLISHED' THEN 1 ELSE 0 END) AS published_count,
         SUM(CASE WHEN status = 'RETURNED' THEN 1 ELSE 0 END) AS returned_count
       FROM result_submissions
       WHERE examination_id = ? ${classIdParam ? 'AND class_id = ?' : ''}`
    )
    .get(...(classIdParam ? [examId, classIdParam] : [examId])) as {
    total_slots: number;
    submitted_count: number;
    verified_count: number;
    approved_count: number;
    published_count: number;
    returned_count: number;
  };

  const submissionPercentage =
    subStats.total_slots > 0
      ? Math.round(((subStats.submitted_count || 0) / subStats.total_slots) * 100)
      : 0;
  const approvalPercentage =
    subStats.total_slots > 0
      ? Math.round(((subStats.approved_count || 0) / subStats.total_slots) * 100)
      : 0;

  // Overall average & attention count
  const avgRow = db
    .prepare(
      `SELECT ROUND(AVG(average_score), 1) AS school_avg
       FROM student_exam_summaries
       WHERE examination_id = ? AND subjects_assessed > 0 ${classIdParam ? 'AND class_id = ?' : ''}`
    )
    .get(...(classIdParam ? [examId, classIdParam] : [examId])) as { school_avg: number | null };

  const thresholdSetting = db
    .prepare(`SELECT setting_value FROM system_settings WHERE setting_key = 'at_risk_threshold'`)
    .get() as { setting_value: string } | undefined;
  const riskThreshold = Number(thresholdSetting?.setting_value || 50);

  const attentionCount = (
    db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM student_exam_summaries
         WHERE examination_id = ? AND subjects_assessed > 0 AND average_score < ?
           ${classIdParam ? 'AND class_id = ?' : ''}`
      )
      .get(...(classIdParam ? [examId, riskThreshold, classIdParam] : [examId, riskThreshold])) as {
      cnt: number;
    }
  ).cnt;

  // Charts: Enrolment by class
  const enrolmentByClass = db
    .prepare(
      `SELECT c.code AS className,
              COUNT(se.id) AS total,
              SUM(CASE WHEN s.gender = 'M' THEN 1 ELSE 0 END) AS male,
              SUM(CASE WHEN s.gender = 'F' THEN 1 ELSE 0 END) AS female
       FROM classes c
       LEFT JOIN student_enrolments se
         ON se.class_id = c.id AND se.academic_year_id = ? AND se.term_id = ? AND se.status = 'ENROLLED'
       LEFT JOIN students s ON s.id = se.student_id AND s.status = 'ACTIVE'
       GROUP BY c.id
       ORDER BY c.sort_order ASC`
    )
    .all(currentYearId, currentTermId);

  // Performance by class
  const performanceByClass = db
    .prepare(
      `SELECT c.code AS className,
              ROUND(AVG(ses.average_score), 1) AS average,
              COUNT(ses.id) AS assessed
       FROM classes c
       LEFT JOIN student_exam_summaries ses
         ON ses.class_id = c.id AND ses.examination_id = ? AND ses.subjects_assessed > 0
       GROUP BY c.id
       ORDER BY c.sort_order ASC`
    )
    .all(examId);

  // Performance by subject
  const performanceBySubject = db
    .prepare(
      `SELECT sub.code AS subjectCode, sub.short_name AS subjectName,
              ROUND(AVG(sr.weighted_total), 1) AS average
       FROM subjects sub
       JOIN subject_results sr ON sr.subject_id = sub.id AND sr.examination_id = ?
       WHERE sr.weighted_total IS NOT NULL ${classIdParam ? 'AND sr.class_id = ?' : ''}
       GROUP BY sub.id
       ORDER BY average DESC`
    )
    .all(...(classIdParam ? [examId, classIdParam] : [examId]));

  // Grade distribution
  const gradeDistribution = db
    .prepare(
      `SELECT COALESCE(sr.grade, 'N/A') AS grade, COUNT(*) AS count
       FROM subject_results sr
       WHERE sr.examination_id = ? AND sr.grade IS NOT NULL AND sr.grade != 'EX'
         ${classIdParam ? 'AND sr.class_id = ?' : ''}
       GROUP BY sr.grade
       ORDER BY sr.grade ASC`
    )
    .all(...(classIdParam ? [examId, classIdParam] : [examId]));

  // Termly performance trends
  const termTrends = db
    .prepare(
      `SELECT ay.year_label || ' ' || t.name AS period,
              ROUND(AVG(ses.average_score), 1) AS average
       FROM examinations e
       JOIN academic_years ay ON ay.id = e.academic_year_id
       JOIN terms t ON t.id = e.term_id
       JOIN student_exam_summaries ses ON ses.examination_id = e.id AND ses.subjects_assessed > 0
       ${classIdParam ? 'WHERE ses.class_id = ?' : ''}
       GROUP BY e.id
       ORDER BY ay.year_label ASC, t.term_number ASC`
    )
    .all(...(classIdParam ? [classIdParam] : []));

  // Role-specific operational queues
  let teacherAllocations: unknown[] = [];
  let pendingQueue: unknown[] = [];

  if (user.teacherId) {
    teacherAllocations = db
      .prepare(
        `SELECT ta.id, c.id AS class_id, c.name AS class_name, c.code AS class_code,
                st.id AS stream_id, st.name AS stream_name,
                sub.id AS subject_id, sub.code AS subject_code, sub.name AS subject_name,
                ta.is_class_teacher,
                COALESCE(rs.status, 'DRAFT') AS submission_status,
                rs.dos_notes
         FROM teacher_allocations ta
         JOIN classes c ON c.id = ta.class_id
         JOIN streams st ON st.id = ta.stream_id
         LEFT JOIN subjects sub ON sub.id = ta.subject_id
         LEFT JOIN result_submissions rs
           ON rs.examination_id = ? AND rs.class_id = ta.class_id
          AND rs.stream_id = ta.stream_id AND rs.subject_id = ta.subject_id
         WHERE ta.teacher_id = ? AND ta.academic_year_id = ? AND ta.term_id = ? AND ta.is_active = 1
         ORDER BY c.sort_order, st.name, sub.name`
      )
      .all(examId, user.teacherId, currentYearId, currentTermId);
  }

  if (user.roles.includes('DOS') || user.roles.includes('HEAD_TEACHER') || user.roles.includes('SYSTEM_ADMIN')) {
    pendingQueue = db
      .prepare(
        `SELECT rs.id, rs.status, rs.submitted_at, rs.verified_at,
                c.code AS class_code, st.name AS stream_name,
                sub.code AS subject_code, sub.name AS subject_name,
                u.full_name AS teacher_name
         FROM result_submissions rs
         JOIN classes c ON c.id = rs.class_id
         JOIN streams st ON st.id = rs.stream_id
         JOIN subjects sub ON sub.id = rs.subject_id
         LEFT JOIN users u ON u.id = rs.submitted_by
         WHERE rs.examination_id = ? AND rs.status IN ('SUBMITTED', 'VERIFIED', 'RETURNED')
         ORDER BY rs.submitted_at DESC
         LIMIT 12`
      )
      .all(examId);
  }

  res.json({
    context: {
      academicYear: activeYear || null,
      term: activeTerm || null,
      examination: activeExam || null,
    },
    metrics: {
      totalStudents: studentCounts.total || 0,
      maleStudents: studentCounts.male || 0,
      femaleStudents: studentCounts.female || 0,
      totalTeachers: teacherCount,
      totalClasses: classCount,
      totalStreams: streamCount,
      totalSubjects: subjectCount,
      submissionPercentage,
      approvalPercentage,
      schoolAverage: avgRow.school_avg ?? 0,
      attentionCount,
      submissionBreakdown: subStats,
    },
    charts: {
      enrolmentByClass,
      genderDistribution: [
        { name: 'Female', value: studentCounts.female || 0 },
        { name: 'Male', value: studentCounts.male || 0 },
      ],
      performanceByClass,
      performanceBySubject,
      gradeDistribution,
      termTrends,
    },
    roleData: {
      teacherAllocations,
      pendingQueue,
    },
  });
});

dashboardRouter.get('/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) {
    res.json({ students: [], teachers: [], subjects: [] });
    return;
  }
  const like = `%${q}%`;
  const students = db
    .prepare(
      `SELECT id, admission_number, first_name || ' ' || last_name AS full_name, status
       FROM students
       WHERE admission_number LIKE ? OR first_name LIKE ? OR last_name LIKE ?
       LIMIT 8`
    )
    .all(like, like, like);

  const teachers = db
    .prepare(
      `SELECT t.id, t.staff_number, u.full_name, t.department
       FROM teachers t JOIN users u ON u.id = t.user_id
       WHERE u.full_name LIKE ? OR t.staff_number LIKE ?
       LIMIT 6`
    )
    .all(like, like);

  const subjects = db
    .prepare(`SELECT id, code, name, department FROM subjects WHERE code LIKE ? OR name LIKE ? LIMIT 6`)
    .all(like, like);

  res.json({ students, teachers, subjects });
});
