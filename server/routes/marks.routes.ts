import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { db } from '../db.js';
import { createNotification, notifyRoleUsers, recordAuditLog } from '../middleware/audit.js';
import {
  authenticate,
  isClassTeacherForStream,
  isTeacherAllocatedToSubject,
  requirePermission,
} from '../middleware/auth.js';
import { buildMarksTemplateWorkbook, parseSpreadsheetBuffer } from '../services/excelService.js';
import { recalculateExaminationClass } from '../services/gradingEngine.js';

export const marksRouter = Router();
marksRouter.use(authenticate);

const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

function getExamContext(examinationId: number) {
  return db
    .prepare(
      `SELECT e.*, ay.year_label, t.name AS term_name
       FROM examinations e
       JOIN academic_years ay ON ay.id = e.academic_year_id
       JOIN terms t ON t.id = e.term_id
       WHERE e.id = ?`
    )
    .get(examinationId) as
    | {
        id: number;
        academic_year_id: number;
        term_id: number;
        name: string;
        code: string;
        grading_scale_id: number;
        submission_deadline: string | null;
        year_label: string;
        term_name: string;
      }
    | undefined;
}

marksRouter.get('/grid', requirePermission('marks.enter', 'marks.verify', 'results.approve'), (req, res) => {
  const examinationId = Number(req.query.examinationId);
  const classId = Number(req.query.classId);
  const streamId = Number(req.query.streamId);
  const subjectId = Number(req.query.subjectId);

  if (!examinationId || !classId || !streamId || !subjectId) {
    res.status(400).json({ error: 'examinationId, classId, streamId, and subjectId are required.' });
    return;
  }

  const exam = getExamContext(examinationId);
  if (!exam) {
    res.status(404).json({ error: 'Examination not found.' });
    return;
  }

  // Backend RBAC scope check: Subject teachers can only access assigned classes/subjects
  const user = req.authUser!;
  if (
    !isTeacherAllocatedToSubject({
      user,
      academicYearId: exam.academic_year_id,
      termId: exam.term_id,
      classId,
      streamId,
      subjectId,
    })
  ) {
    res.status(403).json({
      error: 'Access denied. You are not assigned to teach this subject for the selected class/stream.',
    });
    return;
  }

  const categories = db
    .prepare(
      `SELECT id, name, code, max_marks, weight_percentage, sort_order
       FROM assessment_categories WHERE examination_id = ? ORDER BY sort_order ASC`
    )
    .all(examinationId);

  const boundaries = db
    .prepare(
      `SELECT grade, min_score, max_score, points, descriptor
       FROM grading_boundaries WHERE grading_scale_id = ? ORDER BY min_score DESC`
    )
    .all(exam.grading_scale_id);

  const students = db
    .prepare(
      `SELECT s.id, s.admission_number, s.first_name, s.last_name, s.gender
       FROM student_enrolments se
       JOIN students s ON s.id = se.student_id
       WHERE se.academic_year_id = ? AND se.term_id = ? AND se.class_id = ? AND se.stream_id = ?
         AND se.status = 'ENROLLED' AND s.status = 'ACTIVE'
       ORDER BY s.last_name ASC, s.first_name ASC`
    )
    .all(exam.academic_year_id, exam.term_id, classId, streamId) as Array<{
    id: number;
    admission_number: string;
    first_name: string;
    last_name: string;
    gender: string;
  }>;

  const marks = db
    .prepare(
      `SELECT id, student_id, assessment_category_id, score, status_flag, version, updated_at
       FROM marks
       WHERE examination_id = ? AND class_id = ? AND stream_id = ? AND subject_id = ?`
    )
    .all(examinationId, classId, streamId, subjectId);

  const subjectResults = db
    .prepare(
      `SELECT student_id, weighted_total, grade, descriptor
       FROM subject_results
       WHERE examination_id = ? AND class_id = ? AND stream_id = ? AND subject_id = ?`
    )
    .all(examinationId, classId, streamId, subjectId);

  let submission = db
    .prepare(
      `SELECT rs.*, u.full_name AS submitted_by_name, v.full_name AS verified_by_name, a.full_name AS approved_by_name
       FROM result_submissions rs
       LEFT JOIN users u ON u.id = rs.submitted_by
       LEFT JOIN users v ON v.id = rs.verified_by
       LEFT JOIN users a ON a.id = rs.approved_by
       WHERE rs.examination_id = ? AND rs.class_id = ? AND rs.stream_id = ? AND rs.subject_id = ?`
    )
    .get(examinationId, classId, streamId, subjectId) as Record<string, unknown> | undefined;

  if (!submission) {
    submission = {
      status: 'DRAFT',
      version: 1,
      dos_notes: null,
      headteacher_notes: null,
    };
  }

  const approvalHistory = submission.id
    ? db
        .prepare(
          `SELECT ra.*, u.full_name AS actor_name
           FROM result_approvals ra JOIN users u ON u.id = ra.actor_user_id
           WHERE ra.submission_id = ? ORDER BY ra.created_at DESC`
        )
        .all(submission.id)
    : [];

  const versionHistory = db
    .prepare(
      `SELECT rv.*, s.admission_number, s.first_name || ' ' || s.last_name AS student_name,
              ac.code AS category_code, u.full_name AS changed_by_name
       FROM result_versions rv
       JOIN students s ON s.id = rv.student_id
       JOIN assessment_categories ac ON ac.id = rv.assessment_category_id
       JOIN users u ON u.id = rv.changed_by
       WHERE rv.examination_id = ? AND rv.subject_id = ?
       ORDER BY rv.created_at DESC LIMIT 30`
    )
    .all(examinationId, subjectId);

  res.json({
    exam,
    categories,
    boundaries,
    students,
    marks,
    subjectResults,
    submission,
    approvalHistory,
    versionHistory,
  });
});

