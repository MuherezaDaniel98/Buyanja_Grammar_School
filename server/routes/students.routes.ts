import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { db } from '../db.js';
import { recordAuditLog } from '../middleware/audit.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import {
  buildStudentsTemplateWorkbook,
  buildTabularExportWorkbook,
  parseSpreadsheetBuffer,
} from '../services/excelService.js';

export const studentsRouter = Router();
studentsRouter.use(authenticate);

const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const photoStorageDir = path.resolve(process.cwd(), 'public/uploads/students');
fs.mkdirSync(photoStorageDir, { recursive: true });

const photoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, photoStorageDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
      cb(null, `student_${Number(req.params.id)}_${Date.now()}${safeExt}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, or WebP images are permitted.'));
    }
  },
});

function generateNextAdmissionNumber(yearLabel: string): string {
  const prefix = `BGS/${yearLabel}/`;
  const row = db
    .prepare(
      `SELECT admission_number FROM students
       WHERE admission_number LIKE ?
       ORDER BY id DESC LIMIT 1`
    )
    .get(`${prefix}%`) as { admission_number: string } | undefined;

  let nextNum = 1;
  if (row) {
    const parts = row.admission_number.split('/');
    const parsed = parseInt(parts[2] || '0', 10);
    if (!Number.isNaN(parsed)) {
      nextNum = parsed + 1;
    }
  }
  return `${prefix}${String(nextNum).padStart(4, '0')}`;
}

studentsRouter.get('/', (req, res) => {
  const search = String(req.query.search || '').trim();
  const classId = req.query.classId ? Number(req.query.classId) : null;
  const streamId = req.query.streamId ? Number(req.query.streamId) : null;
  const status = req.query.status ? String(req.query.status) : null;
  const gender = req.query.gender ? String(req.query.gender) : null;
  const yearId = req.query.academicYearId ? Number(req.query.academicYearId) : null;
  const termId = req.query.termId ? Number(req.query.termId) : null;

  const activeYear = (yearId
    ? db.prepare(`SELECT id, year_label FROM academic_years WHERE id = ?`).get(yearId)
    : db.prepare(`SELECT id, year_label FROM academic_years WHERE is_active = 1 LIMIT 1`).get()) as
    | { id: number; year_label: string }
    | undefined;

  const activeTerm = (termId
    ? db.prepare(`SELECT id, name FROM terms WHERE id = ?`).get(termId)
    : db
        .prepare(`SELECT id, name FROM terms WHERE academic_year_id = ? AND is_active = 1 LIMIT 1`)
        .get(activeYear?.id ?? 0)) as { id: number; name: string } | undefined;

  const conditions: string[] = ['1=1'];
  const params: unknown[] = [activeYear?.id ?? 0, activeTerm?.id ?? 0];

  if (search) {
    conditions.push(`(s.admission_number LIKE ? OR s.first_name LIKE ? OR s.last_name LIKE ?)`);
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  if (classId) {
    conditions.push(`se.class_id = ?`);
    params.push(classId);
  }
  if (streamId) {
    conditions.push(`se.stream_id = ?`);
    params.push(streamId);
  }
  if (status) {
    conditions.push(`s.status = ?`);
    params.push(status);
  }
  if (gender) {
    conditions.push(`s.gender = ?`);
    params.push(gender);
  }

  const rows = db
    .prepare(
      `SELECT s.id, s.admission_number, s.first_name, s.last_name, s.other_names,
              s.gender, s.date_of_birth, s.admission_date, s.photo_url, s.status,
              se.class_id, se.stream_id, se.roll_number,
              c.name AS class_name, c.code AS class_code,
              st.name AS stream_name,
              g.full_name AS guardian_name, g.phone AS guardian_phone, g.relationship AS guardian_relationship
       FROM students s
       LEFT JOIN student_enrolments se
         ON se.student_id = s.id AND se.academic_year_id = ? AND se.term_id = ?
       LEFT JOIN classes c ON c.id = se.class_id
       LEFT JOIN streams st ON st.id = se.stream_id
       LEFT JOIN guardians g ON g.student_id = s.id AND g.is_primary = 1
       WHERE ${conditions.join(' AND ')}
       ORDER BY c.sort_order ASC, st.name ASC, s.last_name ASC, s.first_name ASC`
    )
    .all(...params);

  res.json({
    students: rows,
    nextAdmissionPreview: generateNextAdmissionNumber(activeYear?.year_label || '2026'),
  });
});

studentsRouter.get('/import-template', async (_req, res) => {
  const buf = await buildStudentsTemplateWorkbook();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="BGS_Students_Import_Template.xlsx"');
  res.send(buf);
});

studentsRouter.get('/export', async (req, res) => {
  const format = String(req.query.format || 'xlsx').toLowerCase();
  const rows = db
    .prepare(
      `SELECT s.admission_number, s.first_name || ' ' || s.last_name AS full_name,
              s.gender, s.date_of_birth, c.code AS class_code, st.name AS stream_name,
              s.status, g.full_name AS guardian_name, g.phone AS guardian_phone
       FROM students s
       LEFT JOIN student_enrolments se ON se.student_id = s.id
         AND se.term_id = (SELECT id FROM terms WHERE is_active = 1 LIMIT 1)
       LEFT JOIN classes c ON c.id = se.class_id
       LEFT JOIN streams st ON st.id = se.stream_id
       LEFT JOIN guardians g ON g.student_id = s.id AND g.is_primary = 1
       ORDER BY s.admission_number ASC`
    )
    .all() as Array<{
    admission_number: string;
    full_name: string;
    gender: string;
    date_of_birth: string | null;
    class_code: string | null;
    stream_name: string | null;
    status: string;
    guardian_name: string | null;
    guardian_phone: string | null;
  }>;

  if (format === 'csv') {
    const header = 'Admission No,Full Name,Gender,DOB,Class,Stream,Status,Guardian,Guardian Phone';
    const lines = rows.map((r) =>
      [
        r.admission_number,
        `"${r.full_name}"`,
        r.gender,
        r.date_of_birth || '',
        r.class_code || '',
        r.stream_name || '',
        r.status,
        `"${r.guardian_name || ''}"`,
        r.guardian_phone || '',
      ].join(',')
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="BGS_Students_Directory.csv"');
    res.send([header, ...lines].join('\n'));
    return;
  }

  const buf = await buildTabularExportWorkbook({
    sheetName: 'Students Directory',
    title: 'BUYANJA GRAMMAR SCHOOL — STUDENT DIRECTORY',
    headers: ['Admission No', 'Full Name', 'Gender', 'Date of Birth', 'Class', 'Stream', 'Status', 'Guardian', 'Phone'],
    rows: rows.map((r) => [
      r.admission_number,
      r.full_name,
      r.gender,
      r.date_of_birth,
      r.class_code,
      r.stream_name,
      r.status,
      r.guardian_name,
      r.guardian_phone,
    ]),
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="BGS_Students_Directory.xlsx"');
  res.send(buf);
});

studentsRouter.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const student = db
    .prepare(`SELECT * FROM students WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;

  if (!student) {
    res.status(404).json({ error: 'Student not found.' });
    return;
  }

  const guardians = db.prepare(`SELECT * FROM guardians WHERE student_id = ?`).all(id);
  const enrolments = db
    .prepare(
      `SELECT se.*, ay.year_label, t.name AS term_name, c.name AS class_name, c.code AS class_code, st.name AS stream_name
       FROM student_enrolments se
       JOIN academic_years ay ON ay.id = se.academic_year_id
       JOIN terms t ON t.id = se.term_id
       JOIN classes c ON c.id = se.class_id
       JOIN streams st ON st.id = se.stream_id
       WHERE se.student_id = ?
       ORDER BY ay.year_label DESC, t.term_number DESC`
    )
    .all(id);

  const examSummaries = db
    .prepare(
      `SELECT ses.*, e.name AS exam_name, e.code AS exam_code, ay.year_label, t.name AS term_name, c.code AS class_code
       FROM student_exam_summaries ses
       JOIN examinations e ON e.id = ses.examination_id
       JOIN academic_years ay ON ay.id = e.academic_year_id
       JOIN terms t ON t.id = e.term_id
       JOIN classes c ON c.id = ses.class_id
       WHERE ses.student_id = ?
       ORDER BY ay.year_label DESC, t.term_number DESC`
    )
    .all(id);

  const subjectResults = db
    .prepare(
      `SELECT sr.*, sub.code AS subject_code, sub.name AS subject_name, e.name AS exam_name
       FROM subject_results sr
       JOIN subjects sub ON sub.id = sr.subject_id
       JOIN examinations e ON e.id = sr.examination_id
       WHERE sr.student_id = ?
       ORDER BY sr.examination_id DESC, sub.name ASC`
    )
    .all(id);

  const attendance = db
    .prepare(
      `SELECT a.*, ay.year_label, t.name AS term_name
       FROM attendance a
       JOIN academic_years ay ON ay.id = a.academic_year_id
       JOIN terms t ON t.id = a.term_id
       WHERE a.student_id = ?
       ORDER BY ay.year_label DESC, t.term_number DESC`
    )
    .all(id);

  const reportCards = db
    .prepare(
      `SELECT rc.*, e.name AS exam_name, ay.year_label, t.name AS term_name
       FROM report_cards rc
       JOIN examinations e ON e.id = rc.examination_id
       JOIN academic_years ay ON ay.id = e.academic_year_id
       JOIN terms t ON t.id = e.term_id
       WHERE rc.student_id = ?
       ORDER BY rc.generated_at DESC`
    )
    .all(id);

  const interventions = db
    .prepare(
      `SELECT n.*, u.full_name AS author_name
       FROM intervention_notes n
       JOIN users u ON u.id = n.created_by
       WHERE n.student_id = ?
       ORDER BY n.created_at DESC`
    )
    .all(id);

  res.json({
    student,
    guardians,
    enrolments,
    examSummaries,
    subjectResults,
    attendance,
    reportCards,
    interventions,
  });
});

