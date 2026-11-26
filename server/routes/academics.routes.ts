import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { createNotification, recordAuditLog } from '../middleware/audit.js';
import { authenticate, requirePermission } from '../middleware/auth.js';

export const academicsRouter = Router();
academicsRouter.use(authenticate);

// === ACADEMIC YEARS & TERMS ===
academicsRouter.get('/years-terms', (_req, res) => {
  const years = db.prepare(`SELECT * FROM academic_years ORDER BY year_label DESC`).all();
  const terms = db
    .prepare(
      `SELECT t.*, ay.year_label
       FROM terms t JOIN academic_years ay ON ay.id = t.academic_year_id
       ORDER BY ay.year_label DESC, t.term_number ASC`
    )
    .all();
  res.json({ years, terms });
});

academicsRouter.post('/years', requirePermission('academics.manage'), (req, res) => {
  const schema = z.object({
    yearLabel: z.string().min(4).max(20),
    startDate: z.string().min(4),
    endDate: z.string().min(4),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid academic year data.' });
    return;
  }

  const yearId = db.transaction(() => {
    const r = db
      .prepare(`INSERT INTO academic_years (year_label, start_date, end_date, is_active) VALUES (?, ?, ?, 0)`)
      .run(parsed.data.yearLabel.trim(), parsed.data.startDate, parsed.data.endDate);
    const id = Number(r.lastInsertRowid);
    // Auto-seed Term I, II, III placeholders for convenience
    const insertT = db.prepare(
      `INSERT INTO terms (academic_year_id, name, term_number, start_date, end_date, is_active) VALUES (?, ?, ?, ?, ?, 0)`
    );
    insertT.run(id, 'Term I', 1, parsed.data.startDate, parsed.data.endDate);
    insertT.run(id, 'Term II', 2, parsed.data.startDate, parsed.data.endDate);
    insertT.run(id, 'Term III', 3, parsed.data.startDate, parsed.data.endDate);
    return id;
  })();

  recordAuditLog({
    userId: req.authUser!.id,
    userName: req.authUser!.fullName,
    userRole: req.authUser!.primaryRole,
    action: 'ACADEMIC_YEAR_CREATED',
    entityType: 'academic_year',
    entityId: yearId,
    newValue: parsed.data,
    ipAddress: req.ip,
  });

  res.status(201).json({ id: yearId });
});

academicsRouter.post('/terms/:id/activate', requirePermission('academics.manage'), (req, res) => {
  const termId = Number(req.params.id);
  const term = db.prepare(`SELECT * FROM terms WHERE id = ?`).get(termId) as
    | { id: number; academic_year_id: number; name: string }
    | undefined;
  if (!term) {
    res.status(404).json({ error: 'Term not found.' });
    return;
  }

  db.transaction(() => {
    db.prepare(`UPDATE academic_years SET is_active = 0`).run();
    db.prepare(`UPDATE academic_years SET is_active = 1, is_archived = 0 WHERE id = ?`).run(
      term.academic_year_id
    );
    db.prepare(`UPDATE terms SET is_active = 0`).run();
    db.prepare(`UPDATE terms SET is_active = 1, is_archived = 0 WHERE id = ?`).run(termId);
  })();

  recordAuditLog({
    userId: req.authUser!.id,
    userName: req.authUser!.fullName,
    userRole: req.authUser!.primaryRole,
    action: 'TERM_ACTIVATED',
    entityType: 'term',
    entityId: termId,
    ipAddress: req.ip,
  });

  res.json({ message: `${term.name} is now the active academic period.` });
});

academicsRouter.put('/terms/:id', requirePermission('academics.manage'), (req, res) => {
  const termId = Number(req.params.id);
  const schema = z.object({
    startDate: z.string(),
    endDate: z.string(),
    nextTermBegins: z.string().optional().nullable(),
    isArchived: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid term schedule details.' });
    return;
  }
  db.prepare(
    `UPDATE terms SET start_date = ?, end_date = ?, next_term_begins = ?, is_archived = COALESCE(?, is_archived) WHERE id = ?`
  ).run(
    parsed.data.startDate,
    parsed.data.endDate,
    parsed.data.nextTermBegins || null,
    parsed.data.isArchived !== undefined ? (parsed.data.isArchived ? 1 : 0) : null,
    termId
  );
  res.json({ message: 'Term dates updated.' });
});

// === CLASSES & STREAMS ===
academicsRouter.get('/classes-streams', (_req, res) => {
  const classes = db.prepare(`SELECT * FROM classes ORDER BY sort_order ASC`).all() as Array<
    Record<string, unknown>
  >;
  const streams = db
    .prepare(
      `SELECT st.*, c.name AS class_name, c.code AS class_code,
              (SELECT COUNT(*) FROM student_enrolments se
               WHERE se.stream_id = st.id
                 AND se.term_id = (SELECT id FROM terms WHERE is_active = 1 LIMIT 1)
                 AND se.status = 'ENROLLED') AS student_count,
              (SELECT u.full_name FROM teacher_allocations ta
               JOIN teachers t ON t.id = ta.teacher_id
               JOIN users u ON u.id = t.user_id
               WHERE ta.stream_id = st.id AND ta.is_class_teacher = 1 AND ta.is_active = 1
                 AND ta.term_id = (SELECT id FROM terms WHERE is_active = 1 LIMIT 1)
               LIMIT 1) AS class_teacher_name
       FROM streams st
       JOIN classes c ON c.id = st.class_id
       ORDER BY c.sort_order ASC, st.name ASC`
    )
    .all();

  res.json({ classes, streams });
});

academicsRouter.post('/classes', requirePermission('academics.manage'), (req, res) => {
  const schema = z.object({
    name: z.string().min(2).max(60),
    code: z.string().min(2).max(20),
    level: z.string().min(2).max(30),
    sortOrder: z.number().int().default(10),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid class payload.' });
    return;
  }
  const r = db
    .prepare(`INSERT INTO classes (name, code, level, sort_order) VALUES (?, ?, ?, ?)`)
    .run(parsed.data.name.trim(), parsed.data.code.trim(), parsed.data.level.trim(), parsed.data.sortOrder);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

academicsRouter.post('/streams', requirePermission('academics.manage'), (req, res) => {
  const schema = z.object({
    classId: z.number().int().positive(),
    name: z.string().min(1).max(40),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid stream payload.' });
    return;
  }
  const r = db
    .prepare(`INSERT INTO streams (class_id, name) VALUES (?, ?)`)
    .run(parsed.data.classId, parsed.data.name.trim());
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

// === SUBJECTS ===
academicsRouter.get('/subjects', (_req, res) => {
  const subjects = db.prepare(`SELECT * FROM subjects ORDER BY is_core DESC, name ASC`).all();
  const classSubjects = db
    .prepare(
      `SELECT cs.*, c.code AS class_code, s.code AS subject_code, s.name AS subject_name
       FROM class_subjects cs
       JOIN classes c ON c.id = cs.class_id
       JOIN subjects s ON s.id = cs.subject_id`
    )
    .all();
  res.json({ subjects, classSubjects });
});

academicsRouter.post('/subjects', requirePermission('academics.manage'), (req, res) => {
  const schema = z.object({
    code: z.string().min(2).max(20),
    name: z.string().min(2).max(120),
    shortName: z.string().max(30).optional(),
    department: z.string().min(2).max(80),
    isCore: z.boolean().default(true),
    classIds: z.array(z.number().int().positive()).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid subject payload.' });
    return;
  }
  const subjectId = db.transaction(() => {
    const r = db
      .prepare(
        `INSERT INTO subjects (code, name, short_name, department, is_core, is_active) VALUES (?, ?, ?, ?, ?, 1)`
      )
      .run(
        parsed.data.code.trim().toUpperCase(),
        parsed.data.name.trim(),
        parsed.data.shortName?.trim() || parsed.data.name.trim().slice(0, 20),
        parsed.data.department.trim(),
        parsed.data.isCore ? 1 : 0
      );
    const id = Number(r.lastInsertRowid);
    if (parsed.data.classIds?.length) {
      const stmt = db.prepare(`INSERT OR IGNORE INTO class_subjects (class_id, subject_id, is_compulsory) VALUES (?, ?, ?)`);
      for (const cId of parsed.data.classIds) {
        stmt.run(cId, id, parsed.data.isCore ? 1 : 0);
      }
    }
    return id;
  })();
  res.status(201).json({ id: subjectId });
});

academicsRouter.post('/class-subjects', requirePermission('academics.manage'), (req, res) => {
  const schema = z.object({
    classId: z.number().int().positive(),
    subjectIds: z.array(z.number().int().positive()),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid class-subject mapping.' });
    return;
  }
  db.transaction(() => {
    db.prepare(`DELETE FROM class_subjects WHERE class_id = ?`).run(parsed.data.classId);
    const stmt = db.prepare(`INSERT INTO class_subjects (class_id, subject_id, is_compulsory) VALUES (?, ?, 1)`);
    for (const sId of parsed.data.subjectIds) {
      stmt.run(parsed.data.classId, sId);
    }
  })();
  res.json({ message: 'Class subject offering updated.' });
});

// === TEACHERS & ALLOCATIONS ===
academicsRouter.get('/teachers', (_req, res) => {
  const teachers = db
    .prepare(
      `SELECT t.*, u.full_name, u.email, u.phone, u.is_active AS user_active,
              (SELECT COUNT(*) FROM teacher_allocations ta
               WHERE ta.teacher_id = t.id AND ta.is_active = 1
                 AND ta.term_id = (SELECT id FROM terms WHERE is_active = 1 LIMIT 1)) AS active_assignments
       FROM teachers t
       JOIN users u ON u.id = t.user_id
       ORDER BY u.full_name ASC`
    )
    .all();
  res.json({ teachers });
});

academicsRouter.post('/teachers', requirePermission('teachers.manage'), async (req, res) => {
  const schema = z.object({
    fullName: z.string().min(2).max(150),
    email: z.string().email(),
    phone: z.string().max(40).optional(),
    initials: z.string().min(1).max(10),
    qualification: z.string().max(120).optional(),
    specialization: z.string().max(120).optional(),
    department: z.string().max(80).optional(),
    roleCode: z.enum(['SUBJECT_TEACHER', 'CLASS_TEACHER', 'DOS']).default('SUBJECT_TEACHER'),
    initialPassword: z.string().min(8).default('Bgs@2026!'),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid teacher registration fields.' });
    return;
  }

  const existing = db.prepare(`SELECT id FROM users WHERE LOWER(email) = ?`).get(parsed.data.email.toLowerCase());
  if (existing) {
    res.status(409).json({ error: 'A user with this email already exists.' });
    return;
  }

  const passHash = await bcrypt.hash(parsed.data.initialPassword, 10);
  const count = (db.prepare(`SELECT COUNT(*) AS cnt FROM teachers`).get() as { cnt: number }).cnt + 1;
  const staffNo = `BGS-STF-${String(count + 10).padStart(3, '0')}`;

  const teacherId = db.transaction(() => {
    const uRes = db
      .prepare(`INSERT INTO users (full_name, email, phone, password_hash, is_active, must_change_password) VALUES (?, ?, ?, ?, 1, 1)`)
      .run(parsed.data.fullName.trim(), parsed.data.email.trim().toLowerCase(), parsed.data.phone || null, passHash);
    const userId = Number(uRes.lastInsertRowid);
    const role = db.prepare(`SELECT id FROM roles WHERE code = ?`).get(parsed.data.roleCode) as { id: number };
    db.prepare(`INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`).run(userId, role.id);

    const tRes = db
      .prepare(
        `INSERT INTO teachers (user_id, staff_number, initials, qualification, specialization, department, hire_date, status)
         VALUES (?, ?, ?, ?, ?, ?, date('now'), 'ACTIVE')`
      )
      .run(
        userId,
        staffNo,
        parsed.data.initials.toUpperCase(),
        parsed.data.qualification || null,
        parsed.data.specialization || null,
        parsed.data.department || 'General'
      );
    return Number(tRes.lastInsertRowid);
  })();

  recordAuditLog({
    userId: req.authUser!.id,
    userName: req.authUser!.fullName,
    userRole: req.authUser!.primaryRole,
    action: 'TEACHER_REGISTERED',
    entityType: 'teacher',
    entityId: teacherId,
    newValue: { fullName: parsed.data.fullName, staffNo },
    ipAddress: req.ip,
  });

  res.status(201).json({ id: teacherId, staffNumber: staffNo });
});

academicsRouter.get('/allocations', (req, res) => {
  const termId = req.query.termId ? Number(req.query.termId) : null;
  const activeTerm = termId
    ? { id: termId }
    : (db.prepare(`SELECT id FROM terms WHERE is_active = 1 LIMIT 1`).get() as { id: number } | undefined);

  const allocations = db
    .prepare(
      `SELECT ta.*, u.full_name AS teacher_name, t.staff_number, t.initials,
              c.name AS class_name, c.code AS class_code, st.name AS stream_name,
              sub.code AS subject_code, sub.name AS subject_name,
              ay.year_label, tr.name AS term_name
       FROM teacher_allocations ta
       JOIN teachers t ON t.id = ta.teacher_id
       JOIN users u ON u.id = t.user_id
       JOIN classes c ON c.id = ta.class_id
       JOIN streams st ON st.id = ta.stream_id
       LEFT JOIN subjects sub ON sub.id = ta.subject_id
       JOIN academic_years ay ON ay.id = ta.academic_year_id
       JOIN terms tr ON tr.id = ta.term_id
       WHERE ta.term_id = ?
       ORDER BY ta.is_active DESC, c.sort_order ASC, st.name ASC, sub.name ASC`
    )
    .all(activeTerm?.id ?? 0);

  res.json({ allocations });
});

academicsRouter.post('/allocations', requirePermission('academics.manage'), (req, res) => {
  const schema = z.object({
    teacherId: z.number().int().positive(),
    academicYearId: z.number().int().positive(),
    termId: z.number().int().positive(),
    classId: z.number().int().positive(),
    streamId: z.number().int().positive(),
    subjectId: z.number().int().positive().nullable().optional(),
    isClassTeacher: z.boolean().default(false),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid teacher allocation details.' });
    return;
  }

  const allocId = db.transaction(() => {
    if (parsed.data.isClassTeacher) {
      db.prepare(
        `UPDATE teacher_allocations SET is_class_teacher = 0
         WHERE academic_year_id = ? AND term_id = ? AND class_id = ? AND stream_id = ?`
      ).run(parsed.data.academicYearId, parsed.data.termId, parsed.data.classId, parsed.data.streamId);
    }

    const r = db
      .prepare(
        `INSERT INTO teacher_allocations (
          teacher_id, academic_year_id, term_id, class_id, stream_id, subject_id, is_class_teacher, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
      )
      .run(
        parsed.data.teacherId,
        parsed.data.academicYearId,
        parsed.data.termId,
        parsed.data.classId,
        parsed.data.streamId,
        parsed.data.subjectId || null,
        parsed.data.isClassTeacher ? 1 : 0
      );
    return Number(r.lastInsertRowid);
  })();

  const teacherRow = db
    .prepare(`SELECT user_id FROM teachers WHERE id = ?`)
    .get(parsed.data.teacherId) as { user_id: number } | undefined;
  if (teacherRow) {
    createNotification({
      userId: teacherRow.user_id,
      title: 'New Academic Allocation',
      message: 'You have been assigned a new class/subject responsibility for the current term.',
      category: 'ALLOCATION',
      link: '/marks/entry',
    });
  }

  recordAuditLog({
    userId: req.authUser!.id,
    userName: req.authUser!.fullName,
    userRole: req.authUser!.primaryRole,
    action: 'TEACHER_ALLOCATED',
    entityType: 'teacher_allocation',
    entityId: allocId,
    newValue: parsed.data,
    ipAddress: req.ip,
  });

  res.status(201).json({ id: allocId });
});

academicsRouter.delete('/allocations/:id', requirePermission('academics.manage'), (req, res) => {
  const id = Number(req.params.id);
  db.prepare(`UPDATE teacher_allocations SET is_active = 0, revoked_at = datetime('now') WHERE id = ?`).run(id);
  res.json({ message: 'Allocation revoked and preserved in history.' });
});

// === GRADING SCALES & BOUNDARIES ===
academicsRouter.get('/grading-scales', (_req, res) => {
  const scales = db.prepare(`SELECT * FROM grading_scales ORDER BY is_default DESC, id ASC`).all() as Array<
    Record<string, unknown>
  >;
  const boundaries = db
    .prepare(`SELECT * FROM grading_boundaries ORDER BY min_score DESC`)
    .all() as Array<Record<string, unknown>>;

  res.json({
    scales: scales.map((s) => ({
      ...s,
      boundaries: boundaries.filter((b) => b.grading_scale_id === s.id),
    })),
  });
});

academicsRouter.post('/grading-scales', requirePermission('exams.configure'), (req, res) => {
  const schema = z.object({
    name: z.string().min(2).max(100),
    level: z.string().min(2).max(40),
    description: z.string().max(255).optional(),
    isDefault: z.boolean().default(false),
    boundaries: z
      .array(
        z.object({
          grade: z.string().min(1).max(10),
          minScore: z.number().min(0).max(100),
          maxScore: z.number().min(0).max(100),
          points: z.number().int().min(0).max(20),
          descriptor: z.string().min(2).max(80),
          remarks: z.string().max(160).optional(),
        })
      )
      .min(2),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid grading scale configuration.' });
    return;
  }

  const scaleId = db.transaction(() => {
    if (parsed.data.isDefault) {
      db.prepare(`UPDATE grading_scales SET is_default = 0`).run();
    }
    const r = db
      .prepare(`INSERT INTO grading_scales (name, level, description, is_default) VALUES (?, ?, ?, ?)`)
      .run(
        parsed.data.name.trim(),
        parsed.data.level.trim(),
        parsed.data.description || null,
        parsed.data.isDefault ? 1 : 0
      );
    const id = Number(r.lastInsertRowid);
    const insertB = db.prepare(
      `INSERT INTO grading_boundaries (grading_scale_id, grade, min_score, max_score, points, descriptor, remarks)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const b of parsed.data.boundaries) {
      insertB.run(id, b.grade, b.minScore, b.maxScore, b.points, b.descriptor, b.remarks || null);
    }
    return id;
  })();

  recordAuditLog({
    userId: req.authUser!.id,
    userName: req.authUser!.fullName,
    userRole: req.authUser!.primaryRole,
    action: 'GRADING_SCALE_CREATED',
    entityType: 'grading_scale',
    entityId: scaleId,
    newValue: parsed.data,
    ipAddress: req.ip,
  });

  res.status(201).json({ id: scaleId });
});

academicsRouter.put('/grading-scales/:id/boundaries', requirePermission('exams.configure'), (req, res) => {
  const scaleId = Number(req.params.id);
  const schema = z.object({
    boundaries: z
      .array(
        z.object({
          grade: z.string().min(1).max(10),
          minScore: z.number().min(0).max(100),
          maxScore: z.number().min(0).max(100),
          points: z.number().int().min(0).max(20),
          descriptor: z.string().min(2).max(80),
          remarks: z.string().max(160).optional().nullable(),
        })
      )
      .min(2),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid grading boundaries.' });
    return;
  }

  db.transaction(() => {
    db.prepare(`DELETE FROM grading_boundaries WHERE grading_scale_id = ?`).run(scaleId);
    const insertB = db.prepare(
      `INSERT INTO grading_boundaries (grading_scale_id, grade, min_score, max_score, points, descriptor, remarks)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const b of parsed.data.boundaries) {
      insertB.run(scaleId, b.grade, b.minScore, b.maxScore, b.points, b.descriptor, b.remarks || null);
    }
  })();

  recordAuditLog({
    userId: req.authUser!.id,
    userName: req.authUser!.fullName,
    userRole: req.authUser!.primaryRole,
    action: 'GRADING_BOUNDARIES_UPDATED',
    entityType: 'grading_scale',
    entityId: scaleId,
    newValue: parsed.data.boundaries,
    ipAddress: req.ip,
  });

  res.json({ message: 'Grading boundaries updated.' });
});

// === EXAMINATIONS & ASSESSMENT CATEGORIES ===
academicsRouter.get('/examinations', (_req, res) => {
  const examinations = db
    .prepare(
      `SELECT e.*, ay.year_label, t.name AS term_name, gs.name AS grading_scale_name
       FROM examinations e
       JOIN academic_years ay ON ay.id = e.academic_year_id
       JOIN terms t ON t.id = e.term_id
       JOIN grading_scales gs ON gs.id = e.grading_scale_id
       ORDER BY ay.year_label DESC, t.term_number DESC, e.id DESC`
    )
    .all() as Array<Record<string, unknown>>;

  const categories = db
    .prepare(`SELECT * FROM assessment_categories ORDER BY sort_order ASC`)
    .all() as Array<Record<string, unknown>>;

  res.json({
    examinations: examinations.map((ex) => ({
      ...ex,
      categories: categories.filter((c) => c.examination_id === ex.id),
    })),
  });
});

academicsRouter.post('/examinations', requirePermission('exams.configure'), (req, res) => {
  const schema = z.object({
    academicYearId: z.number().int().positive(),
    termId: z.number().int().positive(),
    name: z.string().min(3).max(120),
    code: z.string().min(2).max(30),
    examType: z.string().default('TERMLY'),
    gradingScaleId: z.number().int().positive(),
    submissionDeadline: z.string().optional().nullable(),
    rankingEnabled: z.boolean().default(true),
    aggregateEnabled: z.boolean().default(true),
    categories: z
      .array(
        z.object({
          name: z.string().min(2).max(80),
          code: z.string().min(1).max(20),
          maxMarks: z.number().positive().max(500),
          weightPercentage: z.number().positive().max(100),
        })
      )
      .min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid examination configuration.' });
    return;
  }

  const totalWeight = parsed.data.categories.reduce((acc, c) => acc + c.weightPercentage, 0);
  if (Math.abs(totalWeight - 100) > 0.01) {
    res.status(400).json({ error: `Assessment category weights must sum to 100% (currently ${totalWeight}%).` });
    return;
  }

  const examId = db.transaction(() => {
    const r = db
      .prepare(
        `INSERT INTO examinations (
          academic_year_id, term_id, name, code, exam_type, grading_scale_id,
          submission_deadline, is_active, ranking_enabled, aggregate_enabled
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
      )
      .run(
        parsed.data.academicYearId,
        parsed.data.termId,
        parsed.data.name.trim(),
        parsed.data.code.trim().toUpperCase(),
        parsed.data.examType,
        parsed.data.gradingScaleId,
        parsed.data.submissionDeadline || null,
        parsed.data.rankingEnabled ? 1 : 0,
        parsed.data.aggregateEnabled ? 1 : 0
      );
    const id = Number(r.lastInsertRowid);
    const insertCat = db.prepare(
      `INSERT INTO assessment_categories (examination_id, name, code, max_marks, weight_percentage, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    parsed.data.categories.forEach((cat, idx) => {
      insertCat.run(id, cat.name.trim(), cat.code.trim().toUpperCase(), cat.maxMarks, cat.weightPercentage, idx + 1);
    });
    return id;
  })();

  recordAuditLog({
    userId: req.authUser!.id,
    userName: req.authUser!.fullName,
    userRole: req.authUser!.primaryRole,
    action: 'EXAMINATION_CREATED',
    entityType: 'examination',
    entityId: examId,
    newValue: parsed.data,
    ipAddress: req.ip,
  });

  res.status(201).json({ id: examId });
});

academicsRouter.put('/examinations/:id/categories', requirePermission('exams.configure'), (req, res) => {
  const examId = Number(req.params.id);
  const schema = z.object({
    categories: z
      .array(
        z.object({
          id: z.number().int().positive().optional(),
          name: z.string().min(2).max(80),
          code: z.string().min(1).max(20),
          maxMarks: z.number().positive().max(500),
          weightPercentage: z.number().positive().max(100),
        })
      )
      .min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid assessment categories.' });
    return;
  }

  const totalWeight = parsed.data.categories.reduce((acc, c) => acc + c.weightPercentage, 0);
  if (Math.abs(totalWeight - 100) > 0.01) {
    res.status(400).json({ error: `Category weights must sum to 100% (currently ${totalWeight}%).` });
    return;
  }

  db.transaction(() => {
    for (let i = 0; i < parsed.data.categories.length; i++) {
      const cat = parsed.data.categories[i];
      if (cat.id) {
        db.prepare(
          `UPDATE assessment_categories SET name = ?, code = ?, max_marks = ?, weight_percentage = ?, sort_order = ? WHERE id = ? AND examination_id = ?`
        ).run(cat.name.trim(), cat.code.trim().toUpperCase(), cat.maxMarks, cat.weightPercentage, i + 1, cat.id, examId);
      } else {
        db.prepare(
          `INSERT INTO assessment_categories (examination_id, name, code, max_marks, weight_percentage, sort_order) VALUES (?, ?, ?, ?, ?, ?)`
        ).run(examId, cat.name.trim(), cat.code.trim().toUpperCase(), cat.maxMarks, cat.weightPercentage, i + 1);
      }
    }
  })();

  res.json({ message: 'Assessment structure updated.' });
});
