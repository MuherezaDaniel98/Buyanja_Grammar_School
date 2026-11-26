import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { db } from '../db.js';

export interface ReportCardPayload {
  reportRef: string;
  generatedAt: string;
  settings: Record<string, string>;
  exam: {
    id: number;
    name: string;
    code: string;
    yearLabel: string;
    termName: string;
    nextTermBegins: string | null;
    rankingEnabled: boolean;
    aggregateEnabled: boolean;
  };
  student: {
    id: number;
    admissionNumber: string;
    fullName: string;
    gender: string;
    className: string;
    classCode: string;
    streamName: string;
    classTeacherName: string;
    photoUrl: string | null;
  };
  categories: Array<{
    id: number;
    name: string;
    code: string;
    max_marks: number;
    weight_percentage: number;
  }>;
  subjects: Array<{
    subjectId: number;
    code: string;
    name: string;
    categoryScores: Record<string, number | string | null>;
    weightedTotal: number | null;
    grade: string | null;
    points: number | null;
    descriptor: string | null;
    teacherInitials: string;
  }>;
  summary: {
    totalMarks: number;
    averageScore: number;
    overallGrade: string | null;
    aggregatePoints: number | null;
    subjectsAssessed: number;
    classPosition: number | null;
    streamPosition: number | null;
    classSize: number | null;
    performanceDescriptor: string | null;
  };
  attendance: {
    totalDays: number;
    daysPresent: number;
    daysAbsent: number;
    percentage: number;
  } | null;
  comments: {
    classTeacherComment: string;
    headTeacherComment: string;
  };
}

export function getSettingsMap(): Record<string, string> {
  const rows = db.prepare(`SELECT setting_key, setting_value FROM system_settings`).all() as Array<{
    setting_key: string;
    setting_value: string;
  }>;
  const map: Record<string, string> = {};
  for (const r of rows) {
    map[r.setting_key] = r.setting_value;
  }
  return map;
}