const saveDraftSchema = z.object({
  examinationId: z.number().int().positive(),
  classId: z.number().int().positive(),
  streamId: z.number().int().positive(),
  subjectId: z.number().int().positive(),
  expectedVersion: z.number().int().positive().optional(),
  entries: z.array(
    z.object({
      studentId: z.number().int().positive(),
      assessmentCategoryId: z.number().int().positive(),
      score: z.number().min(0).nullable(),
      statusFlag: z.enum(['PRESENT', 'ABSENT', 'EXEMPTED']).default('PRESENT'),
    })
  ),
});

marksRouter.post('/save-draft', requirePermission('marks.enter', 'marks.verify'), (req, res) => {
  const parsed = saveDraftSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid marks payload.', details: parsed.error.flatten() });
    return;
  }

  const { examinationId, classId, streamId, subjectId, expectedVersion, entries } = parsed.data;
  const exam = getExamContext(examinationId);
  if (!exam) {
    res.status(404).json({ error: 'Examination not found.' });
    return;
  }

  const user = req.authUser!;
  if (
    !isTeacherAllocatedToSubject({
      user,
      academicYearId: exam.academic_year_id,
      termId: exam.term_id,
      classId,
      streamId,
      subjectId,
    })
  ) {
    res.status(403).json({
      error: 'Forbidden: You cannot modify marks for an unassigned subject or class.',
    });
    return;
  }

  // Check submission lock & optimistic conflict version
  const sub = db
    .prepare(
      `SELECT id, status, version FROM result_submissions
       WHERE examination_id = ? AND class_id = ? AND stream_id = ? AND subject_id = ?`
    )
    .get(examinationId, classId, streamId, subjectId) as
    | { id: number; status: string; version: number }
    | undefined;

  if (sub && ['SUBMITTED', 'VERIFIED', 'APPROVED', 'PUBLISHED'].includes(sub.status)) {
    res.status(409).json({
      error: `Marks are currently locked in status "${sub.status}". Return or authorized correction is required.`,
    });
    return;
  }

  if (sub && expectedVersion && sub.version !== expectedVersion) {
    res.status(409).json({
      error: 'Concurrent edit detected. Refresh the marks sheet before saving.',
      currentVersion: sub.version,
    });
    return;
  }

  // Validate against configured max_marks
  const categories = db
    .prepare(`SELECT id, code, max_marks FROM assessment_categories WHERE examination_id = ?`)
    .all(examinationId) as Array<{ id: number; code: string; max_marks: number }>;
  const catMap = new Map(categories.map((c) => [c.id, c]));

  for (const e of entries) {
    const cat = catMap.get(e.assessmentCategoryId);
    if (!cat) {
      res.status(400).json({ error: `Invalid assessment category ID ${e.assessmentCategoryId}.` });
      return;
    }
    if (e.statusFlag === 'PRESENT' && e.score !== null) {
      if (e.score < 0 || e.score > cat.max_marks) {
        res.status(400).json({
          error: `Score ${e.score} for ${cat.code} exceeds configured maximum of ${cat.max_marks}.`,
        });
        return;
      }
    }
  }

  const nextVersion = (sub?.version ?? 1) + 1;
  db.transaction(() => {
    const upsertMark = db.prepare(`
      INSERT INTO marks (
        examination_id, student_id, class_id, stream_id, subject_id, assessment_category_id,
        score, status_flag, entered_by, updated_by, version, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
      ON CONFLICT(examination_id, student_id, subject_id, assessment_category_id)
      DO UPDATE SET
        score = excluded.score,
        status_flag = excluded.status_flag,
        updated_by = excluded.updated_by,
        version = marks.version + 1,
        updated_at = datetime('now')
    `);

    for (const e of entries) {
      const normalizedScore = e.statusFlag === 'PRESENT' ? e.score : null;
      upsertMark.run(
        examinationId,
        e.studentId,
        classId,
        streamId,
        subjectId,
        e.assessmentCategoryId,
        normalizedScore,
        e.statusFlag,
        user.id,
        user.id
      );
    }

    db.prepare(`
      INSERT INTO result_submissions (examination_id, class_id, stream_id, subject_id, submitted_by, status, version)
      VALUES (?, ?, ?, ?, ?, 'DRAFT', ?)
      ON CONFLICT(examination_id, class_id, stream_id, subject_id)
      DO UPDATE SET version = excluded.version
    `).run(examinationId, classId, streamId, subjectId, user.id, nextVersion);

    recalculateExaminationClass(examinationId, classId);
  })();

  res.json({
    savedCount: entries.length,
    version: nextVersion,
    savedAt: new Date().toISOString(),
  });
});