const createStudentSchema = z.object({
  admissionNumber: z.string().optional(),
  firstName: z.string().min(2).max(80),
  lastName: z.string().min(2).max(80),
  otherNames: z.string().max(80).optional().nullable(),
  gender: z.enum(['M', 'F']),
  dateOfBirth: z.string().optional().nullable(),
  admissionDate: z.string().min(4),
  classId: z.number().int().positive(),
  streamId: z.number().int().positive(),
  guardianName: z.string().min(2).max(150),
  guardianRelationship: z.string().min(2).max(50),
  guardianPhone: z.string().min(6).max(40),
  guardianEmail: z.string().email().optional().or(z.literal('')).nullable(),
  guardianAddress: z.string().max(255).optional().nullable(),
});

studentsRouter.post('/', requirePermission('students.manage'), (req, res) => {
  const parsed = createStudentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid student registration details.', details: parsed.error.flatten() });
    return;
  }

  const activeYear = db
    .prepare(`SELECT id, year_label FROM academic_years WHERE is_active = 1 LIMIT 1`)
    .get() as { id: number; year_label: string } | undefined;
  const activeTerm = db
    .prepare(`SELECT id FROM terms WHERE academic_year_id = ? AND is_active = 1 LIMIT 1`)
    .get(activeYear?.id ?? 0) as { id: number } | undefined;

  if (!activeYear || !activeTerm) {
    res.status(400).json({ error: 'No active academic year or term configured.' });
    return;
  }

  const admNo =
    parsed.data.admissionNumber?.trim() || generateNextAdmissionNumber(activeYear.year_label);

  const dup = db
    .prepare(`SELECT id FROM students WHERE admission_number = ?`)
    .get(admNo);
  if (dup) {
    res.status(409).json({ error: `Admission number ${admNo} is already assigned.` });
    return;
  }

  const studentId = db.transaction(() => {
    const resInsert = db
      .prepare(
        `INSERT INTO students (
          admission_number, first_name, last_name, other_names, gender, date_of_birth, admission_date, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`
      )
      .run(
        admNo,
        parsed.data.firstName.trim(),
        parsed.data.lastName.trim(),
        parsed.data.otherNames?.trim() || null,
        parsed.data.gender,
        parsed.data.dateOfBirth || null,
        parsed.data.admissionDate
      );
    const newId = Number(resInsert.lastInsertRowid);

    db.prepare(
      `INSERT INTO guardians (student_id, full_name, relationship, phone, email, address, is_primary)
       VALUES (?, ?, ?, ?, ?, ?, 1)`
    ).run(
      newId,
      parsed.data.guardianName.trim(),
      parsed.data.guardianRelationship.trim(),
      parsed.data.guardianPhone.trim(),
      parsed.data.guardianEmail || null,
      parsed.data.guardianAddress || null
    );

    db.prepare(
      `INSERT INTO student_enrolments (student_id, academic_year_id, term_id, class_id, stream_id, status)
       VALUES (?, ?, ?, ?, ?, 'ENROLLED')`
    ).run(newId, activeYear.id, activeTerm.id, parsed.data.classId, parsed.data.streamId);

    return newId;
  })();

  recordAuditLog({
    userId: req.authUser!.id,
    userName: req.authUser!.fullName,
    userRole: req.authUser!.primaryRole,
    action: 'STUDENT_REGISTERED',
    entityType: 'student',
    entityId: studentId,
    newValue: { admissionNumber: admNo, name: `${parsed.data.firstName} ${parsed.data.lastName}` },
    ipAddress: req.ip,
  });

  res.status(201).json({ id: studentId, admissionNumber: admNo });
});

