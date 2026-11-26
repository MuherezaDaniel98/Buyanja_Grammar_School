import fs from 'fs';
import path from 'path';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const TEST_DB_REL = './database/test_bgs_qa.db';
const TEST_DB_ABS = path.resolve(process.cwd(), TEST_DB_REL);

function cleanupTestDbFiles() {
  for (const suffix of ['', '-wal', '-shm']) {
    const file = `${TEST_DB_ABS}${suffix}`;
    if (fs.existsSync(file)) {
      try {
        fs.unlinkSync(file);
      } catch {
        // Ignore locked cleanup on shutdown
      }
    }
  }
}

let app: Express;
let dbRef: typeof import('../server/db.js').db;
let gradingEngine: typeof import('../server/services/gradingEngine.js');

let adminToken = '';
let headToken = '';
let dosToken = '';
let classTeacherToken = '';
let mathTeacherToken = '';

beforeAll(async () => {
  cleanupTestDbFiles();
  process.env.VITEST = 'true';
  process.env.NODE_ENV = 'test';
  process.env.SQLITE_PATH = TEST_DB_REL;
  process.env.JWT_ACCESS_SECRET = 'test_access_secret_bgs_2026';
  process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_bgs_2026';

  const serverMod = await import('../server.js');
  const dbMod = await import('../server/db.js');
  gradingEngine = await import('../server/services/gradingEngine.js');

  dbRef = dbMod.db;
  app = serverMod.createApp();

  // Login all 5 role accounts
  const login = async (email: string) => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'Bgs@2026!' });
    expect(res.status).toBe(200);
    return res.body.accessToken as string;
  };

  adminToken = await login('admin@buyanjagrammar.ac.ug');
  headToken = await login('headteacher@buyanjagrammar.ac.ug');
  dosToken = await login('dos@buyanjagrammar.ac.ug');
  classTeacherToken = await login('classteacher@buyanjagrammar.ac.ug');
  mathTeacherToken = await login('teacher@buyanjagrammar.ac.ug');
});

afterAll(() => {
  try {
    dbRef?.close();
  } catch {
    // ignore
  }
  cleanupTestDbFiles();
});

describe('1. Authentication & Recovery', () => {
  it('validates login returns JWT, user context, and HttpOnly refresh cookie', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'teacher@buyanjagrammar.ac.ug', password: 'Bgs@2026!' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTypeOf('string');
    expect(res.body.user.primaryRole).toBe('SUBJECT_TEACHER');
    const rawCookies = res.headers['set-cookie'];
    const cookies = Array.isArray(rawCookies) ? rawCookies : rawCookies ? [String(rawCookies)] : [];
    expect(cookies.some((c) => c.startsWith('bgs_refresh_token=') && c.includes('HttpOnly'))).toBe(true);
  });

  it('rejects invalid credentials with 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'teacher@buyanjagrammar.ac.ug', password: 'WrongPassword123!' });
    expect(res.status).toBe(401);
  });

  it('rejects invalid or tampered Bearer tokens with 401', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid.jwt.token');
    expect(res.status).toBe(401);
  });

  it('supports password reset request and completion flow', async () => {
    const reqReset = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'j.kato@buyanjagrammar.ac.ug' });

    expect(reqReset.status).toBe(200);
    expect(reqReset.body.recoveryTokenPreview).toBeTypeOf('string');

    const complete = await request(app)
      .post('/api/auth/reset-password')
      .send({
        token: reqReset.body.recoveryTokenPreview,
        newPassword: 'NewSecurePass@2026!',
      });
    expect(complete.status).toBe(200);

    const loginNew = await request(app)
      .post('/api/auth/login')
      .send({ email: 'j.kato@buyanjagrammar.ac.ug', password: 'NewSecurePass@2026!' });
    expect(loginNew.status).toBe(200);
  });
});