marksRouter.get('/import-template', async (req, res) => {
  const examinationId = Number(req.query.examinationId);
  const classId = Number(req.query.classId);
  const streamId = Number(req.query.streamId);
  const subjectId = Number(req.query.subjectId);

  const exam = getExamContext(examinationId);
  if (!exam) {
    res.status(404).json({ error: 'Examination not found.' });
    return;
  }

  const cls = db.prepare(`SELECT name, code FROM classes WHERE id = ?`).get(classId) as {
    name: string;
    code: string;
  };
  const str = db.prepare(`SELECT name FROM streams WHERE id = ?`).get(streamId) as { name: string };
  const subj = db.prepare(`SELECT name, code FROM subjects WHERE id = ?`).get(subjectId) as {
    name: string;
    code: string;
  };

  const categories = db
    .prepare(
      `SELECT code, name, max_marks FROM assessment_categories WHERE examination_id = ? ORDER BY sort_order ASC`
    )
    .all(examinationId) as Array<{ code: string; name: string; max_marks: number }>;

  const students = db
    .prepare(
      `SELECT s.admission_number, s.first_name || ' ' || s.last_name AS full_name
       FROM student_enrolments se JOIN students s ON s.id = se.student_id
       WHERE se.academic_year_id = ? AND se.term_id = ? AND se.class_id = ? AND se.stream_id = ?
         AND se.status = 'ENROLLED' AND s.status = 'ACTIVE'
       ORDER BY s.last_name ASC, s.first_name ASC`
    )
    .all(exam.academic_year_id, exam.term_id, classId, streamId) as Array<{
    admission_number: string;
    full_name: string;
  }>;

  const buf = await buildMarksTemplateWorkbook({
    examName: exam.name,
    className: cls?.name || '',
    streamName: str?.name || '',
    subjectName: subj?.name || '',
    categories,
    students,
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="BGS_Marks_Template_${cls?.code}_${str?.name}_${subj?.code}.xlsx"`
  );
  res.send(buf);
});

marksRouter.post(
  '/import/preview',
  requirePermission('marks.enter'),
  uploadMemory.single('file'),
  async (req, res) => {
    const examinationId = Number(req.body.examinationId);
    const classId = Number(req.body.classId);
    const streamId = Number(req.body.streamId);
    const subjectId = Number(req.body.subjectId);

    if (!req.file || !examinationId || !classId || !streamId || !subjectId) {
      res.status(400).json({ error: 'File and examination/class/stream/subject selection are required.' });
      return;
    }

    const exam = getExamContext(examinationId);
    if (!exam) {
      res.status(404).json({ error: 'Examination not found.' });
      return;
    }

    if (
      !isTeacherAllocatedToSubject({
        user: req.authUser!,
        academicYearId: exam.academic_year_id,
        termId: exam.term_id,
        classId,
        streamId,
        subjectId,
      })
    ) {
      res.status(403).json({ error: 'Access denied for this subject allocation.' });
      return;
    }

    const categories = db
      .prepare(
        `SELECT id, code, name, max_marks FROM assessment_categories WHERE examination_id = ? ORDER BY sort_order ASC`
      )
      .all(examinationId) as Array<{ id: number; code: string; name: string; max_marks: number }>;

    const enrolled = db
      .prepare(
        `SELECT s.id, s.admission_number, s.first_name || ' ' || s.last_name AS full_name
         FROM student_enrolments se JOIN students s ON s.id = se.student_id
         WHERE se.academic_year_id = ? AND se.term_id = ? AND se.class_id = ? AND se.stream_id = ?`
      )
      .all(exam.academic_year_id, exam.term_id, classId, streamId) as Array<{
      id: number;
      admission_number: string;
      full_name: string;
    }>;

    const studentMap = new Map(enrolled.map((s) => [s.admission_number.toUpperCase(), s]));
    const rawRows = await parseSpreadsheetBuffer(req.file.buffer, req.file.originalname);

    // Find header row starting with Admission Number
    const headerIdx = rawRows.findIndex((r) =>
      (r[0] || '').toLowerCase().includes('admission')
    );
    const dataRows = headerIdx >= 0 ? rawRows.slice(headerIdx + 1) : rawRows.slice(1);

    const seenAdm = new Set<string>();
    const preview = dataRows.map((cols, idx) => {
      const admNo = (cols[0] || '').trim().toUpperCase();
      const stu = studentMap.get(admNo);
      const errors: string[] = [];

      if (!admNo) errors.push('Missing admission number');
      else if (!stu) errors.push(`Student ${admNo} not enrolled in this class/stream`);
      else if (seenAdm.has(admNo)) errors.push(`Duplicate admission number ${admNo}`);
      if (admNo) seenAdm.add(admNo);

      const statusCol = (cols[2 + categories.length] || 'PRESENT').trim().toUpperCase();
      const statusFlag = ['PRESENT', 'ABSENT', 'EXEMPTED'].includes(statusCol)
        ? (statusCol as 'PRESENT' | 'ABSENT' | 'EXEMPTED')
        : 'PRESENT';

      const scores: Record<number, number | null> = {};
      categories.forEach((cat, cIdx) => {
        const rawVal = cols[2 + cIdx];
        if (rawVal === undefined || rawVal === '') {
          scores[cat.id] = null;
          if (statusFlag === 'PRESENT') {
            errors.push(`Missing ${cat.code}`);
          }
        } else {
          const num = Number(rawVal);
          if (Number.isNaN(num) || num < 0 || num > cat.max_marks) {
            errors.push(`${cat.code} (${rawVal}) out of range 0–${cat.max_marks}`);
            scores[cat.id] = null;
          } else {
            scores[cat.id] = num;
          }
        }
      });

      return {
        rowNumber: (headerIdx >= 0 ? headerIdx + 2 : 2) + idx,
        admissionNumber: admNo,
        studentId: stu?.id || null,
        studentName: stu?.full_name || cols[1] || 'Unknown',
        statusFlag,
        scores,
        valid: errors.length === 0,
        errors,
      };
    });

    res.json({
      categories,
      totalRows: preview.length,
      validCount: preview.filter((r) => r.valid).length,
      invalidCount: preview.filter((r) => !r.valid).length,
      rows: preview,
    });
  }
);

marksRouter.post('/import/commit', requirePermission('marks.enter'), (req, res) => {
  const schema = z.object({
    examinationId: z.number().int().positive(),
    classId: z.number().int().positive(),
    streamId: z.number().int().positive(),
    subjectId: z.number().int().positive(),
    rows: z.array(
      z.object({
        studentId: z.number().int().positive(),
        statusFlag: z.enum(['PRESENT', 'ABSENT', 'EXEMPTED']),
        scores: z.record(z.string(), z.number().nullable()),
        valid: z.boolean(),
      })
    ),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid import commit payload.' });
    return;
  }

  const { examinationId, classId, streamId, subjectId, rows } = parsed.data;
  const exam = getExamContext(examinationId);
  if (!exam) {
    res.status(404).json({ error: 'Examination not found.' });
    return;
  }

  if (
    !isTeacherAllocatedToSubject({
      user: req.authUser!,
      academicYearId: exam.academic_year_id,
      termId: exam.term_id,
      classId,
      streamId,
      subjectId,
    })
  ) {
    res.status(403).json({ error: 'Access denied.' });
    return;
  }

  const sub = db
    .prepare(
      `SELECT status FROM result_submissions WHERE examination_id = ? AND class_id = ? AND stream_id = ? AND subject_id = ?`
    )
    .get(examinationId, classId, streamId, subjectId) as { status: string } | undefined;

  if (sub && ['SUBMITTED', 'VERIFIED', 'APPROVED', 'PUBLISHED'].includes(sub.status)) {
    res.status(409).json({ error: `Cannot import into locked "${sub.status}" marks.` });
    return;
  }

  const validRows = rows.filter((r) => r.valid);
  db.transaction(() => {
    const upsert = db.prepare(`
      INSERT INTO marks (
        examination_id, student_id, class_id, stream_id, subject_id, assessment_category_id,
        score, status_flag, entered_by, updated_by, version, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
      ON CONFLICT(examination_id, student_id, subject_id, assessment_category_id)
      DO UPDATE SET score = excluded.score, status_flag = excluded.status_flag, updated_by = excluded.updated_by, version = marks.version + 1, updated_at = datetime('now')
    `);

    for (const r of validRows) {
      for (const [catIdStr, score] of Object.entries(r.scores)) {
        upsert.run(
          examinationId,
          r.studentId,
          classId,
          streamId,
          subjectId,
          Number(catIdStr),
          r.statusFlag === 'PRESENT' ? score : null,
          r.statusFlag,
          req.authUser!.id,
          req.authUser!.id
        );
      }
    }

    db.prepare(`
      INSERT INTO result_submissions (examination_id, class_id, stream_id, subject_id, submitted_by, status)
      VALUES (?, ?, ?, ?, ?, 'DRAFT')
      ON CONFLICT(examination_id, class_id, stream_id, subject_id) DO NOTHING
    `).run(examinationId, classId, streamId, subjectId, req.authUser!.id);

    recalculateExaminationClass(examinationId, classId);
  })();

  recordAuditLog({
    userId: req.authUser!.id,
    userName: req.authUser!.fullName,
    userRole: req.authUser!.primaryRole,
    action: 'MARKS_EXCEL_IMPORTED',
    entityType: 'marks',
    entityId: `${examinationId}:${classId}:${streamId}:${subjectId}`,
    newValue: { importedStudents: validRows.length },
    ipAddress: req.ip,
  });

  res.json({ importedStudents: validRows.length });
});

marksRouter.post('/submit', requirePermission('marks.enter'), (req, res) => {
  const schema = z.object({
    examinationId: z.number().int().positive(),
    classId: z.number().int().positive(),
    streamId: z.number().int().positive(),
    subjectId: z.number().int().positive(),
    teacherNotes: z.string().max(500).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid submission request.' });
    return;
  }

  const { examinationId, classId, streamId, subjectId, teacherNotes } = parsed.data;
  const exam = getExamContext(examinationId);
  if (!exam) {
    res.status(404).json({ error: 'Examination not found.' });
    return;
  }

  if (
    !isTeacherAllocatedToSubject({
      user: req.authUser!,
      academicYearId: exam.academic_year_id,
      termId: exam.term_id,
      classId,
      streamId,
      subjectId,
    })
  ) {
    res.status(403).json({ error: 'Forbidden: You can only submit your assigned subjects.' });
    return;
  }

  const subId = db.transaction(() => {
    recalculateExaminationClass(examinationId, classId);
    db.prepare(`
      INSERT INTO result_submissions (
        examination_id, class_id, stream_id, subject_id, submitted_by, status, teacher_notes, submitted_at, version
      ) VALUES (?, ?, ?, ?, ?, 'SUBMITTED', ?, datetime('now'), 1)
      ON CONFLICT(examination_id, class_id, stream_id, subject_id)
      DO UPDATE SET
        submitted_by = excluded.submitted_by,
        status = 'SUBMITTED',
        teacher_notes = excluded.teacher_notes,
        submitted_at = datetime('now'),
        version = result_submissions.version + 1
    `).run(examinationId, classId, streamId, subjectId, req.authUser!.id, teacherNotes || null);

    const row = db
      .prepare(
        `SELECT id FROM result_submissions WHERE examination_id = ? AND class_id = ? AND stream_id = ? AND subject_id = ?`
      )
      .get(examinationId, classId, streamId, subjectId) as { id: number };

    db.prepare(
      `INSERT INTO result_approvals (submission_id, actor_user_id, actor_role, action, comments)
       VALUES (?, ?, ?, 'SUBMITTED', ?)`
    ).run(row.id, req.authUser!.id, req.authUser!.primaryRole, teacherNotes || 'Submitted for DOS review');

    return row.id;
  })();

  notifyRoleUsers(
    'DOS',
    'New Marks Submitted',
    `${req.authUser!.fullName} submitted marks for review.`,
    'SUBMISSION',
    '/results/verification'
  );

  recordAuditLog({
    userId: req.authUser!.id,
    userName: req.authUser!.fullName,
    userRole: req.authUser!.primaryRole,
    action: 'MARKS_SUBMITTED',
    entityType: 'result_submission',
    entityId: subId,
    ipAddress: req.ip,
  });

  res.json({ message: 'Marks submitted to Director of Studies for verification.', submissionId: subId });
});

marksRouter.get('/submissions', (req, res) => {
  const examinationId = req.query.examinationId ? Number(req.query.examinationId) : null;
  const classId = req.query.classId ? Number(req.query.classId) : null;
  const status = req.query.status ? String(req.query.status) : null;

  const activeExam = examinationId
    ? { id: examinationId }
    : (db
        .prepare(
          `SELECT id FROM examinations WHERE is_active = 1 ORDER BY id DESC LIMIT 1`
        )
        .get() as { id: number } | undefined);

  const conditions = ['rs.examination_id = ?'];
  const params: unknown[] = [activeExam?.id ?? 0];
  if (classId) {
    conditions.push('rs.class_id = ?');
    params.push(classId);
  }
  if (status) {
    conditions.push('rs.status = ?');
    params.push(status);
  }

  const rows = db
    .prepare(
      `SELECT rs.*, c.name AS class_name, c.code AS class_code, st.name AS stream_name,
              sub.code AS subject_code, sub.name AS subject_name,
              u.full_name AS submitted_by_name,
              v.full_name AS verified_by_name,
              a.full_name AS approved_by_name,
              (SELECT COUNT(*) FROM student_enrolments se
               JOIN examinations e ON e.id = rs.examination_id
               WHERE se.academic_year_id = e.academic_year_id AND se.term_id = e.term_id
                 AND se.class_id = rs.class_id AND se.stream_id = rs.stream_id AND se.status = 'ENROLLED') AS student_count,
              (SELECT ROUND(AVG(sr.weighted_total), 1) FROM subject_results sr
               WHERE sr.examination_id = rs.examination_id AND sr.class_id = rs.class_id
                 AND sr.stream_id = rs.stream_id AND sr.subject_id = rs.subject_id AND sr.weighted_total IS NOT NULL) AS subject_average
       FROM result_submissions rs
       JOIN classes c ON c.id = rs.class_id
       JOIN streams st ON st.id = rs.stream_id
       JOIN subjects sub ON sub.id = rs.subject_id
       LEFT JOIN users u ON u.id = rs.submitted_by
       LEFT JOIN users v ON v.id = rs.verified_by
       LEFT JOIN users a ON a.id = rs.approved_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY c.sort_order ASC, st.name ASC, sub.name ASC`
    )
    .all(...params);

  res.json({ examinationId: activeExam?.id ?? null, submissions: rows });
});

marksRouter.post('/verify', requirePermission('marks.verify'), (req, res) => {
  const schema = z.object({
    submissionId: z.number().int().positive(),
    decision: z.enum(['VERIFIED', 'RETURNED']),
    comments: z.string().max(500).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid verification payload.' });
    return;
  }

  const sub = db
    .prepare(`SELECT * FROM result_submissions WHERE id = ?`)
    .get(parsed.data.submissionId) as
    | { id: number; status: string; submitted_by: number | null; examination_id: number; class_id: number }
    | undefined;

  if (!sub) {
    res.status(404).json({ error: 'Submission record not found.' });
    return;
  }

  // Prevent teacher from verifying/approving their own submission unless System Admin
  if (
    sub.submitted_by === req.authUser!.id &&
    !req.authUser!.roles.includes('SYSTEM_ADMIN') &&
    parsed.data.decision === 'VERIFIED'
  ) {
    res.status(403).json({ error: 'You cannot verify your own marks submission.' });
    return;
  }

  if (parsed.data.decision === 'RETURNED' && !parsed.data.comments?.trim()) {
    res.status(400).json({ error: 'A clear reason is required when returning marks for correction.' });
    return;
  }

  db.transaction(() => {
    if (parsed.data.decision === 'VERIFIED') {
      recalculateExaminationClass(sub.examination_id, sub.class_id);
      db.prepare(
        `UPDATE result_submissions
         SET status = 'VERIFIED', dos_notes = ?, verified_by = ?, verified_at = datetime('now'), version = version + 1
         WHERE id = ?`
      ).run(parsed.data.comments || 'Verified by DOS', req.authUser!.id, sub.id);
    } else {
      db.prepare(
        `UPDATE result_submissions
         SET status = 'RETURNED', dos_notes = ?, version = version + 1
         WHERE id = ?`
      ).run(parsed.data.comments!, sub.id);
    }

    db.prepare(
      `INSERT INTO result_approvals (submission_id, actor_user_id, actor_role, action, comments)
       VALUES (?, ?, ?, ?, ?)`
    ).run(sub.id, req.authUser!.id, req.authUser!.primaryRole, parsed.data.decision, parsed.data.comments || null);
  })();

  if (parsed.data.decision === 'RETURNED' && sub.submitted_by) {
    createNotification({
      userId: sub.submitted_by,
      title: 'Marks Returned for Correction',
      message: parsed.data.comments || 'DOS returned your submission for correction.',
      category: 'RETURNED',
      link: '/marks/entry',
    });
  } else if (parsed.data.decision === 'VERIFIED') {
    notifyRoleUsers(
      'HEAD_TEACHER',
      'Results Verified & Ready for Approval',
      'Subject marks have been verified by DOS and await Head Teacher approval.',
      'APPROVAL',
      '/results/approval'
    );
  }

  recordAuditLog({
    userId: req.authUser!.id,
    userName: req.authUser!.fullName,
    userRole: req.authUser!.primaryRole,
    action: `SUBMISSION_${parsed.data.decision}`,
    entityType: 'result_submission',
    entityId: sub.id,
    reason: parsed.data.comments,
    ipAddress: req.ip,
  });

  res.json({ message: `Submission marked as ${parsed.data.decision}.` });
});

marksRouter.post('/approve', requirePermission('results.approve'), (req, res) => {
  const schema = z.object({
    submissionIds: z.array(z.number().int().positive()).min(1),
    decision: z.enum(['APPROVED', 'PUBLISHED', 'RETURNED']),
    comments: z.string().max(500).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid approval payload.' });
    return;
  }

  db.transaction(() => {
    for (const id of parsed.data.submissionIds) {
      const sub = db
        .prepare(`SELECT * FROM result_submissions WHERE id = ?`)
        .get(id) as { id: number; status: string; examination_id: number; class_id: number } | undefined;
      if (!sub) continue;

      if (parsed.data.decision === 'APPROVED') {
        recalculateExaminationClass(sub.examination_id, sub.class_id);
        db.prepare(
          `UPDATE result_submissions
           SET status = 'APPROVED', headteacher_notes = ?, approved_by = ?, approved_at = datetime('now'), version = version + 1
           WHERE id = ?`
        ).run(parsed.data.comments || 'Approved by Head Teacher', req.authUser!.id, id);
      } else if (parsed.data.decision === 'PUBLISHED') {
        recalculateExaminationClass(sub.examination_id, sub.class_id);
        db.prepare(
          `UPDATE result_submissions
           SET status = 'PUBLISHED', headteacher_notes = COALESCE(?, headteacher_notes),
               approved_by = COALESCE(approved_by, ?), approved_at = COALESCE(approved_at, datetime('now')),
               published_at = datetime('now'), version = version + 1
           WHERE id = ?`
        ).run(parsed.data.comments || null, req.authUser!.id, id);
      } else {
        db.prepare(
          `UPDATE result_submissions SET status = 'RETURNED', headteacher_notes = ?, version = version + 1 WHERE id = ?`
        ).run(parsed.data.comments || 'Returned by Head Teacher', id);
      }

      db.prepare(
        `INSERT INTO result_approvals (submission_id, actor_user_id, actor_role, action, comments)
         VALUES (?, ?, ?, ?, ?)`
      ).run(id, req.authUser!.id, req.authUser!.primaryRole, parsed.data.decision, parsed.data.comments || null);
    }
  })();

  recordAuditLog({
    userId: req.authUser!.id,
    userName: req.authUser!.fullName,
    userRole: req.authUser!.primaryRole,
    action: `RESULTS_${parsed.data.decision}`,
    entityType: 'result_submission',
    newValue: parsed.data,
    reason: parsed.data.comments,
    ipAddress: req.ip,
  });

  res.json({ message: `${parsed.data.submissionIds.length} submission(s) updated to ${parsed.data.decision}.` });
});

marksRouter.post('/correct-approved', requirePermission('results.correct_approved'), (req, res) => {
  const schema = z.object({
    examinationId: z.number().int().positive(),
    classId: z.number().int().positive(),
    streamId: z.number().int().positive(),
    subjectId: z.number().int().positive(),
    studentId: z.number().int().positive(),
    assessmentCategoryId: z.number().int().positive(),
    newScore: z.number().min(0),
    reason: z.string().min(5).max(255),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Correction requires valid score and a detailed reason (5+ chars).' });
    return;
  }

  const { examinationId, classId, streamId, subjectId, studentId, assessmentCategoryId, newScore, reason } =
    parsed.data;

  const cat = db
    .prepare(`SELECT max_marks FROM assessment_categories WHERE id = ? AND examination_id = ?`)
    .get(assessmentCategoryId, examinationId) as { max_marks: number } | undefined;

  if (!cat || newScore > cat.max_marks) {
    res.status(400).json({ error: `Score exceeds category maximum (${cat?.max_marks ?? 100}).` });
    return;
  }

  let prevScore: number | null = null;
  db.transaction(() => {
    const prev = db
      .prepare(
        `SELECT score FROM marks WHERE examination_id = ? AND student_id = ? AND subject_id = ? AND assessment_category_id = ?`
      )
      .get(examinationId, studentId, subjectId, assessmentCategoryId) as { score: number | null } | undefined;
    prevScore = prev?.score ?? null;

    db.prepare(`
      INSERT INTO marks (
        examination_id, student_id, class_id, stream_id, subject_id, assessment_category_id,
        score, status_flag, entered_by, updated_by, version, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PRESENT', ?, ?, 1, datetime('now'))
      ON CONFLICT(examination_id, student_id, subject_id, assessment_category_id)
      DO UPDATE SET score = excluded.score, status_flag = 'PRESENT', updated_by = excluded.updated_by, version = marks.version + 1, updated_at = datetime('now')
    `).run(examinationId, studentId, classId, streamId, subjectId, assessmentCategoryId, newScore, req.authUser!.id, req.authUser!.id);

    const sub = db
      .prepare(
        `SELECT id FROM result_submissions WHERE examination_id = ? AND class_id = ? AND stream_id = ? AND subject_id = ?`
      )
      .get(examinationId, classId, streamId, subjectId) as { id: number } | undefined;

    db.prepare(
      `INSERT INTO result_versions (
        submission_id, examination_id, student_id, subject_id, assessment_category_id,
        previous_score, new_score, reason, changed_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(sub?.id ?? null, examinationId, studentId, subjectId, assessmentCategoryId, prevScore, newScore, reason, req.authUser!.id);

    recalculateExaminationClass(examinationId, classId);
  })();

  recordAuditLog({
    userId: req.authUser!.id,
    userName: req.authUser!.fullName,
    userRole: req.authUser!.primaryRole,
    action: 'APPROVED_MARK_CORRECTED',
    entityType: 'marks',
    entityId: `${examinationId}:${studentId}:${subjectId}`,
    previousValue: { score: prevScore },
    newValue: { score: newScore },
    reason,
    ipAddress: req.ip,
  });

  res.json({ message: 'Authorized mark correction saved and class results recalculated.' });
});

marksRouter.get('/published', (req, res) => {
  const examinationId = Number(req.query.examinationId);
  const classId = Number(req.query.classId);
  const streamId = req.query.streamId ? Number(req.query.streamId) : null;

  if (!examinationId || !classId) {
    res.status(400).json({ error: 'examinationId and classId are required.' });
    return;
  }

  const exam = getExamContext(examinationId);
  if (!exam) {
    res.status(404).json({ error: 'Examination not found.' });
    return;
  }

  const summaries = db
    .prepare(
      `SELECT ses.*, s.admission_number, s.first_name, s.last_name, s.gender,
              st.name AS stream_name,
              tc.class_teacher_comment, tc.head_teacher_comment,
              att.total_days, att.days_present, att.days_absent
       FROM student_exam_summaries ses
       JOIN students s ON s.id = ses.student_id
       JOIN streams st ON st.id = ses.stream_id
       LEFT JOIN teacher_comments tc ON tc.examination_id = ses.examination_id AND tc.student_id = ses.student_id
       LEFT JOIN attendance att ON att.term_id = ? AND att.student_id = ses.student_id
       WHERE ses.examination_id = ? AND ses.class_id = ? ${streamId ? 'AND ses.stream_id = ?' : ''}
       ORDER BY COALESCE(ses.class_position, 9999) ASC, s.last_name ASC`
    )
    .all(...(streamId ? [exam.term_id, examinationId, classId, streamId] : [exam.term_id, examinationId, classId]));

  const subjectScores = db
    .prepare(
      `SELECT sr.student_id, sub.code AS subject_code, sr.weighted_total, sr.grade
       FROM subject_results sr
       JOIN subjects sub ON sub.id = sr.subject_id
       WHERE sr.examination_id = ? AND sr.class_id = ? ${streamId ? 'AND sr.stream_id = ?' : ''}`
    )
    .all(...(streamId ? [examinationId, classId, streamId] : [examinationId, classId]));

  const subjects = db
    .prepare(
      `SELECT sub.id, sub.code, sub.name, sub.short_name
       FROM class_subjects cs JOIN subjects sub ON sub.id = cs.subject_id
       WHERE cs.class_id = ? ORDER BY sub.is_core DESC, sub.name ASC`
    )
    .all(classId);

  res.json({ exam, subjects, summaries, subjectScores });
});

marksRouter.post('/comments-attendance', requirePermission('comments.manage', 'headteacher.remarks'), (req, res) => {
  const schema = z.object({
    examinationId: z.number().int().positive(),
    classId: z.number().int().positive(),
    streamId: z.number().int().positive(),
    studentId: z.number().int().positive(),
    classTeacherComment: z.string().max(400).optional(),
    headTeacherComment: z.string().max(400).optional(),
    totalDays: z.number().int().min(0).max(200).optional(),
    daysPresent: z.number().int().min(0).max(200).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid comment or attendance entry.' });
    return;
  }

  const exam = getExamContext(parsed.data.examinationId);
  if (!exam) {
    res.status(404).json({ error: 'Examination not found.' });
    return;
  }

  const user = req.authUser!;
  if (
    !isClassTeacherForStream({
      user,
      academicYearId: exam.academic_year_id,
      termId: exam.term_id,
      classId: parsed.data.classId,
      streamId: parsed.data.streamId,
    })
  ) {
    res.status(403).json({ error: 'Access denied. You are not assigned to this class stream.' });
    return;
  }

  db.transaction(() => {
    if (parsed.data.classTeacherComment !== undefined || parsed.data.headTeacherComment !== undefined) {
      const canHead = user.roles.includes('HEAD_TEACHER') || user.roles.includes('SYSTEM_ADMIN');
      db.prepare(`
        INSERT INTO teacher_comments (examination_id, student_id, class_teacher_comment, head_teacher_comment, updated_by, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(examination_id, student_id)
        DO UPDATE SET
          class_teacher_comment = COALESCE(?, teacher_comments.class_teacher_comment),
          head_teacher_comment = COALESCE(?, teacher_comments.head_teacher_comment),
          updated_by = excluded.updated_by,
          updated_at = datetime('now')
      `).run(
        parsed.data.examinationId,
        parsed.data.studentId,
        parsed.data.classTeacherComment ?? null,
        canHead ? (parsed.data.headTeacherComment ?? null) : null,
        user.id,
        parsed.data.classTeacherComment ?? null,
        canHead ? (parsed.data.headTeacherComment ?? null) : null
      );
    }

    if (parsed.data.totalDays !== undefined && parsed.data.daysPresent !== undefined) {
      const absent = Math.max(0, parsed.data.totalDays - parsed.data.daysPresent);
      db.prepare(`
        INSERT INTO attendance (academic_year_id, term_id, student_id, total_days, days_present, days_absent, recorded_by, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(term_id, student_id)
        DO UPDATE SET
          total_days = excluded.total_days,
          days_present = excluded.days_present,
          days_absent = excluded.days_absent,
          recorded_by = excluded.recorded_by,
          updated_at = datetime('now')
      `).run(
        exam.academic_year_id,
        exam.term_id,
        parsed.data.studentId,
        parsed.data.totalDays,
        parsed.data.daysPresent,
        absent,
        user.id
      );
    }
  })();

  res.json({ message: 'Comments and attendance saved.' });
});