studentsRouter.put('/:id', requirePermission('students.manage'), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT * FROM students WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Student not found.' });
    return;
  }

  const schema = z.object({
    firstName: z.string().min(2).max(80),
    lastName: z.string().min(2).max(80),
    otherNames: z.string().max(80).optional().nullable(),
    gender: z.enum(['M', 'F']),
    dateOfBirth: z.string().optional().nullable(),
    status: z.enum(['ACTIVE', 'TRANSFERRED', 'WITHDRAWN', 'GRADUATED']).optional(),
    withdrawalReason: z.string().max(255).optional().nullable(),
    guardianName: z.string().min(2).max(150).optional(),
    guardianRelationship: z.string().max(50).optional(),
    guardianPhone: z.string().max(40).optional(),
    guardianAddress: z.string().max(255).optional().nullable(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid student update payload.' });
    return;
  }

  db.transaction(() => {
    db.prepare(
      `UPDATE students
       SET first_name = ?, last_name = ?, other_names = ?, gender = ?, date_of_birth = ?,
           status = ?, withdrawal_reason = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      parsed.data.firstName.trim(),
      parsed.data.lastName.trim(),
      parsed.data.otherNames?.trim() || null,
      parsed.data.gender,
      parsed.data.dateOfBirth || null,
      parsed.data.status || (existing.status as string),
      parsed.data.withdrawalReason || null,
      id
    );

    if (parsed.data.guardianName && parsed.data.guardianPhone) {
      db.prepare(
        `UPDATE guardians SET full_name = ?, relationship = ?, phone = ?, address = ?
         WHERE student_id = ? AND is_primary = 1`
      ).run(
        parsed.data.guardianName.trim(),
        parsed.data.guardianRelationship || 'Guardian',
        parsed.data.guardianPhone.trim(),
        parsed.data.guardianAddress || null,
        id
      );
    }
  })();

  recordAuditLog({
    userId: req.authUser!.id,
    userName: req.authUser!.fullName,
    userRole: req.authUser!.primaryRole,
    action: 'STUDENT_UPDATED',
    entityType: 'student',
    entityId: id,
    previousValue: existing,
    newValue: parsed.data,
    ipAddress: req.ip,
  });

  res.json({ message: 'Student record updated.' });
});

studentsRouter.post('/:id/photo', requirePermission('students.manage'), photoUpload.single('photo'), (req, res) => {
  const id = Number(req.params.id);
  if (!req.file) {
    res.status(400).json({ error: 'Photo file is required.' });
    return;
  }
  const resolved = path.resolve(req.file.path);
  if (!resolved.startsWith(photoStorageDir + path.sep)) {
    res.status(400).json({ error: 'Invalid upload path.' });
    return;
  }
  const publicUrl = `/uploads/students/${req.file.filename}`;
  db.prepare(`UPDATE students SET photo_url = ?, updated_at = datetime('now') WHERE id = ?`).run(publicUrl, id);
  res.json({ photoUrl: publicUrl });
});

studentsRouter.post('/promote', requirePermission('students.manage'), (req, res) => {
  const schema = z.object({
    studentIds: z.array(z.number().int().positive()).min(1),
    targetAcademicYearId: z.number().int().positive(),
    targetTermId: z.number().int().positive(),
    targetClassId: z.number().int().positive(),
    targetStreamId: z.number().int().positive(),
    actionType: z.enum(['PROMOTE', 'TRANSFER_STREAM']).default('PROMOTE'),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid promotion/transfer parameters.' });
    return;
  }

  const { studentIds, targetAcademicYearId, targetTermId, targetClassId, targetStreamId, actionType } =
    parsed.data;

  db.transaction(() => {
    const upsert = db.prepare(`
      INSERT INTO student_enrolments (student_id, academic_year_id, term_id, class_id, stream_id, status)
      VALUES (?, ?, ?, ?, ?, 'ENROLLED')
      ON CONFLICT(student_id, academic_year_id, term_id)
      DO UPDATE SET class_id = excluded.class_id, stream_id = excluded.stream_id, status = 'ENROLLED'
    `);
    for (const sId of studentIds) {
      upsert.run(sId, targetAcademicYearId, targetTermId, targetClassId, targetStreamId);
    }
  })();

  recordAuditLog({
    userId: req.authUser!.id,
    userName: req.authUser!.fullName,
    userRole: req.authUser!.primaryRole,
    action: actionType === 'PROMOTE' ? 'STUDENTS_PROMOTED' : 'STUDENTS_STREAM_TRANSFERRED',
    entityType: 'student_enrolment',
    newValue: parsed.data,
    ipAddress: req.ip,
  });

  res.json({ message: `Processed ${studentIds.length} student(s) successfully.` });
});

studentsRouter.post('/import/preview', requirePermission('students.manage'), uploadMemory.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Please upload an .xlsx or .csv file.' });
    return;
  }

  const rows = await parseSpreadsheetBuffer(req.file.buffer, req.file.originalname);
  if (rows.length < 2) {
    res.status(400).json({ error: 'The uploaded file contains no data rows.' });
    return;
  }

  const classes = db.prepare(`SELECT id, code FROM classes`).all() as Array<{ id: number; code: string }>;
  const streams = db.prepare(`SELECT id, class_id, name FROM streams`).all() as Array<{
    id: number;
    class_id: number;
    name: string;
  }>;

  const classMap = new Map(classes.map((c) => [c.code.toUpperCase(), c.id]));

  const previewRows = rows.slice(1).map((cols, index) => {
    const [firstName, lastName, genderRaw, dob, classCode, streamName, guardianName, relationship, phone] = cols;
    const errors: string[] = [];
    if (!firstName || firstName.length < 2) errors.push('Missing first name');
    if (!lastName || lastName.length < 2) errors.push('Missing last name');
    const gender = (genderRaw || '').toUpperCase();
    if (gender !== 'M' && gender !== 'F') errors.push('Gender must be M or F');

    const clsId = classMap.get((classCode || '').toUpperCase());
    if (!clsId) errors.push(`Unknown class code "${classCode || ''}"`);

    const strm = streams.find(
      (s) => s.class_id === clsId && s.name.toLowerCase() === (streamName || '').toLowerCase()
    );
    if (!strm) errors.push(`Unknown stream "${streamName || ''}"`);
    if (!guardianName) errors.push('Missing guardian name');
    if (!phone) errors.push('Missing guardian phone');

    return {
      rowNumber: index + 2,
      firstName: firstName || '',
      lastName: lastName || '',
      gender,
      dateOfBirth: dob || '',
      classCode: classCode || '',
      classId: clsId || null,
      streamName: streamName || '',
      streamId: strm?.id || null,
      guardianName: guardianName || '',
      relationship: relationship || 'Parent',
      guardianPhone: phone || '',
      valid: errors.length === 0,
      errors,
    };
  });

  res.json({
    totalRows: previewRows.length,
    validCount: previewRows.filter((r) => r.valid).length,
    invalidCount: previewRows.filter((r) => !r.valid).length,
    rows: previewRows,
  });
});

studentsRouter.post('/import/commit', requirePermission('students.manage'), (req, res) => {
  const rows = req.body.rows as Array<{
    firstName: string;
    lastName: string;
    gender: 'M' | 'F';
    dateOfBirth?: string;
    classId: number;
    streamId: number;
    guardianName: string;
    relationship: string;
    guardianPhone: string;
    valid: boolean;
  }>;

  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ error: 'No validated rows provided.' });
    return;
  }

  const validRows = rows.filter((r) => r.valid && r.classId && r.streamId);
  const activeYear = db
    .prepare(`SELECT id, year_label FROM academic_years WHERE is_active = 1 LIMIT 1`)
    .get() as { id: number; year_label: string } | undefined;
  const activeTerm = db
    .prepare(`SELECT id FROM terms WHERE academic_year_id = ? AND is_active = 1 LIMIT 1`)
    .get(activeYear?.id ?? 0) as { id: number } | undefined;

  if (!activeYear || !activeTerm) {
    res.status(400).json({ error: 'No active academic term found.' });
    return;
  }

  const imported: string[] = [];
  db.transaction(() => {
    for (const r of validRows) {
      const admNo = generateNextAdmissionNumber(activeYear.year_label);
      const resStu = db
        .prepare(
          `INSERT INTO students (admission_number, first_name, last_name, gender, date_of_birth, admission_date, status)
           VALUES (?, ?, ?, ?, ?, date('now'), 'ACTIVE')`
        )
        .run(admNo, r.firstName.trim(), r.lastName.trim(), r.gender, r.dateOfBirth || null);
      const sId = Number(resStu.lastInsertRowid);

      db.prepare(
        `INSERT INTO guardians (student_id, full_name, relationship, phone, is_primary)
         VALUES (?, ?, ?, ?, 1)`
      ).run(sId, r.guardianName.trim(), r.relationship || 'Parent', r.guardianPhone.trim());

      db.prepare(
        `INSERT INTO student_enrolments (student_id, academic_year_id, term_id, class_id, stream_id, status)
         VALUES (?, ?, ?, ?, ?, 'ENROLLED')`
      ).run(sId, activeYear.id, activeTerm.id, r.classId, r.streamId);

      imported.push(admNo);
    }
  })();

  recordAuditLog({
    userId: req.authUser!.id,
    userName: req.authUser!.fullName,
    userRole: req.authUser!.primaryRole,
    action: 'STUDENTS_BULK_IMPORTED',
    entityType: 'student',
    newValue: { count: imported.length },
    ipAddress: req.ip,
  });

  res.status(201).json({ importedCount: imported.length, admissionNumbers: imported });
});
