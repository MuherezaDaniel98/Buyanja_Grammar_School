import bcrypt from 'bcryptjs';
import { db } from './db.js';
import { recalculateExaminationClass } from './services/gradingEngine.js';

export function seedDatabaseIfEmpty(): void {
  const userCountRow = db.prepare(`SELECT COUNT(*) AS cnt FROM users`).get() as { cnt: number };
  if (userCountRow.cnt > 0) {
    db.prepare(
      `UPDATE system_settings
       SET setting_value = '/assets/aistudio/Bgs_logo_6081ecf0.png', updated_at = datetime('now')
       WHERE setting_key = 'school_logo_url'
         AND setting_value = '/src/assets/images/bgs_school_crest_1795667064693.jpg'`
    ).run();
    return;
  }

  const seedTx = db.transaction(() => {
    // 1. Roles
    const rolesData = [
      {
        code: 'SYSTEM_ADMIN',
        name: 'System Administrator',
        description: 'Full system configuration, user management, grading policies, backups, and audit logs',
      },
      {
        code: 'HEAD_TEACHER',
        name: 'Head Teacher',
        description: 'School-wide academic oversight, final results approval, remarks, and institutional reports',
      },
      {
        code: 'DOS',
        name: 'Director of Studies',
        description: 'Academic operations, teacher allocations, marks verification, and examination summaries',
      },
      {
        code: 'CLASS_TEACHER',
        name: 'Class Teacher',
        description: 'Assigned class monitoring, student comments, attendance, and permitted class reports',
      },
      {
        code: 'SUBJECT_TEACHER',
        name: 'Subject Teacher',
        description: 'Marks entry, Excel import, draft saving, and submission for assigned subjects',
      },
    ];

    const insertRole = db.prepare(`INSERT INTO roles (code, name, description) VALUES (?, ?, ?)`);
    const roleIds = new Map<string, number>();
    for (const r of rolesData) {
      const res = insertRole.run(r.code, r.name, r.description);
      roleIds.set(r.code, Number(res.lastInsertRowid));
    }

    // 2. Permissions
    const permissionsData = [
      ['dashboard.view', 'Dashboard', 'View role dashboard'],
      ['students.view', 'Students', 'View student records'],
      ['students.manage', 'Students', 'Register, edit, promote, and import students'],
      ['teachers.view', 'Teachers', 'View teacher directory'],
      ['teachers.manage', 'Teachers', 'Register and manage teachers'],
      ['academics.view', 'Academics', 'View classes, streams, subjects, and terms'],
      ['academics.manage', 'Academics', 'Configure academic years, terms, classes, subjects, and allocations'],
      ['exams.configure', 'Examinations', 'Configure examinations, assessments, and grading scales'],
      ['marks.enter', 'Marks', 'Enter, import, save drafts, and submit marks for assigned subjects'],
      ['marks.verify', 'Results', 'Verify or return submitted marks (DOS)'],
      ['results.approve', 'Results', 'Perform final approval, lock, and publish results (Head Teacher)'],
      ['results.correct_approved', 'Results', 'Perform authorized post-approval mark corrections'],
      ['results.view_published', 'Results', 'View published examination results'],
      ['comments.manage', 'Results', 'Enter class teacher comments and attendance'],
      ['headteacher.remarks', 'Results', 'Enter Head Teacher remarks on report cards'],
      ['reports.generate', 'Reports', 'Preview and generate PDF/Excel report cards and summaries'],
      ['analytics.view', 'Analytics', 'View academic analytics and early-warning risk indicators'],
      ['notifications.manage', 'Notifications', 'View and broadcast academic notifications'],
      ['audit.view', 'Security', 'View immutable audit logs'],
      ['users.manage', 'Administration', 'Manage users, roles, and account activation'],
      ['settings.manage', 'Administration', 'Configure school identity, templates, and backups'],
    ];

    const insertPerm = db.prepare(
      `INSERT INTO permissions (code, module, description) VALUES (?, ?, ?)`
    );
    const permIds = new Map<string, number>();
    for (const [code, module, desc] of permissionsData) {
      const res = insertPerm.run(code, module, desc);
      permIds.set(code, Number(res.lastInsertRowid));
    }

    const rolePermMap: Record<string, string[]> = {
      SYSTEM_ADMIN: permissionsData.map((p) => p[0]),
      HEAD_TEACHER: [
        'dashboard.view',
        'students.view',
        'teachers.view',
        'academics.view',
        'results.approve',
        'results.correct_approved',
        'results.view_published',
        'headteacher.remarks',
        'reports.generate',
        'analytics.view',
        'notifications.manage',
        'audit.view',
      ],
      DOS: [
        'dashboard.view',
        'students.view',
        'students.manage',
        'teachers.view',
        'teachers.manage',
        'academics.view',
        'academics.manage',
        'exams.configure',
        'marks.verify',
        'results.correct_approved',
        'results.view_published',
        'reports.generate',
        'analytics.view',
        'notifications.manage',
      ],
      CLASS_TEACHER: [
        'dashboard.view',
        'students.view',
        'academics.view',
        'marks.enter',
        'results.view_published',
        'comments.manage',
        'reports.generate',
        'analytics.view',
      ],
      SUBJECT_TEACHER: [
        'dashboard.view',
        'students.view',
        'academics.view',
        'marks.enter',
        'results.view_published',
      ],
    };

    const insertRP = db.prepare(
      `INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)`
    );
    for (const [rCode, perms] of Object.entries(rolePermMap)) {
      const rId = roleIds.get(rCode)!;
      for (const pCode of perms) {
        insertRP.run(rId, permIds.get(pCode)!);
      }
    }

    // 3. Users & Staff Accounts (Clearly labelled demonstration accounts)
    const demoPassHash = bcrypt.hashSync('Bgs@2026!', 10);
    const insertUser = db.prepare(`
      INSERT INTO users (full_name, email, phone, password_hash, is_active)
      VALUES (?, ?, ?, ?, 1)
    `);
    const insertUR = db.prepare(`INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`);

    const createStaffUser = (
      fullName: string,
      email: string,
      phone: string,
      roleCode: string
    ): number => {
      const uRes = insertUser.run(fullName, email, phone, demoPassHash);
      const userId = Number(uRes.lastInsertRowid);
      insertUR.run(userId, roleIds.get(roleCode)!);
      return userId;
    };

    const adminUserId = createStaffUser(
      'Samuel Mugisha',
      'admin@buyanjagrammar.ac.ug',
      '+256 772 410 112',
      'SYSTEM_ADMIN'
    );
    const headUserId = createStaffUser(
      'Grace Kiconco',
      'headteacher@buyanjagrammar.ac.ug',
      '+256 772 518 204',
      'HEAD_TEACHER'
    );
    const dosUserId = createStaffUser(
      'Patrick Byaruhanga',
      'dos@buyanjagrammar.ac.ug',
      '+256 774 309 811',
      'DOS'
    );
    const classTeacherUserId = createStaffUser(
      'Sarah Namukasa',
      'classteacher@buyanjagrammar.ac.ug',
      '+256 782 645 920',
      'CLASS_TEACHER'
    );
    const mathTeacherUserId = createStaffUser(
      'David Ochieng',
      'teacher@buyanjagrammar.ac.ug',
      '+256 752 889 134',
      'SUBJECT_TEACHER'
    );
    const scienceTeacherUserId = createStaffUser(
      'Rebecca Nantongo',
      'r.nantongo@buyanjagrammar.ac.ug',
      '+256 701 334 590',
      'SUBJECT_TEACHER'
    );
    const humanitiesTeacherUserId = createStaffUser(
      'Joseph Kato',
      'j.kato@buyanjagrammar.ac.ug',
      '+256 775 912 408',
      'SUBJECT_TEACHER'
    );

    // Teacher records
    const insertTeacher = db.prepare(`
      INSERT INTO teachers (user_id, staff_number, initials, qualification, specialization, department, hire_date, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
    `);
    const tDosId = Number(
      insertTeacher.run(
        dosUserId,
        'BGS-STF-003',
        'P.B.',
        'M.Ed Curriculum & Assessment',
        'Physics & Administration',
        'Sciences',
        '2019-02-01'
      ).lastInsertRowid
    );
    const tClassId = Number(
      insertTeacher.run(
        classTeacherUserId,
        'BGS-STF-004',
        'S.N.',
        'B.A. Education (Hons)',
        'English Language & Literature',
        'Languages',
        '2021-01-18'
      ).lastInsertRowid
    );
    const tMathId = Number(
      insertTeacher.run(
        mathTeacherUserId,
        'BGS-STF-005',
        'D.O.',
        'B.Sc. Education (Hons)',
        'Mathematics & ICT',
        'Mathematics',
        '2020-05-11'
      ).lastInsertRowid
    );
    const tSciId = Number(
      insertTeacher.run(
        scienceTeacherUserId,
        'BGS-STF-006',
        'R.N.',
        'B.Sc. Education',
        'Biology & Chemistry',
        'Sciences',
        '2022-02-07'
      ).lastInsertRowid
    );
    const tHumId = Number(
      insertTeacher.run(
        humanitiesTeacherUserId,
        'BGS-STF-007',
        'J.K.',
        'B.A. Education',
        'History, Geography & CRE',
        'Humanities',
        '2021-08-15'
      ).lastInsertRowid
    );
    const tHeadId = Number(
      insertTeacher.run(
        headUserId,
        'BGS-STF-002',
        'G.K.',
        'M.Ed Educational Leadership',
        'School Leadership',
        'Administration',
        '2017-01-10'
      ).lastInsertRowid
    );

    // 4. Academic Years & Terms
    const year2025Id = Number(
      db
        .prepare(
          `INSERT INTO academic_years (year_label, start_date, end_date, is_active, is_archived)
           VALUES ('2025', '2025-02-03', '2025-12-05', 0, 1)`
        )
        .run().lastInsertRowid
    );
    const year2026Id = Number(
      db
        .prepare(
          `INSERT INTO academic_years (year_label, start_date, end_date, is_active, is_archived)
           VALUES ('2026', '2026-02-02', '2026-12-04', 1, 0)`
        )
        .run().lastInsertRowid
    );

    const insertTerm = db.prepare(`
      INSERT INTO terms (academic_year_id, name, term_number, start_date, end_date, next_term_begins, is_active, is_archived)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const y2025T3Id = Number(
      insertTerm.run(year2025Id, 'Term III', 3, '2025-09-15', '2025-12-05', '2026-02-02', 0, 1).lastInsertRowid
    );
    const y2026T1Id = Number(
      insertTerm.run(year2026Id, 'Term I', 1, '2026-02-02', '2026-05-01', '2026-05-25', 0, 1).lastInsertRowid
    );
    const y2026T2Id = Number(
      insertTerm.run(year2026Id, 'Term II', 2, '2026-05-25', '2026-08-28', '2026-09-21', 1, 0).lastInsertRowid
    );
    insertTerm.run(year2026Id, 'Term III', 3, '2026-09-21', '2026-12-04', '2027-02-01', 0, 0);

    // 5. Classes & Streams
    const insertClass = db.prepare(
      `INSERT INTO classes (name, code, level, sort_order) VALUES (?, ?, ?, ?)`
    );
    const insertStream = db.prepare(`INSERT INTO streams (class_id, name) VALUES (?, ?)`);

    const s1Id = Number(insertClass.run('Senior One', 'S.1', 'O-Level', 1).lastInsertRowid);
    const s2Id = Number(insertClass.run('Senior Two', 'S.2', 'O-Level', 2).lastInsertRowid);
    const s3Id = Number(insertClass.run('Senior Three', 'S.3', 'O-Level', 3).lastInsertRowid);
    const s4Id = Number(insertClass.run('Senior Four', 'S.4', 'O-Level', 4).lastInsertRowid);

    const streamIds: Record<string, number> = {};
    for (const [cKey, cId] of [
      ['S1', s1Id],
      ['S2', s2Id],
      ['S3', s3Id],
      ['S4', s4Id],
    ] as Array<[string, number]>) {
      streamIds[`${cKey}_N`] = Number(insertStream.run(cId, 'North').lastInsertRowid);
      streamIds[`${cKey}_S`] = Number(insertStream.run(cId, 'South').lastInsertRowid);
    }

    // 6. Subjects
    const subjectsList = [
      { code: 'ENG', name: 'English Language', short: 'English', dept: 'Languages', core: 1 },
      { code: 'MTC', name: 'Mathematics', short: 'Math', dept: 'Mathematics', core: 1 },
      { code: 'PHY', name: 'Physics', short: 'Physics', dept: 'Sciences', core: 1 },
      { code: 'CHE', name: 'Chemistry', short: 'Chemistry', dept: 'Sciences', core: 1 },
      { code: 'BIO', name: 'Biology', short: 'Biology', dept: 'Sciences', core: 1 },
      { code: 'HIS', name: 'History & Political Ed.', short: 'History', dept: 'Humanities', core: 1 },
      { code: 'GEO', name: 'Geography', short: 'Geography', dept: 'Humanities', core: 1 },
      { code: 'CRE', name: 'Christian Religious Ed.', short: 'CRE', dept: 'Humanities', core: 0 },
      { code: 'ICT', name: 'Information & Comm. Tech', short: 'ICT', dept: 'Mathematics', core: 0 },
      { code: 'AGR', name: 'Agriculture', short: 'Agriculture', dept: 'Sciences', core: 0 },
    ];
    const insertSubj = db.prepare(`
      INSERT INTO subjects (code, name, short_name, department, is_core, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `);
    const subjIds: Record<string, number> = {};
    for (const s of subjectsList) {
      subjIds[s.code] = Number(
        insertSubj.run(s.code, s.name, s.short, s.dept, s.core).lastInsertRowid
      );
    }

    const insertClassSubj = db.prepare(
      `INSERT INTO class_subjects (class_id, subject_id, is_compulsory) VALUES (?, ?, ?)`
    );
    const classIds = [s1Id, s2Id, s3Id, s4Id];
    for (const cId of classIds) {
      for (const s of subjectsList) {
        insertClassSubj.run(cId, subjIds[s.code], s.core);
      }
    }

    // 7. Teacher Allocations (Active 2026 Term II & Term I)
    const insertAlloc = db.prepare(`
      INSERT INTO teacher_allocations (
        teacher_id, academic_year_id, term_id, class_id, stream_id, subject_id, is_class_teacher, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `);

    for (const termId of [y2026T1Id, y2026T2Id]) {
      // Class Teacher Sarah Namukasa -> S.2 North + teaches ENG across S.1, S.2, S.3
      insertAlloc.run(tClassId, year2026Id, termId, s2Id, streamIds.S2_N, subjIds.ENG, 1);
      insertAlloc.run(tClassId, year2026Id, termId, s2Id, streamIds.S2_S, subjIds.ENG, 0);
      insertAlloc.run(tClassId, year2026Id, termId, s1Id, streamIds.S1_N, subjIds.ENG, 0);
      insertAlloc.run(tClassId, year2026Id, termId, s1Id, streamIds.S1_S, subjIds.ENG, 0);
      insertAlloc.run(tClassId, year2026Id, termId, s3Id, streamIds.S3_N, subjIds.ENG, 0);
      insertAlloc.run(tClassId, year2026Id, termId, s4Id, streamIds.S4_N, subjIds.ENG, 0);

      // David Ochieng -> MTC + ICT
      insertAlloc.run(tMathId, year2026Id, termId, s1Id, streamIds.S1_N, subjIds.MTC, 1);
      insertAlloc.run(tMathId, year2026Id, termId, s1Id, streamIds.S1_S, subjIds.MTC, 0);
      insertAlloc.run(tMathId, year2026Id, termId, s2Id, streamIds.S2_N, subjIds.MTC, 0);
      insertAlloc.run(tMathId, year2026Id, termId, s2Id, streamIds.S2_S, subjIds.MTC, 0);
      insertAlloc.run(tMathId, year2026Id, termId, s3Id, streamIds.S3_N, subjIds.MTC, 0);
      insertAlloc.run(tMathId, year2026Id, termId, s4Id, streamIds.S4_N, subjIds.MTC, 0);
      insertAlloc.run(tMathId, year2026Id, termId, s2Id, streamIds.S2_N, subjIds.ICT, 0);
      insertAlloc.run(tMathId, year2026Id, termId, s1Id, streamIds.S1_N, subjIds.ICT, 0);

      // Rebecca Nantongo -> BIO, CHE, AGR
      insertAlloc.run(tSciId, year2026Id, termId, s1Id, streamIds.S1_N, subjIds.BIO, 0);
      insertAlloc.run(tSciId, year2026Id, termId, s1Id, streamIds.S1_N, subjIds.CHE, 0);
      insertAlloc.run(tSciId, year2026Id, termId, s2Id, streamIds.S2_N, subjIds.BIO, 0);
      insertAlloc.run(tSciId, year2026Id, termId, s2Id, streamIds.S2_N, subjIds.CHE, 0);
      insertAlloc.run(tSciId, year2026Id, termId, s2Id, streamIds.S2_N, subjIds.AGR, 0);
      insertAlloc.run(tSciId, year2026Id, termId, s3Id, streamIds.S3_N, subjIds.BIO, 1);
      insertAlloc.run(tSciId, year2026Id, termId, s4Id, streamIds.S4_N, subjIds.CHE, 0);

      // Patrick Byaruhanga (DOS) -> PHY
      insertAlloc.run(tDosId, year2026Id, termId, s1Id, streamIds.S1_N, subjIds.PHY, 0);
      insertAlloc.run(tDosId, year2026Id, termId, s2Id, streamIds.S2_N, subjIds.PHY, 0);
      insertAlloc.run(tDosId, year2026Id, termId, s3Id, streamIds.S3_N, subjIds.PHY, 0);
      insertAlloc.run(tDosId, year2026Id, termId, s4Id, streamIds.S4_N, subjIds.PHY, 1);

      // Joseph Kato -> HIS, GEO, CRE
      insertAlloc.run(tHumId, year2026Id, termId, s1Id, streamIds.S1_N, subjIds.HIS, 0);
      insertAlloc.run(tHumId, year2026Id, termId, s1Id, streamIds.S1_N, subjIds.GEO, 0);
      insertAlloc.run(tHumId, year2026Id, termId, s2Id, streamIds.S2_N, subjIds.HIS, 0);
      insertAlloc.run(tHumId, year2026Id, termId, s2Id, streamIds.S2_N, subjIds.GEO, 0);
      insertAlloc.run(tHumId, year2026Id, termId, s2Id, streamIds.S2_N, subjIds.CRE, 0);
      insertAlloc.run(tHumId, year2026Id, termId, s3Id, streamIds.S3_N, subjIds.GEO, 0);
      insertAlloc.run(tHumId, year2026Id, termId, s4Id, streamIds.S4_N, subjIds.HIS, 0);
    }

    // 8. Grading Scale & Boundaries (Configurable)
    const scaleId = Number(
      db
        .prepare(
          `INSERT INTO grading_scales (name, level, description, is_default)
           VALUES ('Buyanja O-Level Standard Scale', 'O-Level', 'Configurable 5-band institutional grading scale with aggregate points', 1)`
        )
        .run().lastInsertRowid
    );

    const boundaries = [
      ['A', 80, 100, 1, 'Excellent', 'Outstanding mastery of subject competencies'],
      ['B', 70, 79.99, 2, 'Very Good', 'Strong understanding and consistent execution'],
      ['C', 60, 69.99, 3, 'Good', 'Satisfactory performance with room for distinction'],
      ['D', 50, 59.99, 4, 'Fair', 'Basic competency achieved; extra practice advised'],
      ['E', 0, 49.99, 5, 'Needs Improvement', 'Requires targeted academic support and revision'],
    ];
    const insertBoundary = db.prepare(`
      INSERT INTO grading_boundaries (grading_scale_id, grade, min_score, max_score, points, descriptor, remarks)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const b of boundaries) {
      insertBoundary.run(scaleId, b[0], b[1], b[2], b[3], b[4], b[5]);
    }

    // 9. Examinations & Assessment Categories
    const insertExam = db.prepare(`
      INSERT INTO examinations (academic_year_id, term_id, name, code, exam_type, grading_scale_id, submission_deadline, is_active, ranking_enabled, aggregate_enabled)
      VALUES (?, ?, ?, ?, 'TERMLY', ?, ?, ?, 1, 1)
    `);
    const insertCat = db.prepare(`
      INSERT INTO assessment_categories (examination_id, name, code, max_marks, weight_percentage, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const exam2025T3Id = Number(
      insertExam.run(year2025Id, y2025T3Id, 'End of Term III Examination 2025', 'EOT-2025-T3', scaleId, '2025-11-28 17:00:00', 0).lastInsertRowid
    );
    const cat25 = [
      Number(insertCat.run(exam2025T3Id, 'Coursework & Activities', 'CW', 20, 20, 1).lastInsertRowid),
      Number(insertCat.run(exam2025T3Id, 'Mid-Term Test', 'MID', 30, 30, 2).lastInsertRowid),
      Number(insertCat.run(exam2025T3Id, 'End of Term Exam', 'EOT', 100, 50, 3).lastInsertRowid),
    ];

    const exam2026T1Id = Number(
      insertExam.run(year2026Id, y2026T1Id, 'End of Term I Examination 2026', 'EOT-2026-T1', scaleId, '2026-04-24 17:00:00', 0).lastInsertRowid
    );
    const cat26T1 = [
      Number(insertCat.run(exam2026T1Id, 'Coursework & Activities', 'CW', 20, 20, 1).lastInsertRowid),
      Number(insertCat.run(exam2026T1Id, 'Mid-Term Test', 'MID', 30, 30, 2).lastInsertRowid),
      Number(insertCat.run(exam2026T1Id, 'End of Term Exam', 'EOT', 100, 50, 3).lastInsertRowid),
    ];

    const exam2026T2Id = Number(
      insertExam.run(year2026Id, y2026T2Id, 'End of Term II Examination 2026', 'EOT-2026-T2', scaleId, '2026-08-21 17:00:00', 1).lastInsertRowid
    );
    const cat26T2 = [
      Number(insertCat.run(exam2026T2Id, 'Coursework & Activities', 'CW', 20, 20, 1).lastInsertRowid),
      Number(insertCat.run(exam2026T2Id, 'Mid-Term Test', 'MID', 30, 30, 2).lastInsertRowid),
      Number(insertCat.run(exam2026T2Id, 'End of Term Exam', 'EOT', 100, 50, 3).lastInsertRowid),
    ];

    // 10. Students & Guardians (40 students across S.1 - S.4)
    const sampleStudents = [
      // S.2 North (Main showcase class - 14 students)
      { first: 'Amina', last: 'Nalubega', gender: 'F', dob: '2011-03-14', cls: s2Id, str: streamIds.S2_N, prevCls: s1Id, prevStr: streamIds.S1_N, tier: 'TOP', guardian: 'Halima Nalubega', rel: 'Mother', phone: '+256 772 210 314' },
      { first: 'Brian', last: 'Turyasingura', gender: 'M', dob: '2011-06-22', cls: s2Id, str: streamIds.S2_N, prevCls: s1Id, prevStr: streamIds.S1_N, tier: 'TOP', guardian: 'Robert Turyasingura', rel: 'Father', phone: '+256 782 119 405' },
      { first: 'Claire', last: 'Akello', gender: 'F', dob: '2011-01-09', cls: s2Id, str: streamIds.S2_N, prevCls: s1Id, prevStr: streamIds.S1_N, tier: 'HIGH', guardian: 'Margaret Akello', rel: 'Mother', phone: '+256 701 445 812' },
      { first: 'Daniel', last: 'Ssemakula', gender: 'M', dob: '2010-11-18', cls: s2Id, str: streamIds.S2_N, prevCls: s1Id, prevStr: streamIds.S1_N, tier: 'HIGH', guardian: 'Edward Ssemakula', rel: 'Father', phone: '+256 774 603 221' },
      { first: 'Esther', last: 'Kobusingye', gender: 'F', dob: '2011-08-05', cls: s2Id, str: streamIds.S2_N, prevCls: s1Id, prevStr: streamIds.S1_N, tier: 'MID', guardian: 'Joy Kobusingye', rel: 'Aunt', phone: '+256 752 330 998' },
      { first: 'Francis', last: 'Okello', gender: 'M', dob: '2011-04-30', cls: s2Id, str: streamIds.S2_N, prevCls: s1Id, prevStr: streamIds.S1_N, tier: 'DECLINE', guardian: 'Charles Okello', rel: 'Father', phone: '+256 772 887 651' },
      { first: 'Gloria', last: 'Nansubuga', gender: 'F', dob: '2011-09-12', cls: s2Id, str: streamIds.S2_N, prevCls: s1Id, prevStr: streamIds.S1_N, tier: 'MID', guardian: 'Florence Nansubuga', rel: 'Mother', phone: '+256 783 412 009' },
      { first: 'Henry', last: 'Tumusiime', gender: 'M', dob: '2010-12-27', cls: s2Id, str: streamIds.S2_N, prevCls: s1Id, prevStr: streamIds.S1_N, tier: 'RISK', guardian: 'Peter Tumusiime', rel: 'Father', phone: '+256 772 908 114' },
      { first: 'Irene', last: 'Atuhaire', gender: 'F', dob: '2011-05-19', cls: s2Id, str: streamIds.S2_N, prevCls: s1Id, prevStr: streamIds.S1_N, tier: 'HIGH', guardian: 'Beatrice Atuhaire', rel: 'Mother', phone: '+256 704 512 377' },
      { first: 'Jonathan', last: 'Wasswa', gender: 'M', dob: '2011-02-08', cls: s2Id, str: streamIds.S2_N, prevCls: s1Id, prevStr: streamIds.S1_N, tier: 'MID', guardian: 'Moses Wasswa', rel: 'Father', phone: '+256 776 314 902' },
      { first: 'Kauthar', last: 'Namazzi', gender: 'F', dob: '2011-07-16', cls: s2Id, str: streamIds.S2_N, prevCls: s1Id, prevStr: streamIds.S1_N, tier: 'TOP', guardian: 'Sulaiman Namazzi', rel: 'Father', phone: '+256 751 229 844' },
      { first: 'Laban', last: 'Kigozi', gender: 'M', dob: '2011-10-03', cls: s2Id, str: streamIds.S2_N, prevCls: s1Id, prevStr: streamIds.S1_N, tier: 'RISK', guardian: 'Rose Kigozi', rel: 'Mother', phone: '+256 782 553 190' },
      { first: 'Miriam', last: 'Nabirye', gender: 'F', dob: '2011-01-25', cls: s2Id, str: streamIds.S2_N, prevCls: s1Id, prevStr: streamIds.S1_N, tier: 'MID', guardian: 'Samuel Nabirye', rel: 'Father', phone: '+256 772 710 432' },
      { first: 'Noah', last: 'Mwebaze', gender: 'M', dob: '2011-04-11', cls: s2Id, str: streamIds.S2_N, prevCls: s1Id, prevStr: streamIds.S1_N, tier: 'DECLINE', guardian: 'Agnes Mwebaze', rel: 'Mother', phone: '+256 779 112 678' },

      // S.1 North (8 students)
      { first: 'Olivia', last: 'Nakato', gender: 'F', dob: '2012-03-21', cls: s1Id, str: streamIds.S1_N, prevCls: null, prevStr: null, tier: 'TOP', guardian: 'John Nakato', rel: 'Father', phone: '+256 772 340 118' },
      { first: 'Paul', last: 'Kyaligonza', gender: 'M', dob: '2012-05-14', cls: s1Id, str: streamIds.S1_N, prevCls: null, prevStr: null, tier: 'HIGH', guardian: 'Mary Kyaligonza', rel: 'Mother', phone: '+256 702 881 450' },
      { first: 'Queen', last: 'Nankya', gender: 'F', dob: '2012-07-29', cls: s1Id, str: streamIds.S1_N, prevCls: null, prevStr: null, tier: 'MID', guardian: 'Pauline Nankya', rel: 'Mother', phone: '+256 774 221 903' },
      { first: 'Ronald', last: 'Bukenya', gender: 'M', dob: '2012-01-17', cls: s1Id, str: streamIds.S1_N, prevCls: null, prevStr: null, tier: 'MID', guardian: 'George Bukenya', rel: 'Father', phone: '+256 782 990 123' },
      { first: 'Sandra', last: 'Achieng', gender: 'F', dob: '2012-08-19', cls: s1Id, str: streamIds.S1_N, prevCls: null, prevStr: null, tier: 'HIGH', guardian: 'Susan Achieng', rel: 'Mother', phone: '+256 753 661 700' },
      { first: 'Timothy', last: 'Lubega', gender: 'M', dob: '2012-02-23', cls: s1Id, str: streamIds.S1_N, prevCls: null, prevStr: null, tier: 'RISK', guardian: 'David Lubega', rel: 'Father', phone: '+256 772 449 512' },
      { first: 'Ursula', last: 'Namatovu', gender: 'F', dob: '2012-09-04', cls: s1Id, str: streamIds.S1_N, prevCls: null, prevStr: null, tier: 'HIGH', guardian: 'Christine Namatovu', rel: 'Mother', phone: '+256 775 123 899' },
      { first: 'Victor', last: 'Opio', gender: 'M', dob: '2012-06-08', cls: s1Id, str: streamIds.S1_N, prevCls: null, prevStr: null, tier: 'MID', guardian: 'Martin Opio', rel: 'Father', phone: '+256 701 774 319' },

      // S.2 South (4 students)
      { first: 'Winnie', last: 'Kemigisha', gender: 'F', dob: '2011-04-02', cls: s2Id, str: streamIds.S2_S, prevCls: s1Id, prevStr: streamIds.S1_S, tier: 'HIGH', guardian: 'Grace Kemigisha', rel: 'Mother', phone: '+256 772 678 901' },
      { first: 'Xavier', last: 'Mugerwa', gender: 'M', dob: '2011-08-15', cls: s2Id, str: streamIds.S2_S, prevCls: s1Id, prevStr: streamIds.S1_S, tier: 'MID', guardian: 'Fred Mugerwa', rel: 'Father', phone: '+256 782 345 612' },
      { first: 'Yvette', last: 'Nabisere', gender: 'F', dob: '2011-12-01', cls: s2Id, str: streamIds.S2_S, prevCls: s1Id, prevStr: streamIds.S1_S, tier: 'TOP', guardian: 'Ruth Nabisere', rel: 'Mother', phone: '+256 752 443 210' },
      { first: 'Zachary', last: 'Kiggundu', gender: 'M', dob: '2011-05-27', cls: s2Id, str: streamIds.S2_S, prevCls: s1Id, prevStr: streamIds.S1_S, tier: 'MID', guardian: 'Andrew Kiggundu', rel: 'Father', phone: '+256 774 119 832' },

      // S.3 North (6 students)
      { first: 'Abigail', last: 'Birungi', gender: 'F', dob: '2010-02-14', cls: s3Id, str: streamIds.S3_N, prevCls: s2Id, prevStr: streamIds.S2_N, tier: 'TOP', guardian: 'Jane Birungi', rel: 'Mother', phone: '+256 772 511 908' },
      { first: 'Benjamin', last: 'Kizza', gender: 'M', dob: '2010-07-19', cls: s3Id, str: streamIds.S3_N, prevCls: s2Id, prevStr: streamIds.S2_N, tier: 'HIGH', guardian: 'Richard Kizza', rel: 'Father', phone: '+256 782 612 733' },
      { first: 'Caroline', last: 'Namono', gender: 'F', dob: '2010-09-23', cls: s3Id, str: streamIds.S3_N, prevCls: s2Id, prevStr: streamIds.S2_N, tier: 'MID', guardian: 'Sarah Namono', rel: 'Mother', phone: '+256 701 398 441' },
      { first: 'Dennis', last: 'Odongo', gender: 'M', dob: '2010-03-07', cls: s3Id, str: streamIds.S3_N, prevCls: s2Id, prevStr: streamIds.S2_N, tier: 'DECLINE', guardian: 'Michael Odongo', rel: 'Father', phone: '+256 774 881 209' },
      { first: 'Evelyn', last: 'Nakimuli', gender: 'F', dob: '2010-11-11', cls: s3Id, str: streamIds.S3_N, prevCls: s2Id, prevStr: streamIds.S2_N, tier: 'HIGH', guardian: 'Prossy Nakimuli', rel: 'Mother', phone: '+256 752 773 410' },
      { first: 'Felix', last: 'Kasule', gender: 'M', dob: '2010-06-28', cls: s3Id, str: streamIds.S3_N, prevCls: s2Id, prevStr: streamIds.S2_N, tier: 'MID', guardian: 'James Kasule', rel: 'Father', phone: '+256 772 199 540' },

      // S.4 North (6 students)
      { first: 'Grace', last: 'Nabayinda', gender: 'F', dob: '2009-04-16', cls: s4Id, str: streamIds.S4_N, prevCls: s3Id, prevStr: streamIds.S3_N, tier: 'TOP', guardian: 'Harriet Nabayinda', rel: 'Mother', phone: '+256 772 802 119' },
      { first: 'Isaac', last: 'Mukasa', gender: 'M', dob: '2009-08-22', cls: s4Id, str: streamIds.S4_N, prevCls: s3Id, prevStr: streamIds.S3_N, tier: 'TOP', guardian: 'Joseph Mukasa', rel: 'Father', phone: '+256 782 409 318' },
      { first: 'Judith', last: 'Apio', gender: 'F', dob: '2009-01-30', cls: s4Id, str: streamIds.S4_N, prevCls: s3Id, prevStr: streamIds.S3_N, tier: 'HIGH', guardian: 'Grace Apio', rel: 'Mother', phone: '+256 701 665 210' },
      { first: 'Kenneth', last: 'Byamukama', gender: 'M', dob: '2009-10-12', cls: s4Id, str: streamIds.S4_N, prevCls: s3Id, prevStr: streamIds.S3_N, tier: 'MID', guardian: 'Stephen Byamukama', rel: 'Father', phone: '+256 774 332 876' },
      { first: 'Lydia', last: 'Kanyesigye', gender: 'F', dob: '2009-05-09', cls: s4Id, str: streamIds.S4_N, prevCls: s3Id, prevStr: streamIds.S3_N, tier: 'HIGH', guardian: 'Miriam Kanyesigye', rel: 'Mother', phone: '+256 752 908 112' },
      { first: 'Martin', last: 'Ssekandi', gender: 'M', dob: '2009-12-19', cls: s4Id, str: streamIds.S4_N, prevCls: s3Id, prevStr: streamIds.S3_N, tier: 'RISK', guardian: 'Paul Ssekandi', rel: 'Father', phone: '+256 772 145 778' },
    ];

    const insertStudent = db.prepare(`
      INSERT INTO students (admission_number, first_name, last_name, gender, date_of_birth, admission_date, status)
      VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')
    `);
    const insertGuardian = db.prepare(`
      INSERT INTO guardians (student_id, full_name, relationship, phone, address, is_primary)
      VALUES (?, ?, ?, ?, 'Buyanja Sub-county, Rukungiri District', 1)
    `);
    const insertEnrol = db.prepare(`
      INSERT INTO student_enrolments (student_id, academic_year_id, term_id, class_id, stream_id, roll_number, status)
      VALUES (?, ?, ?, ?, ?, ?, 'ENROLLED')
    `);

    const studentRecords: Array<{
      id: number;
      cls: number;
      str: number;
      tier: string;
      idx: number;
    }> = [];

    sampleStudents.forEach((st, idx) => {
      const admYear = st.cls === s1Id ? '2026' : st.cls === s2Id ? '2025' : st.cls === s3Id ? '2024' : '2023';
      const admNo = `BGS/${admYear}/${String(idx + 1).padStart(4, '0')}`;
      const admDate = `${admYear}-02-05`;
      const sId = Number(
        insertStudent.run(admNo, st.first, st.last, st.gender, st.dob, admDate).lastInsertRowid
      );
      insertGuardian.run(sId, st.guardian, st.rel, st.phone);

      if (st.prevCls && st.prevStr) {
        insertEnrol.run(sId, year2025Id, y2025T3Id, st.prevCls, st.prevStr, `R-${idx + 1}`);
      }
      insertEnrol.run(sId, year2026Id, y2026T1Id, st.cls, st.str, `R-${idx + 1}`);
      insertEnrol.run(sId, year2026Id, y2026T2Id, st.cls, st.str, `R-${idx + 1}`);

      studentRecords.push({ id: sId, cls: st.cls, str: st.str, tier: st.tier, idx });
    });

    // 11. Marks Seeding (2025 T3 historical, 2026 T1 Published, 2026 T2 Multi-Stage Workflow)
    const insertMark = db.prepare(`
      INSERT INTO marks (
        examination_id, student_id, class_id, stream_id, subject_id, assessment_category_id,
        score, status_flag, entered_by, updated_by, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PRESENT', ?, ?, 1)
    `);

    const deterministicScore = (
      studentIdx: number,
      subjIdx: number,
      tier: string,
      maxMarks: number,
      termShift: number
    ): number => {
      let basePct = 66;
      if (tier === 'TOP') basePct = 86;
      else if (tier === 'HIGH') basePct = 74;
      else if (tier === 'MID') basePct = 62;
      else if (tier === 'DECLINE') basePct = termShift >= 0 ? 51 : 73; // Significant term-to-term drop!
      else if (tier === 'RISK') basePct = 42;

      const jitter = ((studentIdx * 7 + subjIdx * 13) % 15) - 7;
      const pct = Math.max(24, Math.min(97, basePct + jitter + (termShift === -1 ? -2 : 0)));
      return Math.round((pct / 100) * maxMarks * 10) / 10;
    };

    const allSubjectCodes = Object.keys(subjIds);

    // Seed 2025 T3 (for promoted students) & 2026 T1 (all students)
    for (const st of studentRecords) {
      allSubjectCodes.forEach((sCode, sIdx) => {
        const subId = subjIds[sCode];
        // 2025 T3
        if (st.cls !== s1Id) {
          const prevCls = st.cls === s2Id ? s1Id : st.cls === s3Id ? s2Id : s3Id;
          const prevStr = st.str === streamIds.S2_S ? streamIds.S1_S : st.cls === s2Id ? streamIds.S1_N : st.cls === s3Id ? streamIds.S2_N : streamIds.S3_N;
          insertMark.run(exam2025T3Id, st.id, prevCls, prevStr, subId, cat25[0], deterministicScore(st.idx, sIdx, st.tier, 20, -1), mathTeacherUserId, mathTeacherUserId);
          insertMark.run(exam2025T3Id, st.id, prevCls, prevStr, subId, cat25[1], deterministicScore(st.idx, sIdx, st.tier, 30, -1), mathTeacherUserId, mathTeacherUserId);
          insertMark.run(exam2025T3Id, st.id, prevCls, prevStr, subId, cat25[2], deterministicScore(st.idx, sIdx, st.tier, 100, -1), mathTeacherUserId, mathTeacherUserId);
        }

        // 2026 T1 (all subjects published)
        insertMark.run(exam2026T1Id, st.id, st.cls, st.str, subId, cat26T1[0], deterministicScore(st.idx, sIdx, st.tier, 20, -1), mathTeacherUserId, mathTeacherUserId);
        insertMark.run(exam2026T1Id, st.id, st.cls, st.str, subId, cat26T1[1], deterministicScore(st.idx, sIdx, st.tier, 30, -1), mathTeacherUserId, mathTeacherUserId);
        insertMark.run(exam2026T1Id, st.id, st.cls, st.str, subId, cat26T1[2], deterministicScore(st.idx, sIdx, st.tier, 100, -1), mathTeacherUserId, mathTeacherUserId);

        // 2026 T2 (Active term: leave AGR in S.2 North as DRAFT and ICT in S.1 North as RETURNED to showcase full workflow!)
        const isDraftOnly = st.cls === s2Id && st.str === streamIds.S2_N && sCode === 'AGR';
        if (!isDraftOnly) {
          insertMark.run(exam2026T2Id, st.id, st.cls, st.str, subId, cat26T2[0], deterministicScore(st.idx, sIdx, st.tier, 20, 0), mathTeacherUserId, mathTeacherUserId);
          insertMark.run(exam2026T2Id, st.id, st.cls, st.str, subId, cat26T2[1], deterministicScore(st.idx, sIdx, st.tier, 30, 0), mathTeacherUserId, mathTeacherUserId);
          insertMark.run(exam2026T2Id, st.id, st.cls, st.str, subId, cat26T2[2], deterministicScore(st.idx, sIdx, st.tier, 100, 0), mathTeacherUserId, mathTeacherUserId);
        } else {
          // Partial draft marks for AGR in S.2 North
          if (st.idx % 2 === 0) {
            insertMark.run(exam2026T2Id, st.id, st.cls, st.str, subId, cat26T2[0], deterministicScore(st.idx, sIdx, st.tier, 20, 0), scienceTeacherUserId, scienceTeacherUserId);
          }
        }
      });
    }

    // Submissions workflow states
    const insertSub = db.prepare(`
      INSERT INTO result_submissions (
        examination_id, class_id, stream_id, subject_id, submitted_by, status,
        teacher_notes, dos_notes, headteacher_notes, submitted_at, verified_by, verified_at, approved_by, approved_at, published_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // 2026 T1: all PUBLISHED
    for (const cId of classIds) {
      const cStreams = db.prepare(`SELECT id FROM streams WHERE class_id = ?`).all(cId) as Array<{ id: number }>;
      for (const str of cStreams) {
        for (const sCode of allSubjectCodes) {
          insertSub.run(
            exam2026T1Id, cId, str.id, subjIds[sCode], mathTeacherUserId, 'PUBLISHED',
            'All scripts marked and moderated.', 'Verified against mark sheets.', 'Approved for Term I publication.',
            '2026-04-22 14:15:00', dosUserId, '2026-04-23 10:30:00', headUserId, '2026-04-24 09:00:00', '2026-04-24 09:00:00'
          );
        }
      }
    }

    // 2026 T2: Realistic mixed pipeline states for S.2 North and other streams
    const t2StatusMap: Record<string, string> = {
      ENG: 'PUBLISHED',
      MTC: 'APPROVED',
      PHY: 'VERIFIED',
      CHE: 'SUBMITTED',
      BIO: 'PUBLISHED',
      HIS: 'PUBLISHED',
      GEO: 'VERIFIED',
      CRE: 'SUBMITTED',
      ICT: 'RETURNED',
      AGR: 'DRAFT',
    };
    for (const sCode of allSubjectCodes) {
      const status = t2StatusMap[sCode];
      insertSub.run(
        exam2026T2Id,
        s2Id,
        streamIds.S2_N,
        subjIds[sCode],
        sCode === 'ENG' ? classTeacherUserId : sCode === 'MTC' || sCode === 'ICT' ? mathTeacherUserId : scienceTeacherUserId,
        status,
        status === 'DRAFT' ? 'Draft entry in progress' : 'Marks entered and cross-checked.',
        status === 'RETURNED' ? 'Please verify two mid-term entries for S.2 North.' : status === 'VERIFIED' || status === 'APPROVED' || status === 'PUBLISHED' ? 'Checked and verified by DOS.' : null,
        status === 'APPROVED' || status === 'PUBLISHED' ? 'Approved by Head Teacher.' : null,
        status !== 'DRAFT' ? '2026-08-18 11:20:00' : null,
        ['VERIFIED', 'APPROVED', 'PUBLISHED'].includes(status) ? dosUserId : null,
        ['VERIFIED', 'APPROVED', 'PUBLISHED'].includes(status) ? '2026-08-19 15:00:00' : null,
        ['APPROVED', 'PUBLISHED'].includes(status) ? headUserId : null,
        ['APPROVED', 'PUBLISHED'].includes(status) ? '2026-08-20 09:40:00' : null,
        status === 'PUBLISHED' ? '2026-08-20 09:40:00' : null
      );
    }

    // Also add S.1 North, S.3 North, S.4 North submissions
    for (const [cId, strId] of [
      [s1Id, streamIds.S1_N],
      [s3Id, streamIds.S3_N],
      [s4Id, streamIds.S4_N],
    ] as Array<[number, number]>) {
      for (const sCode of allSubjectCodes) {
        const status = sCode === 'ICT' || sCode === 'AGR' ? 'SUBMITTED' : 'PUBLISHED';
        insertSub.run(
          exam2026T2Id, cId, strId, subjIds[sCode], mathTeacherUserId, status,
          'Submitted on schedule.', status === 'PUBLISHED' ? 'Verified.' : null, status === 'PUBLISHED' ? 'Approved.' : null,
          '2026-08-18 10:00:00', status === 'PUBLISHED' ? dosUserId : null, status === 'PUBLISHED' ? '2026-08-19 12:00:00' : null,
          status === 'PUBLISHED' ? headUserId : null, status === 'PUBLISHED' ? '2026-08-20 08:30:00' : null, status === 'PUBLISHED' ? '2026-08-20 08:30:00' : null
        );
      }
    }

    // 12. Teacher Comments & Attendance
    const insertComment = db.prepare(`
      INSERT INTO teacher_comments (examination_id, student_id, class_teacher_comment, head_teacher_comment, updated_by)
      VALUES (?, ?, ?, ?, ?)
    `);
    const insertAtt = db.prepare(`
      INSERT INTO attendance (academic_year_id, term_id, student_id, total_days, days_present, days_absent, recorded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const st of studentRecords) {
      const ctComment =
        st.tier === 'TOP'
          ? 'Exceptional diligence and leadership in class discussions. Maintain this commendable standard.'
          : st.tier === 'HIGH'
            ? 'Consistent effort across core subjects. Deeper practice in analytical questions will yield top distinction.'
            : st.tier === 'DECLINE'
              ? 'Noticeable drop compared to Term I performance. Closer revision supervision and consultation advised.'
              : st.tier === 'RISK'
                ? 'Requires structured remedial support in Mathematics and Sciences. Parent-teacher follow-up scheduled.'
                : 'Steady progress shown this term; encouraged to balance effort across all subjects.';
      const htComment =
        st.tier === 'TOP'
          ? 'Promoted in standing; a model scholar at Buyanja Grammar School.'
          : st.tier === 'RISK'
            ? 'Academic support plan initiated with the Director of Studies.'
            : 'Good conduct and steady academic commitment.';

      insertComment.run(exam2026T2Id, st.id, ctComment, htComment, classTeacherUserId);
      insertComment.run(exam2026T1Id, st.id, ctComment, htComment, classTeacherUserId);

      const absent = st.tier === 'RISK' ? 7 : st.tier === 'DECLINE' ? 4 : st.idx % 3;
      insertAtt.run(year2026Id, y2026T2Id, st.id, 65, 65 - absent, absent, classTeacherUserId);
      insertAtt.run(year2026Id, y2026T1Id, st.id, 62, 62 - Math.max(0, absent - 1), Math.max(0, absent - 1), classTeacherUserId);
    }

    // 13. Configurable School & System Settings
    const settingsEntries: Array<[string, string]> = [
      ['school_name', 'BUYANJA GRAMMAR SCHOOL'],
      ['school_motto', 'Discipline, Knowledge and Service'],
      ['school_address', 'P.O. Box 142, Buyanja, Rukungiri District, Uganda'],
      ['school_phone', '+256 392 845 120 / +256 772 410 112'],
      ['school_email', 'academics@buyanjagrammar.ac.ug'],
      ['school_website', 'www.buyanjagrammar.ac.ug'],
      ['school_logo_url', '/assets/aistudio/Bgs_logo_6081ecf0.png'],
      ['report_document_title', 'OFFICIAL TERMLY ACADEMIC PROGRESS REPORT'],
      ['report_template', 'CLASSIC_NAVY'],
      ['show_student_photo_on_report', 'false'],
      ['show_class_position_on_report', 'true'],
      ['show_attendance_on_report', 'true'],
      ['show_subject_teacher_initials', 'true'],
      ['next_term_announcement', 'Term III opens on 21st September 2026 at 8:00 AM. All learners must report with cleared fees slips and full uniform.'],
      ['report_footer_notice', 'This official academic transcript is verifiable via QR code. Any alteration renders this document invalid.'],
      ['at_risk_threshold', '50'],
      ['decline_alert_threshold', '10'],
      ['is_sample_data', 'true'],
      ['sample_data_notice', 'Demonstration dataset loaded for Buyanja Grammar School. Administrators may configure school identity and manage records in System Settings.'],
    ];

    const insertSetting = db.prepare(`
      INSERT INTO system_settings (setting_key, setting_value, updated_by) VALUES (?, ?, ?)
    `);
    for (const [k, v] of settingsEntries) {
      insertSetting.run(k, v, adminUserId);
    }

    // 14. Notifications & Initial Audit Log
    const insertNotif = db.prepare(`
      INSERT INTO notifications (user_id, title, message, category, link) VALUES (?, ?, ?, ?, ?)
    `);
    insertNotif.run(
      dosUserId,
      'Marks Submitted for Verification',
      'Chemistry (S.2 North) and CRE (S.2 North) marks for End of Term II 2026 are awaiting DOS verification.',
      'SUBMISSION',
      '/results/verification'
    );
    insertNotif.run(
      headUserId,
      'Verified Results Awaiting Final Approval',
      'Physics and Geography results for S.2 North have been verified by the Director of Studies.',
      'APPROVAL',
      '/results/approval'
    );
    insertNotif.run(
      mathTeacherUserId,
      'Marks Returned for Correction',
      'ICT (S.2 North) submission was returned by DOS: Please verify two mid-term entries for S.2 North.',
      'RETURNED',
      '/marks/entry'
    );
    insertNotif.run(
      classTeacherUserId,
      'Term II Report Card Preparation',
      'Please review S.2 North class teacher comments and attendance records before final publication.',
      'ACADEMIC',
      '/results/published'
    );

    db.prepare(`
      INSERT INTO audit_logs (user_id, user_name, user_role, action, entity_type, entity_id, new_value, reason)
      VALUES (?, 'Samuel Mugisha', 'SYSTEM_ADMIN', 'SYSTEM_INITIALIZED', 'system', '1', '{"sampleData":true}', 'Initial relational schema and demonstration dataset provisioned')
    `).run(adminUserId);
  });

  seedTx();

  // Run automated grading calculations across all seeded examinations & classes
  const classes = db.prepare(`SELECT id FROM classes`).all() as Array<{ id: number }>;
  const exams = db.prepare(`SELECT id FROM examinations`).all() as Array<{ id: number }>;
  for (const ex of exams) {
    for (const c of classes) {
      recalculateExaminationClass(ex.id, c.id);
    }
  }
}