describe('2. Role-Based Access Control (RBAC)', () => {
  it('rejects unauthenticated access to protected endpoints', async () => {
    const res = await request(app).get('/api/students');
    expect(res.status).toBe(401);
  });

  it('blocks Subject Teacher from accessing or modifying unassigned subject marks', async () => {
    const exam = dbRef
      .prepare(`SELECT id FROM examinations WHERE code = 'EOT-2026-T2'`)
      .get() as { id: number };
    const s2 = dbRef.prepare(`SELECT id FROM classes WHERE code = 'S.2'`).get() as { id: number };
    const s2North = dbRef
      .prepare(`SELECT id FROM streams WHERE class_id = ? AND name = 'North'`)
      .get(s2.id) as { id: number };
    const bio = dbRef.prepare(`SELECT id FROM subjects WHERE code = 'BIO'`).get() as { id: number };

    // David Ochieng teaches MTC/ICT, NOT Biology
    const gridRes = await request(app)
      .get('/api/marks/grid')
      .query({ examinationId: exam.id, classId: s2.id, streamId: s2North.id, subjectId: bio.id })
      .set('Authorization', `Bearer ${mathTeacherToken}`);

    expect(gridRes.status).toBe(403);

    const saveRes = await request(app)
      .post('/api/marks/save-draft')
      .set('Authorization', `Bearer ${mathTeacherToken}`)
      .send({
        examinationId: exam.id,
        classId: s2.id,
        streamId: s2North.id,
        subjectId: bio.id,
        entries: [],
      });
    expect(saveRes.status).toBe(403);
  });

  it('blocks Subject Teacher from verifying or approving marks', async () => {
    const sub = dbRef
      .prepare(`SELECT id FROM result_submissions WHERE status = 'SUBMITTED' LIMIT 1`)
      .get() as { id: number };

    const verifyRes = await request(app)
      .post('/api/marks/verify')
      .set('Authorization', `Bearer ${mathTeacherToken}`)
      .send({ submissionId: sub.id, decision: 'VERIFIED' });
    expect(verifyRes.status).toBe(403);

    const approveRes = await request(app)
      .post('/api/marks/approve')
      .set('Authorization', `Bearer ${mathTeacherToken}`)
      .send({ submissionIds: [sub.id], decision: 'APPROVED' });
    expect(approveRes.status).toBe(403);
  });

  it('blocks DOS from verifying their own submitted subject marks', async () => {
    const exam = dbRef
      .prepare(`SELECT id FROM examinations WHERE code = 'EOT-2026-T2'`)
      .get() as { id: number };
    const s1 = dbRef.prepare(`SELECT id FROM classes WHERE code = 'S.1'`).get() as { id: number };
    const s1North = dbRef
      .prepare(`SELECT id FROM streams WHERE class_id = ? AND name = 'North'`)
      .get(s1.id) as { id: number };
    const phy = dbRef.prepare(`SELECT id FROM subjects WHERE code = 'PHY'`).get() as { id: number };

    const dosUser = dbRef
      .prepare(`SELECT id FROM users WHERE email = 'dos@buyanjagrammar.ac.ug'`)
      .get() as { id: number };

    // Ensure a submission exists submitted by DOS
    dbRef
      .prepare(
        `INSERT INTO result_submissions (examination_id, class_id, stream_id, subject_id, submitted_by, status)
         VALUES (?, ?, ?, ?, ?, 'SUBMITTED')
         ON CONFLICT(examination_id, class_id, stream_id, subject_id)
         DO UPDATE SET submitted_by = excluded.submitted_by, status = 'SUBMITTED'`
      )
      .run(exam.id, s1.id, s1North.id, phy.id, dosUser.id);

    const sub = dbRef
      .prepare(
        `SELECT id FROM result_submissions WHERE examination_id = ? AND class_id = ? AND stream_id = ? AND subject_id = ?`
      )
      .get(exam.id, s1.id, s1North.id, phy.id) as { id: number };

    const res = await request(app)
      .post('/api/marks/verify')
      .set('Authorization', `Bearer ${dosToken}`)
      .send({ submissionId: sub.id, decision: 'VERIFIED' });
    expect(res.status).toBe(403);
  });

  it('blocks Class Teacher from modifying unassigned subject marks', async () => {
    const exam = dbRef
      .prepare(`SELECT id FROM examinations WHERE code = 'EOT-2026-T2'`)
      .get() as { id: number };
    const s2 = dbRef.prepare(`SELECT id FROM classes WHERE code = 'S.2'`).get() as { id: number };
    const s2North = dbRef
      .prepare(`SELECT id FROM streams WHERE class_id = ? AND name = 'North'`)
      .get(s2.id) as { id: number };
    const mtc = dbRef.prepare(`SELECT id FROM subjects WHERE code = 'MTC'`).get() as { id: number };

    const res = await request(app)
      .post('/api/marks/save-draft')
      .set('Authorization', `Bearer ${classTeacherToken}`)
      .send({
        examinationId: exam.id,
        classId: s2.id,
        streamId: s2North.id,
        subjectId: mtc.id,
        entries: [],
      });
    expect(res.status).toBe(403);
  });

  it('allows System Administrator to view and update System Settings', async () => {
    const getRes = await request(app)
      .get('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.settings.school_name).toBe('BUYANJA GRAMMAR SCHOOL');

    const putRes = await request(app)
      .put('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ settings: { school_motto: 'Discipline, Knowledge and Service' } });
    expect(putRes.status).toBe(200);
  });
});

describe('3. Marks Validation & Full Approval Workflow', () => {
  it('rejects marks exceeding configured category max_marks', async () => {
    const exam = dbRef
      .prepare(`SELECT id FROM examinations WHERE code = 'EOT-2026-T2'`)
      .get() as { id: number };
    const s2 = dbRef.prepare(`SELECT id FROM classes WHERE code = 'S.2'`).get() as { id: number };
    const s2North = dbRef
      .prepare(`SELECT id FROM streams WHERE class_id = ? AND name = 'North'`)
      .get(s2.id) as { id: number };
    const ict = dbRef.prepare(`SELECT id FROM subjects WHERE code = 'ICT'`).get() as { id: number };
    const cwCat = dbRef
      .prepare(`SELECT id FROM assessment_categories WHERE examination_id = ? AND code = 'CW'`)
      .get(exam.id) as { id: number };
    const student = dbRef
      .prepare(
        `SELECT student_id FROM student_enrolments WHERE class_id = ? AND stream_id = ? LIMIT 1`
      )
      .get(s2.id, s2North.id) as { student_id: number };

    const res = await request(app)
      .post('/api/marks/save-draft')
      .set('Authorization', `Bearer ${mathTeacherToken}`)
      .send({
        examinationId: exam.id,
        classId: s2.id,
        streamId: s2North.id,
        subjectId: ict.id,
        entries: [
          {
            studentId: student.student_id,
            assessmentCategoryId: cwCat.id,
            score: 25, // max_marks for CW is 20
            statusFlag: 'PRESENT',
          },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('exceeds configured maximum');
  });

  it('enforces draft -> submit -> lock -> DOS verify -> Head Teacher publish -> authorized correction with version history', async () => {
    const exam = dbRef
      .prepare(`SELECT id FROM examinations WHERE code = 'EOT-2026-T2'`)
      .get() as { id: number };
    const s2 = dbRef.prepare(`SELECT id FROM classes WHERE code = 'S.2'`).get() as { id: number };
    const s2North = dbRef
      .prepare(`SELECT id FROM streams WHERE class_id = ? AND name = 'North'`)
      .get(s2.id) as { id: number };
    const mtc = dbRef.prepare(`SELECT id FROM subjects WHERE code = 'MTC'`).get() as { id: number };
    const cwCat = dbRef
      .prepare(`SELECT id FROM assessment_categories WHERE examination_id = ? AND code = 'CW'`)
      .get(exam.id) as { id: number };
    const student = dbRef
      .prepare(
        `SELECT student_id FROM student_enrolments WHERE class_id = ? AND stream_id = ? LIMIT 1`
      )
      .get(s2.id, s2North.id) as { student_id: number };

    // Ensure MTC S.2 North starts as DRAFT
    dbRef
      .prepare(
        `UPDATE result_submissions SET status = 'DRAFT' WHERE examination_id = ? AND class_id = ? AND stream_id = ? AND subject_id = ?`
      )
      .run(exam.id, s2.id, s2North.id, mtc.id);

    // 1. Valid draft save
    const draftRes = await request(app)
      .post('/api/marks/save-draft')
      .set('Authorization', `Bearer ${mathTeacherToken}`)
      .send({
        examinationId: exam.id,
        classId: s2.id,
        streamId: s2North.id,
        subjectId: mtc.id,
        entries: [
          {
            studentId: student.student_id,
            assessmentCategoryId: cwCat.id,
            score: 17,
            statusFlag: 'PRESENT',
          },
        ],
      });
    expect(draftRes.status).toBe(200);
    expect(draftRes.body.savedCount).toBe(1);

    // 2. Submit for verification
    const submitRes = await request(app)
      .post('/api/marks/submit')
      .set('Authorization', `Bearer ${mathTeacherToken}`)
      .send({
        examinationId: exam.id,
        classId: s2.id,
        streamId: s2North.id,
        subjectId: mtc.id,
        teacherNotes: 'Ready for review',
      });
    expect(submitRes.status).toBe(200);
    const submissionId = submitRes.body.submissionId as number;

    // 3. Locked edit rejected (409)
    const lockedRes = await request(app)
      .post('/api/marks/save-draft')
      .set('Authorization', `Bearer ${mathTeacherToken}`)
      .send({
        examinationId: exam.id,
        classId: s2.id,
        streamId: s2North.id,
        subjectId: mtc.id,
        entries: [
          {
            studentId: student.student_id,
            assessmentCategoryId: cwCat.id,
            score: 18,
            statusFlag: 'PRESENT',
          },
        ],
      });
    expect(lockedRes.status).toBe(409);

    // 4. DOS Verify
    const verifyRes = await request(app)
      .post('/api/marks/verify')
      .set('Authorization', `Bearer ${dosToken}`)
      .send({ submissionId, decision: 'VERIFIED', comments: 'Checked and balanced' });
    expect(verifyRes.status).toBe(200);

    // 5. Head Teacher Approve & Publish
    const publishRes = await request(app)
      .post('/api/marks/approve')
      .set('Authorization', `Bearer ${headToken}`)
      .send({ submissionIds: [submissionId], decision: 'PUBLISHED', comments: 'Approved for reports' });
    expect(publishRes.status).toBe(200);

    // 6. Authorized Post-Approval Correction
    const corrRes = await request(app)
      .post('/api/marks/correct-approved')
      .set('Authorization', `Bearer ${headToken}`)
      .send({
        examinationId: exam.id,
        classId: s2.id,
        streamId: s2North.id,
        subjectId: mtc.id,
        studentId: student.student_id,
        assessmentCategoryId: cwCat.id,
        newScore: 19,
        reason: 'Verified script re-addition error (+2 marks)',
      });
    expect(corrRes.status).toBe(200);

    const versionRow = dbRef
      .prepare(
        `SELECT previous_score, new_score, reason FROM result_versions
         WHERE examination_id = ? AND student_id = ? AND subject_id = ? ORDER BY id DESC LIMIT 1`
      )
      .get(exam.id, student.student_id, mtc.id) as {
      previous_score: number;
      new_score: number;
      reason: string;
    };
    expect(versionRow.previous_score).toBe(17);
    expect(versionRow.new_score).toBe(19);
    expect(versionRow.reason).toContain('re-addition');
  });
});

describe('4. Automated Grading & Calculation Engine', () => {
  const categories = [
    { id: 1, name: 'Coursework', code: 'CW', max_marks: 20, weight_percentage: 20, sort_order: 1 },
    { id: 2, name: 'Mid-Term', code: 'MID', max_marks: 30, weight_percentage: 30, sort_order: 2 },
    { id: 3, name: 'End of Term', code: 'EOT', max_marks: 100, weight_percentage: 50, sort_order: 3 },
  ];

  const boundaries = [
    { id: 1, grade: 'A', min_score: 80, max_score: 100, points: 1, descriptor: 'Excellent', remarks: null },
    { id: 2, grade: 'B', min_score: 70, max_score: 79.99, points: 2, descriptor: 'Very Good', remarks: null },
    { id: 3, grade: 'C', min_score: 60, max_score: 69.99, points: 3, descriptor: 'Good', remarks: null },
    { id: 4, grade: 'D', min_score: 50, max_score: 59.99, points: 4, descriptor: 'Fair', remarks: null },
    { id: 5, grade: 'E', min_score: 0, max_score: 49.99, points: 5, descriptor: 'Needs Improvement', remarks: null },
  ];

  it('computes accurate weighted total and resolves configurable grade boundaries', () => {
    // CW: 16/20 -> 16%, MID: 24/30 -> 24%, EOT: 80/100 -> 40% => Total = 80.0% (Grade A)
    const calc = gradingEngine.calculateWeightedSubjectScore(categories, [
      { assessment_category_id: 1, score: 16, status_flag: 'PRESENT' },
      { assessment_category_id: 2, score: 24, status_flag: 'PRESENT' },
      { assessment_category_id: 3, score: 80, status_flag: 'PRESENT' },
    ]);
    expect(calc.status).toBe('ASSESSED');
    expect(calc.weightedTotal).toBe(80);
    expect(gradingEngine.resolveGrade(calc.weightedTotal!, boundaries)?.grade).toBe('A');
  });

  it('handles ABSENT and EXEMPTED assessment entries without crashing or unfairly penalizing exemptions', () => {
    const absentCalc = gradingEngine.calculateWeightedSubjectScore(categories, [
      { assessment_category_id: 1, score: null, status_flag: 'ABSENT' },
      { assessment_category_id: 2, score: null, status_flag: 'ABSENT' },
      { assessment_category_id: 3, score: null, status_flag: 'ABSENT' },
    ]);
    expect(absentCalc.status).toBe('ABSENT');
    expect(absentCalc.weightedTotal).toBe(0);

    const fullExempt = gradingEngine.calculateWeightedSubjectScore(categories, [
      { assessment_category_id: 1, score: null, status_flag: 'EXEMPTED' },
      { assessment_category_id: 2, score: null, status_flag: 'EXEMPTED' },
      { assessment_category_id: 3, score: null, status_flag: 'EXEMPTED' },
    ]);
    expect(fullExempt.status).toBe('EXEMPTED');
    expect(fullExempt.weightedTotal).toBeNull();

    // Exempted from MID (30%), scored 100% on CW (20%) & EOT (50%) -> normalized 70/70 = 100%
    const partialExempt = gradingEngine.calculateWeightedSubjectScore(categories, [
      { assessment_category_id: 1, score: 20, status_flag: 'PRESENT' },
      { assessment_category_id: 2, score: null, status_flag: 'EXEMPTED' },
      { assessment_category_id: 3, score: 100, status_flag: 'PRESENT' },
    ]);
    expect(partialExempt.status).toBe('ASSESSED');
    expect(partialExempt.weightedTotal).toBe(100);
  });

  it('assigns standard competition tie rankings (1, 1, 3) on equal average scores', () => {
    const exam = dbRef
      .prepare(`SELECT id FROM examinations WHERE code = 'EOT-2026-T2'`)
      .get() as { id: number };
    const s3 = dbRef.prepare(`SELECT id FROM classes WHERE code = 'S.3'`).get() as { id: number };

    // Pick first two S.3 North students (all 10 subjects populated) and force identical top marks
    const students = dbRef
      .prepare(
        `SELECT se.student_id FROM student_enrolments se
         JOIN streams st ON st.id = se.stream_id
         WHERE se.class_id = ? AND st.name = 'North' AND se.term_id = (SELECT term_id FROM examinations WHERE id = ?)
         LIMIT 2`
      )
      .all(s3.id, exam.id) as Array<{ student_id: number }>;

    const [stA, stB] = students;
    const stAMarks = dbRef
      .prepare(
        `SELECT subject_id, assessment_category_id, score, status_flag FROM marks WHERE examination_id = ? AND student_id = ?`
      )
      .all(exam.id, stA.student_id) as Array<{
      subject_id: number;
      assessment_category_id: number;
      score: number | null;
      status_flag: string;
    }>;

    dbRef.transaction(() => {
      dbRef
        .prepare(`UPDATE marks SET score = 20, status_flag = 'PRESENT' WHERE examination_id = ? AND student_id IN (?, ?) AND assessment_category_id IN (SELECT id FROM assessment_categories WHERE examination_id = ? AND code = 'CW')`)
        .run(exam.id, stA.student_id, stB.student_id, exam.id);
      dbRef
        .prepare(`UPDATE marks SET score = 30, status_flag = 'PRESENT' WHERE examination_id = ? AND student_id IN (?, ?) AND assessment_category_id IN (SELECT id FROM assessment_categories WHERE examination_id = ? AND code = 'MID')`)
        .run(exam.id, stA.student_id, stB.student_id, exam.id);
      dbRef
        .prepare(`UPDATE marks SET score = 100, status_flag = 'PRESENT' WHERE examination_id = ? AND student_id IN (?, ?) AND assessment_category_id IN (SELECT id FROM assessment_categories WHERE examination_id = ? AND code = 'EOT')`)
        .run(exam.id, stA.student_id, stB.student_id, exam.id);
    })();

    expect(stAMarks.length).toBeGreaterThan(0);
    gradingEngine.recalculateExaminationClass(exam.id, s3.id);

    const summaries = dbRef
      .prepare(
        `SELECT student_id, average_score, class_position FROM student_exam_summaries
         WHERE examination_id = ? AND class_id = ? ORDER BY class_position ASC`
      )
      .all(exam.id, s3.id) as Array<{
      student_id: number;
      average_score: number;
      class_position: number;
    }>;

    expect(summaries[0].class_position).toBe(1);
    expect(summaries[1].class_position).toBe(1);
    expect(summaries[2].class_position).toBe(3);
  });
});

describe('5. Report Card Generation & Privacy-Compliant QR Verification', () => {
  it('assembles preview data, generates single & bulk PDFs, and verifies QR without leaking PII/marks', async () => {
    const exam = dbRef
      .prepare(`SELECT id FROM examinations WHERE code = 'EOT-2026-T2'`)
      .get() as { id: number };
    const s2 = dbRef.prepare(`SELECT id FROM classes WHERE code = 'S.2'`).get() as { id: number };
    const student = dbRef
      .prepare(
        `SELECT student_id FROM student_exam_summaries WHERE examination_id = ? AND class_id = ? LIMIT 1`
      )
      .get(exam.id, s2.id) as { student_id: number };

    // 1. Report card live preview
    const previewRes = await request(app)
      .get(`/api/reports/preview/${student.student_id}`)
      .query({ examinationId: exam.id })
      .set('Authorization', `Bearer ${headToken}`);
    expect(previewRes.status).toBe(200);
    expect(previewRes.body.reportRef).toMatch(/^BGS-/);
    expect(Array.isArray(previewRes.body.subjects)).toBe(true);

    // 2. Single Student PDF buffer
    const pdfRes = await request(app)
      .get(`/api/reports/pdf/student/${student.student_id}`)
      .query({ examinationId: exam.id })
      .set('Authorization', `Bearer ${headToken}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers['content-type']).toContain('application/pdf');
    expect((pdfRes.body as Buffer).subarray(0, 5).toString('utf8')).toBe('%PDF-');

    // 3. Bulk PDF buffer for S.2
    const bulkRes = await request(app)
      .post('/api/reports/pdf/bulk')
      .set('Authorization', `Bearer ${headToken}`)
      .send({ examinationId: exam.id, classId: s2.id })
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(bulkRes.status).toBe(200);
    expect((bulkRes.body as Buffer).subarray(0, 5).toString('utf8')).toBe('%PDF-');

    // 4. Public QR verification endpoint (no auth required, no marks or guardian PII exposed)
    const verifyRes = await request(app).get(
      `/api/reports/verify/${encodeURIComponent(previewRes.body.reportRef)}`
    );
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.verified).toBe(true);
    expect(verifyRes.body.schoolName).toBe('BUYANJA GRAMMAR SCHOOL');
    expect(verifyRes.body.subjects).toBeUndefined();
    expect(verifyRes.body.guardianPhone).toBeUndefined();
    expect(verifyRes.body.averageScore).toBeUndefined();
  });
});

describe('6. Security & Audit Integrity', () => {
  it('safely parameterizes SQL injection attempts in search & login', async () => {
    const sqliLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: "' OR '1'='1", password: "' OR '1'='1" });
    expect(sqliLogin.status).toBe(400);

    const sqliSearch = await request(app)
      .get('/api/students')
      .query({ search: "Amina' OR '1'='1; DROP TABLE students;--" })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(sqliSearch.status).toBe(200);
    expect(Array.isArray(sqliSearch.body.students)).toBe(true);

    // Verify students table remains intact
    const countRow = dbRef.prepare(`SELECT COUNT(*) AS cnt FROM students`).get() as { cnt: number };
    expect(countRow.cnt).toBeGreaterThan(20);
  });

  it('rejects non-image uploads to student photo endpoint', async () => {
    const student = dbRef.prepare(`SELECT id FROM students LIMIT 1`).get() as { id: number };
    const uploadRes = await request(app)
      .post(`/api/students/${student.id}/photo`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('photo', Buffer.from('not an image payload'), {
        filename: 'malicious.txt',
        contentType: 'text/plain',
      });
    expect(uploadRes.status).toBe(400);
  });

  it('enforces read-only audit logs and records critical mutations', async () => {
    const delRes = await request(app)
      .delete('/api/admin/audit-logs')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([404, 405]).toContain(delRes.status);

    const logsRes = await request(app)
      .get('/api/admin/audit-logs')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(logsRes.status).toBe(200);
    const actions = (logsRes.body.logs as Array<{ action: string }>).map((l) => l.action);
    expect(actions).toContain('APPROVED_MARK_CORRECTED');
    expect(actions).toContain('MARKS_SUBMITTED');
  });
});