export function assembleReportCardData(
  studentId: number,
  examinationId: number,
  generatedByUserId: number
): ReportCardPayload {
  const settings = getSettingsMap();

  const exam = db
    .prepare(
      `SELECT e.id, e.name, e.code, e.academic_year_id, e.term_id, e.ranking_enabled, e.aggregate_enabled,
              ay.year_label, t.name AS term_name, t.next_term_begins
       FROM examinations e
       JOIN academic_years ay ON ay.id = e.academic_year_id
       JOIN terms t ON t.id = e.term_id
       WHERE e.id = ?`
    )
    .get(examinationId) as
    | {
        id: number;
        name: string;
        code: string;
        academic_year_id: number;
        term_id: number;
        ranking_enabled: number;
        aggregate_enabled: number;
        year_label: string;
        term_name: string;
        next_term_begins: string | null;
      }
    | undefined;

  if (!exam) {
    throw new Error('Examination not found');
  }

  const student = db
    .prepare(
      `SELECT s.id, s.admission_number, s.first_name, s.last_name, s.other_names, s.gender, s.photo_url,
              se.class_id, se.stream_id, c.name AS class_name, c.code AS class_code, st.name AS stream_name
       FROM students s
       JOIN student_enrolments se ON se.student_id = s.id
       JOIN classes c ON c.id = se.class_id
       JOIN streams st ON st.id = se.stream_id
       WHERE s.id = ? AND se.academic_year_id = ? AND se.term_id = ?`
    )
    .get(studentId, exam.academic_year_id, exam.term_id) as
    | {
        id: number;
        admission_number: string;
        first_name: string;
        last_name: string;
        other_names: string | null;
        gender: string;
        photo_url: string | null;
        class_id: number;
        stream_id: number;
        class_name: string;
        class_code: string;
        stream_name: string;
      }
    | undefined;

  if (!student) {
    throw new Error('Student enrolment not found for this examination term');
  }

  const classTeacherRow = db
    .prepare(
      `SELECT u.full_name
       FROM teacher_allocations ta
       JOIN teachers t ON t.id = ta.teacher_id
       JOIN users u ON u.id = t.user_id
       WHERE ta.academic_year_id = ? AND ta.term_id = ? AND ta.class_id = ? AND ta.stream_id = ?
         AND ta.is_class_teacher = 1 AND ta.is_active = 1
       LIMIT 1`
    )
    .get(exam.academic_year_id, exam.term_id, student.class_id, student.stream_id) as
    | { full_name: string }
    | undefined;

  const categories = db
    .prepare(
      `SELECT id, name, code, max_marks, weight_percentage
       FROM assessment_categories WHERE examination_id = ? ORDER BY sort_order ASC`
    )
    .all(examinationId) as Array<{
    id: number;
    name: string;
    code: string;
    max_marks: number;
    weight_percentage: number;
  }>;

  const subjectRows = db
    .prepare(
      `SELECT sub.id AS subject_id, sub.code, sub.name,
              sr.weighted_total, sr.grade, sr.points, sr.descriptor,
              COALESCE(
                (SELECT t.initials FROM teacher_allocations ta
                 JOIN teachers t ON t.id = ta.teacher_id
                 WHERE ta.academic_year_id = ? AND ta.term_id = ?
                   AND ta.class_id = ? AND ta.stream_id = ? AND ta.subject_id = sub.id AND ta.is_active = 1
                 LIMIT 1),
                '—'
              ) AS teacher_initials
       FROM class_subjects cs
       JOIN subjects sub ON sub.id = cs.subject_id
       LEFT JOIN subject_results sr
         ON sr.examination_id = ? AND sr.student_id = ? AND sr.subject_id = sub.id
       WHERE cs.class_id = ?
       ORDER BY sub.is_core DESC, sub.name ASC`
    )
    .all(
      exam.academic_year_id,
      exam.term_id,
      student.class_id,
      student.stream_id,
      examinationId,
      studentId,
      student.class_id
    ) as Array<{
    subject_id: number;
    code: string;
    name: string;
    weighted_total: number | null;
    grade: string | null;
    points: number | null;
    descriptor: string | null;
    teacher_initials: string;
  }>;

  const marksRows = db
    .prepare(
      `SELECT m.subject_id, ac.code AS cat_code, m.score, m.status_flag
       FROM marks m
       JOIN assessment_categories ac ON ac.id = m.assessment_category_id
       WHERE m.examination_id = ? AND m.student_id = ?`
    )
    .all(examinationId, studentId) as Array<{
    subject_id: number;
    cat_code: string;
    score: number | null;
    status_flag: string;
  }>;

  const marksBySubject = new Map<number, Record<string, number | string | null>>();
  for (const mr of marksRows) {
    if (!marksBySubject.has(mr.subject_id)) {
      marksBySubject.set(mr.subject_id, {});
    }
    marksBySubject.get(mr.subject_id)![mr.cat_code] =
      mr.status_flag === 'ABSENT' ? 'ABS' : mr.status_flag === 'EXEMPTED' ? 'EX' : mr.score;
  }

  const summaryRow = db
    .prepare(
      `SELECT total_marks, average_score, overall_grade, aggregate_points,
              subjects_assessed, class_position, stream_position, class_size, performance_descriptor
       FROM student_exam_summaries WHERE examination_id = ? AND student_id = ?`
    )
    .get(examinationId, studentId) as
    | {
        total_marks: number;
        average_score: number;
        overall_grade: string | null;
        aggregate_points: number | null;
        subjects_assessed: number;
        class_position: number | null;
        stream_position: number | null;
        class_size: number | null;
        performance_descriptor: string | null;
      }
    | undefined;

  const attRow = db
    .prepare(`SELECT total_days, days_present, days_absent FROM attendance WHERE term_id = ? AND student_id = ?`)
    .get(exam.term_id, studentId) as
    | { total_days: number; days_present: number; days_absent: number }
    | undefined;

  const commentRow = db
    .prepare(
      `SELECT class_teacher_comment, head_teacher_comment FROM teacher_comments WHERE examination_id = ? AND student_id = ?`
    )
    .get(examinationId, studentId) as
    | { class_teacher_comment: string | null; head_teacher_comment: string | null }
    | undefined;

  // Check or issue unique verification report_ref
  let existingRc = db
    .prepare(`SELECT report_ref, generated_at FROM report_cards WHERE examination_id = ? AND student_id = ? ORDER BY id DESC LIMIT 1`)
    .get(examinationId, studentId) as { report_ref: string; generated_at: string } | undefined;

  if (!existingRc) {
    const cleanAdm = student.admission_number.replace(/[^A-Z0-9]/gi, '');
    const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    const reportRef = `BGS-${exam.year_label}-${exam.code}-${cleanAdm}-${suffix}`;
    const vHash = crypto
      .createHash('sha256')
      .update(`${reportRef}:${student.id}:${examinationId}`)
      .digest('hex');

    db.prepare(
      `INSERT INTO report_cards (report_ref, examination_id, student_id, class_id, stream_id, verification_hash, generated_by, template_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      reportRef,
      examinationId,
      student.id,
      student.class_id,
      student.stream_id,
      vHash,
      generatedByUserId,
      settings.report_template || 'CLASSIC_NAVY'
    );
    existingRc = { report_ref: reportRef, generated_at: new Date().toISOString() };
  }

  const fullName = [student.first_name, student.other_names, student.last_name]
    .filter(Boolean)
    .join(' ');

  return {
    reportRef: existingRc.report_ref,
    generatedAt: existingRc.generated_at,
    settings,
    exam: {
      id: exam.id,
      name: exam.name,
      code: exam.code,
      yearLabel: exam.year_label,
      termName: exam.term_name,
      nextTermBegins: exam.next_term_begins,
      rankingEnabled: Boolean(exam.ranking_enabled),
      aggregateEnabled: Boolean(exam.aggregate_enabled),
    },
    student: {
      id: student.id,
      admissionNumber: student.admission_number,
      fullName,
      gender: student.gender === 'M' ? 'Male' : 'Female',
      className: student.class_name,
      classCode: student.class_code,
      streamName: student.stream_name,
      classTeacherName: classTeacherRow?.full_name || 'Assigned Class Teacher',
      photoUrl: student.photo_url,
    },
    categories,
    subjects: subjectRows.map((sr) => ({
      subjectId: sr.subject_id,
      code: sr.code,
      name: sr.name,
      categoryScores: marksBySubject.get(sr.subject_id) || {},
      weightedTotal: sr.weighted_total,
      grade: sr.grade,
      points: sr.points,
      descriptor: sr.descriptor,
      teacherInitials: sr.teacher_initials,
    })),
    summary: {
      totalMarks: summaryRow?.total_marks ?? 0,
      averageScore: summaryRow?.average_score ?? 0,
      overallGrade: summaryRow?.overall_grade ?? '—',
      aggregatePoints: summaryRow?.aggregate_points ?? null,
      subjectsAssessed: summaryRow?.subjects_assessed ?? 0,
      classPosition: summaryRow?.class_position ?? null,
      streamPosition: summaryRow?.stream_position ?? null,
      classSize: summaryRow?.class_size ?? null,
      performanceDescriptor: summaryRow?.performance_descriptor ?? 'Pending Assessment',
    },
    attendance: attRow
      ? {
          totalDays: attRow.total_days,
          daysPresent: attRow.days_present,
          daysAbsent: attRow.days_absent,
          percentage:
            attRow.total_days > 0
              ? Math.round((attRow.days_present / attRow.total_days) * 1000) / 10
              : 0,
        }
      : null,
    comments: {
      classTeacherComment:
        commentRow?.class_teacher_comment || 'Good academic effort maintained throughout the term.',
      headTeacherComment:
        commentRow?.head_teacher_comment || 'Satisfactory progress. Keep striving for excellence.',
    },
  };
}

function resolveLocalAssetPath(urlOrPath: string | undefined): string | null {
  if (!urlOrPath) return null;
  const cleaned = urlOrPath.replace(/^\/+/, '');
  const rootDir = process.cwd();
  const publicDir = path.resolve(rootDir, 'public');

  const directCandidate = path.resolve(rootDir, cleaned);
  if (directCandidate.startsWith(rootDir + path.sep) && fs.existsSync(directCandidate)) {
    return directCandidate;
  }

  const publicCandidate = path.resolve(publicDir, cleaned);
  if (publicCandidate.startsWith(publicDir + path.sep) && fs.existsSync(publicCandidate)) {
    return publicCandidate;
  }
  return null;
}

async function renderReportCardPage(
  doc: PDFKit.PDFDocument,
  data: ReportCardPayload,
  appBaseUrl: string
): Promise<void> {
  const NAVY = '#0F2547';
  const ROYAL = '#1D4ED8';
  const GOLD = '#B48327';
  const SLATE = '#334155';
  const MUTED = '#64748B';
  const BORDER = '#CBD5E1';
  const LIGHT_BG = '#F8FAFC';

  const pageW = 595.28; // A4 width pt
  const margin = 34;
  const contentW = pageW - margin * 2;

  // Outer institutional frame
  doc
    .rect(18, 18, pageW - 36, 841.89 - 36)
    .lineWidth(1.2)
    .strokeColor(NAVY)
    .stroke();
  doc
    .rect(22, 22, pageW - 44, 841.89 - 44)
    .lineWidth(0.5)
    .strokeColor(GOLD)
    .stroke();

  let y = 34;

  // A. OFFICIAL SCHOOL HEADER
  const logoPath = resolveLocalAssetPath(data.settings.school_logo_url);
  if (logoPath) {
    try {
      doc.image(logoPath, margin, y, { fit: [56, 56] });
    } catch {
      // Fallback crest box if image unreadable
    }
  }

  doc
    .font('Helvetica-Bold')
    .fontSize(17)
    .fillColor(NAVY)
    .text(data.settings.school_name || 'BUYANJA GRAMMAR SCHOOL', margin + 66, y + 2, {
      width: contentW - 132,
      align: 'center',
    });

  doc
    .font('Helvetica-Oblique')
    .fontSize(9)
    .fillColor(GOLD)
    .text(`"${data.settings.school_motto || 'Discipline, Knowledge and Service'}"`, margin + 66, y + 22, {
      width: contentW - 132,
      align: 'center',
    });

  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(SLATE)
    .text(data.settings.school_address || '', margin + 66, y + 34, {
      width: contentW - 132,
      align: 'center',
    });
  doc.text(
    `Tel: ${data.settings.school_phone || ''}  |  Email: ${data.settings.school_email || ''}`,
    margin + 66,
    y + 45,
    { width: contentW - 132, align: 'center' }
  );

  y += 64;
  doc.moveTo(margin, y).lineTo(pageW - margin, y).lineWidth(1.5).strokeColor(NAVY).stroke();
  doc.moveTo(margin, y + 2.5).lineTo(pageW - margin, y + 2.5).lineWidth(0.6).strokeColor(GOLD).stroke();

  y += 8;
  // Document Banner Strip
  doc.rect(margin, y, contentW, 22).fill(NAVY);
  doc
    .font('Helvetica-Bold')
    .fontSize(9.5)
    .fillColor('#FFFFFF')
    .text(
      `${data.settings.report_document_title || 'OFFICIAL TERMLY ACADEMIC PROGRESS REPORT'} — ${data.exam.yearLabel} ${data.exam.termName.toUpperCase()}`,
      margin + 8,
      y + 6,
      { width: contentW - 16, align: 'center' }
    );
  y += 28;

  // B. STUDENT INFORMATION PANEL
  doc.rect(margin, y, contentW, 56).fillAndStroke(LIGHT_BG, BORDER);
  const col1X = margin + 10;
  const col2X = margin + 210;
  const col3X = margin + 390;

  doc.font('Helvetica').fontSize(8).fillColor(MUTED);
  doc.text('STUDENT NAME', col1X, y + 7);
  doc.text('ADMISSION NO.', col2X, y + 7);
  doc.text('CLASS / STREAM', col3X, y + 7);

  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(NAVY);
  doc.text(data.student.fullName.toUpperCase(), col1X, y + 17, { width: 190 });
  doc.text(data.student.admissionNumber, col2X, y + 17, { width: 165 });
  doc.text(`${data.student.className} (${data.student.streamName})`, col3X, y + 17, { width: 130 });

  doc.font('Helvetica').fontSize(8).fillColor(MUTED);
  doc.text('EXAMINATION', col1X, y + 32);
  doc.text('CLASS TEACHER', col2X, y + 32);
  doc.text('GENDER', col3X, y + 32);

  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(SLATE);
  doc.text(data.exam.name, col1X, y + 42, { width: 190 });
  doc.text(data.student.classTeacherName, col2X, y + 42, { width: 165 });
  doc.text(data.student.gender, col3X, y + 42, { width: 120 });

  y += 66;

  // C. ACADEMIC PERFORMANCE TABLE
  const showInitials = data.settings.show_subject_teacher_initials !== 'false';
  const catCount = data.categories.length;
  const catColW = catCount > 0 ? Math.min(46, Math.floor(135 / catCount)) : 0;
  const codeW = 42;
  const totalW = 46;
  const gradeW = 36;
  const initW = showInitials ? 38 : 0;
  const remarksW = 104;
  const nameW = contentW - (codeW + catColW * catCount + totalW + gradeW + initW + remarksW);

  // Table header
  doc.rect(margin, y, contentW, 20).fill(NAVY);
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#FFFFFF');

  let cx = margin + 4;
  doc.text('CODE', cx, y + 6, { width: codeW - 4 });
  cx += codeW;
  doc.text('SUBJECT', cx, y + 6, { width: nameW - 4 });
  cx += nameW;
  for (const cat of data.categories) {
    doc.text(`${cat.code} (${cat.max_marks})`, cx, y + 6, { width: catColW, align: 'right' });
    cx += catColW;
  }
  doc.text('TOTAL %', cx, y + 6, { width: totalW, align: 'right' });
  cx += totalW;
  doc.text('GRADE', cx, y + 6, { width: gradeW, align: 'center' });
  cx += gradeW;
  doc.text('REMARKS', cx + 4, y + 6, { width: remarksW - 4 });
  cx += remarksW;
  if (showInitials) {
    doc.text('INIT.', cx, y + 6, { width: initW, align: 'center' });
  }
  y += 20;

  const rowH = 19;
  data.subjects.forEach((sub, idx) => {
    if (idx % 2 === 1) {
      doc.rect(margin, y, contentW, rowH).fill('#F8FAFC');
    }
    doc.rect(margin, y, contentW, rowH).lineWidth(0.4).strokeColor(BORDER).stroke();

    cx = margin + 4;
    doc.font('Helvetica-Bold').fontSize(8).fillColor(NAVY).text(sub.code, cx, y + 5, { width: codeW - 4 });
    cx += codeW;
    doc.font('Helvetica').fontSize(8).fillColor('#0F172A').text(sub.name, cx, y + 5, { width: nameW - 6, lineBreak: false });
    cx += nameW;

    for (const cat of data.categories) {
      const val = sub.categoryScores[cat.code];
      const disp = val === null || val === undefined ? '—' : String(val);
      doc.font('Helvetica').fontSize(8).fillColor(SLATE).text(disp, cx, y + 5, { width: catColW, align: 'right' });
      cx += catColW;
    }

    doc
      .font('Helvetica-Bold')
      .fontSize(8.2)
      .fillColor(NAVY)
      .text(sub.weightedTotal !== null ? sub.weightedTotal.toFixed(1) : '—', cx, y + 5, {
        width: totalW,
        align: 'right',
      });
    cx += totalW;

    doc
      .font('Helvetica-Bold')
      .fontSize(8.2)
      .fillColor(ROYAL)
      .text(sub.grade || '—', cx, y + 5, { width: gradeW, align: 'center' });
    cx += gradeW;

    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(SLATE)
      .text(sub.descriptor || '—', cx + 4, y + 5.5, { width: remarksW - 6, lineBreak: false });
    cx += remarksW;

    if (showInitials) {
      doc
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor(MUTED)
        .text(sub.teacherInitials, cx, y + 5.5, { width: initW, align: 'center' });
    }
    y += rowH;
  });

  y += 10;

  // D. PERFORMANCE SUMMARY STRIP (Refined institutional summary blocks)
  const summaryH = 44;
  doc.rect(margin, y, contentW, summaryH).fillAndStroke('#F1F5F9', BORDER);
  const blocks = [
    { label: 'TOTAL MARKS', value: data.summary.totalMarks.toFixed(1) },
    { label: 'AVERAGE', value: `${data.summary.averageScore.toFixed(1)}%` },
    { label: 'OVERALL GRADE', value: data.summary.overallGrade || '—' },
    {
      label: 'AGGREGATE',
      value: data.exam.aggregateEnabled && data.summary.aggregatePoints !== null ? String(data.summary.aggregatePoints) : '—',
    },
    {
      label: 'CLASS POSITION',
      value:
        data.settings.show_class_position_on_report !== 'false' &&
        data.exam.rankingEnabled &&
        data.summary.classPosition
          ? `${data.summary.classPosition} / ${data.summary.classSize}`
          : '—',
    },
    { label: 'SUBJECTS', value: String(data.summary.subjectsAssessed) },
  ];
  const blockW = contentW / blocks.length;
  blocks.forEach((blk, bIdx) => {
    const bx = margin + bIdx * blockW;
    if (bIdx > 0) {
      doc.moveTo(bx, y + 6).lineTo(bx, y + summaryH - 6).lineWidth(0.5).strokeColor(BORDER).stroke();
    }
    doc.font('Helvetica').fontSize(6.8).fillColor(MUTED).text(blk.label, bx + 4, y + 8, {
      width: blockW - 8,
      align: 'center',
    });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY).text(blk.value, bx + 4, y + 20, {
      width: blockW - 8,
      align: 'center',
    });
  });

  y += summaryH + 6;
  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .fillColor(SLATE)
    .text(`Performance Standing: ${data.summary.performanceDescriptor || '—'}`, margin, y);

  // F. ATTENDANCE SUMMARY (if enabled)
  if (data.settings.show_attendance_on_report !== 'false' && data.attendance) {
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(SLATE)
      .text(
        `Attendance: ${data.attendance.daysPresent} / ${data.attendance.totalDays} days (${data.attendance.percentage}%) · Absent: ${data.attendance.daysAbsent} days`,
        margin + 230,
        y,
        { width: contentW - 230, align: 'right' }
      );
  }

  y += 16;

  // E & G. COMMENTS BLOCK
  doc.rect(margin, y, contentW, 42).lineWidth(0.6).strokeColor(BORDER).stroke();
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(NAVY).text("CLASS TEACHER'S COMMENT:", margin + 8, y + 6);
  doc.font('Helvetica').fontSize(8).fillColor('#0F172A').text(data.comments.classTeacherComment, margin + 8, y + 17, {
    width: contentW - 16,
  });
  y += 47;

  doc.rect(margin, y, contentW, 40).lineWidth(0.6).strokeColor(BORDER).stroke();
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(NAVY).text("HEAD TEACHER'S REMARKS:", margin + 8, y + 6);
  doc.font('Helvetica').fontSize(8).fillColor('#0F172A').text(data.comments.headTeacherComment, margin + 8, y + 17, {
    width: contentW - 16,
  });
  y += 48;

  // H. SIGNATURES & OFFICIAL STAMP
  const sigW = (contentW - 105) / 3;
  const sigLabels = ['Class Teacher Signature', 'Director of Studies Signature', 'Head Teacher Signature'];
  sigLabels.forEach((lbl, i) => {
    const sx = margin + i * sigW;
    doc.moveTo(sx + 6, y + 26).lineTo(sx + sigW - 10, y + 26).lineWidth(0.6).strokeColor(SLATE).stroke();
    doc.font('Helvetica').fontSize(7.2).fillColor(MUTED).text(lbl, sx + 6, y + 30, {
      width: sigW - 16,
      align: 'center',
    });
  });

  // Official Stamp Box
  doc.rect(pageW - margin - 96, y, 96, 42).dash(2, { space: 2 }).strokeColor(GOLD).stroke().undash();
  doc
    .font('Helvetica')
    .fontSize(7)
    .fillColor(MUTED)
    .text('OFFICIAL SCHOOL STAMP', pageW - margin - 92, y + 17, { width: 88, align: 'center' });

  y += 50;

  // I. NEXT TERM INFORMATION
  doc.rect(margin, y, contentW, 28).fillAndStroke('#FEF7E6', '#E5C98B');
  doc
    .font('Helvetica-Bold')
    .fontSize(7.5)
    .fillColor(NAVY)
    .text(
      `NEXT TERM BEGINS: ${data.exam.nextTermBegins || 'To be communicated'}`,
      margin + 8,
      y + 5
    );
  doc
    .font('Helvetica')
    .fontSize(7.3)
    .fillColor(SLATE)
    .text(data.settings.next_term_announcement || '', margin + 8, y + 15, {
      width: contentW - 16,
      lineBreak: false,
    });

  // J. FOOTER & QR CODE VERIFICATION
  const footerY = 746;
  doc.moveTo(margin, footerY - 4).lineTo(pageW - margin, footerY - 4).lineWidth(0.6).strokeColor(BORDER).stroke();

  const verifyUrl = `${appBaseUrl.replace(/\/$/, '')}/verify-report/${encodeURIComponent(data.reportRef)}`;
  const qrBuffer = await QRCode.toBuffer(verifyUrl, {
    width: 64,
    margin: 1,
    color: { dark: NAVY, light: '#FFFFFF' },
  });
  doc.image(qrBuffer, pageW - margin - 52, footerY, { width: 52, height: 52 });

  doc.font('Helvetica-Bold').fontSize(7.2).fillColor(NAVY).text(`Report Reference: ${data.reportRef}`, margin, footerY + 4);
  doc
    .font('Helvetica')
    .fontSize(7)
    .fillColor(MUTED)
    .text(`Generated: ${new Date(data.generatedAt).toLocaleString('en-UG')}  |  Scan QR code to verify document authenticity`, margin, footerY + 15);
  doc
    .font('Helvetica-Oblique')
    .fontSize(6.8)
    .fillColor(SLATE)
    .text(data.settings.report_footer_notice || '', margin, footerY + 28, {
      width: contentW - 64,
    });
}

export async function generateReportCardsPdfBuffer(
  studentIds: number[],
  examinationId: number,
  generatedByUserId: number,
  appBaseUrl: string
): Promise<Buffer> {
  const payloads: ReportCardPayload[] = [];
  for (const sId of studentIds) {
    payloads.push(assembleReportCardData(sId, examinationId, generatedByUserId));
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    (async () => {
      for (const payload of payloads) {
        doc.addPage({ size: 'A4', margin: 0 });
        await renderReportCardPage(doc, payload, appBaseUrl);
      }
      doc.end();
    })().catch(reject);
  });
}

export async function generateSummaryTablePdfBuffer(params: {
  title: string;
  subtitle: string;
  headers: string[];
  rows: Array<Array<string | number>>;
}): Promise<Buffer> {
  const settings = getSettingsMap();
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 36 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('Helvetica-Bold').fontSize(14).fillColor('#0F2547').text(settings.school_name || 'BUYANJA GRAMMAR SCHOOL');
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#1D4ED8').text(params.title);
    doc.font('Helvetica').fontSize(8.5).fillColor('#64748B').text(`${params.subtitle} · Generated ${new Date().toLocaleDateString('en-UG')}`);
    doc.moveDown(0.8);

    const colW = (595.28 - 72) / params.headers.length;
    let y = doc.y;

    const drawHeader = () => {
      doc.rect(36, y, 595.28 - 72, 20).fill('#0F2547');
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF');
      params.headers.forEach((h, i) => {
        doc.text(String(h), 40 + i * colW, y + 6, { width: colW - 8, lineBreak: false });
      });
      y += 20;
    };

    drawHeader();

    params.rows.forEach((row, idx) => {
      if (y > 770) {
        doc.addPage();
        y = 40;
        drawHeader();
      }
      if (idx % 2 === 1) {
        doc.rect(36, y, 595.28 - 72, 18).fill('#F8FAFC');
      }
      doc.rect(36, y, 595.28 - 72, 18).lineWidth(0.3).strokeColor('#CBD5E1').stroke();
      doc.font('Helvetica').fontSize(7.8).fillColor('#0F172A');
      row.forEach((cell, i) => {
        doc.text(String(cell ?? '—'), 40 + i * colW, y + 5, { width: colW - 8, lineBreak: false });
      });
      y += 18;
    });

    doc.end();
  });
}
