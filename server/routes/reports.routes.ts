import { Router } from 'express';
import { db } from '../db.js';
import { recordAuditLog } from '../middleware/audit.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { buildTabularExportWorkbook } from '../services/excelService.js';
import {
  assembleReportCardData,
  generateReportCardsPdfBuffer,
  generateSummaryTablePdfBuffer,
  getSettingsMap,
} from '../services/pdfService.js';

export const reportsRouter = Router();

// PUBLIC minimal QR verification endpoint (Privacy-by-Design: never exposes student marks or PII)
reportsRouter.get('/verify/:reportRef', (req, res) => {
  const reportRef = String(req.params.reportRef || '').trim();
  const row = db
    .prepare(
      `SELECT rc.report_ref, rc.generated_at, rc.template_code,
              e.name AS exam_name, ay.year_label, t.name AS term_name,
              c.code AS class_code, s.admission_number
       FROM report_cards rc
       JOIN examinations e ON e.id = rc.examination_id
       JOIN academic_years ay ON ay.id = e.academic_year_id
       JOIN terms t ON t.id = e.term_id
       JOIN classes c ON c.id = rc.class_id
       JOIN students s ON s.id = rc.student_id
       WHERE rc.report_ref = ?`
    )
    .get(reportRef) as
    | {
        report_ref: string;
        generated_at: string;
        exam_name: string;
        year_label: string;
        term_name: string;
        class_code: string;
        admission_number: string;
      }
    | undefined;

  if (!row) {
    res.status(404).json({
      verified: false,
      message: 'Report reference not found in Buyanja Grammar School official registry.',
    });
    return;
  }

  const settings = getSettingsMap();
  // Mask admission number slightly if desired, or return official minimal verification fields only
  res.json({
    verified: true,
    schoolName: settings.school_name || 'BUYANJA GRAMMAR SCHOOL',
    reportReference: row.report_ref,
    academicYear: row.year_label,
    term: row.term_name,
    examination: row.exam_name,
    classLevel: row.class_code,
    admissionReference: row.admission_number,
    issuedAt: row.generated_at,
  });
});

reportsRouter.use(authenticate);

reportsRouter.get('/preview/:studentId', requirePermission('reports.generate'), (req, res) => {
  const studentId = Number(req.params.studentId);
  const examinationId = Number(req.query.examinationId);
  if (!studentId || !examinationId) {
    res.status(400).json({ error: 'studentId and examinationId are required.' });
    return;
  }

  try {
    const data = assembleReportCardData(studentId, examinationId, req.authUser!.id);
    res.json(data);
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

reportsRouter.get('/pdf/student/:studentId', requirePermission('reports.generate'), async (req, res) => {
  const studentId = Number(req.params.studentId);
  const examinationId = Number(req.query.examinationId);
  if (!studentId || !examinationId) {
    res.status(400).json({ error: 'studentId and examinationId are required.' });
    return;
  }

  const baseUrl =
    process.env.APP_URL || `${req.protocol}://${req.get('host') || 'localhost:3000'}`;

  try {
    const pdfBuf = await generateReportCardsPdfBuffer(
      [studentId],
      examinationId,
      req.authUser!.id,
      baseUrl
    );
    const stu = db
      .prepare(`SELECT admission_number, first_name, last_name FROM students WHERE id = ?`)
      .get(studentId) as { admission_number: string; first_name: string; last_name: string } | undefined;

    const safeName = `${stu?.admission_number || studentId}_${stu?.last_name || 'Student'}`.replace(
      /[^a-zA-Z0-9_-]/g,
      '_'
    );

    recordAuditLog({
      userId: req.authUser!.id,
      userName: req.authUser!.fullName,
      userRole: req.authUser!.primaryRole,
      action: 'REPORT_CARD_PDF_GENERATED',
      entityType: 'report_card',
      entityId: `${studentId}:${examinationId}`,
      ipAddress: req.ip,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="BGS_Report_${safeName}.pdf"`);
    res.send(pdfBuf);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

reportsRouter.post('/pdf/bulk', requirePermission('reports.generate'), async (req, res) => {
  const examinationId = Number(req.body.examinationId);
  const classId = Number(req.body.classId);
  const streamId = req.body.streamId ? Number(req.body.streamId) : null;
  const studentIdsInput = req.body.studentIds as number[] | undefined;

  if (!examinationId || (!classId && (!studentIdsInput || studentIdsInput.length === 0))) {
    res.status(400).json({ error: 'examinationId and classId or studentIds are required.' });
    return;
  }

  let targetIds: number[] = studentIdsInput || [];
  if (targetIds.length === 0) {
    const exam = db
      .prepare(`SELECT academic_year_id, term_id FROM examinations WHERE id = ?`)
      .get(examinationId) as { academic_year_id: number; term_id: number } | undefined;
    if (!exam) {
      res.status(404).json({ error: 'Examination not found.' });
      return;
    }

    const enrolled = db
      .prepare(
        `SELECT se.student_id FROM student_enrolments se
         JOIN students s ON s.id = se.student_id
         WHERE se.academic_year_id = ? AND se.term_id = ? AND se.class_id = ?
           ${streamId ? 'AND se.stream_id = ?' : ''}
           AND se.status = 'ENROLLED' AND s.status = 'ACTIVE'
         ORDER BY s.last_name ASC, s.first_name ASC`
      )
      .all(
        ...(streamId
          ? [exam.academic_year_id, exam.term_id, classId, streamId]
          : [exam.academic_year_id, exam.term_id, classId])
      ) as Array<{ student_id: number }>;

    targetIds = enrolled.map((e) => e.student_id);
  }

  if (targetIds.length === 0) {
    res.status(404).json({ error: 'No enrolled students found for bulk report generation.' });
    return;
  }

  const baseUrl =
    process.env.APP_URL || `${req.protocol}://${req.get('host') || 'localhost:3000'}`;

  const pdfBuf = await generateReportCardsPdfBuffer(
    targetIds,
    examinationId,
    req.authUser!.id,
    baseUrl
  );

  recordAuditLog({
    userId: req.authUser!.id,
    userName: req.authUser!.fullName,
    userRole: req.authUser!.primaryRole,
    action: 'BULK_REPORT_CARDS_GENERATED',
    entityType: 'report_card',
    entityId: `${examinationId}:${classId}`,
    newValue: { count: targetIds.length },
    ipAddress: req.ip,
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="BGS_Bulk_Reports_Exam${examinationId}.pdf"`);
  res.send(pdfBuf);
});

reportsRouter.get('/summaries/export', requirePermission('reports.generate', 'analytics.view'), async (req, res) => {
  const type = String(req.query.type || 'ranking');
  const format = String(req.query.format || 'xlsx').toLowerCase();
  const examinationId = Number(req.query.examinationId);
  const classId = req.query.classId ? Number(req.query.classId) : null;

  if (!examinationId) {
    res.status(400).json({ error: 'examinationId is required.' });
    return;
  }

  let title = 'Academic Summary Report';
  let headers: string[] = [];
  let rows: Array<Array<string | number>> = [];

  if (type === 'subject_summary') {
    title = 'Subject Performance Summary';
    headers = ['Class', 'Code', 'Subject', 'Candidates', 'Average %', 'Highest', 'Lowest'];
    const data = db
      .prepare(
        `SELECT c.code AS class_code, sub.code AS subj_code, sub.name AS subj_name,
                COUNT(sr.id) AS candidates, ROUND(AVG(sr.weighted_total), 1) AS avg_score,
                ROUND(MAX(sr.weighted_total), 1) AS max_score, ROUND(MIN(sr.weighted_total), 1) AS min_score
         FROM subject_results sr
         JOIN classes c ON c.id = sr.class_id
         JOIN subjects sub ON sub.id = sr.subject_id
         WHERE sr.examination_id = ? AND sr.weighted_total IS NOT NULL
           ${classId ? 'AND sr.class_id = ?' : ''}
         GROUP BY sr.class_id, sr.subject_id
         ORDER BY c.sort_order ASC, avg_score DESC`
      )
      .all(...(classId ? [examinationId, classId] : [examinationId])) as Array<Record<string, unknown>>;

    rows = data.map((d) => [
      String(d.class_code),
      String(d.subj_code),
      String(d.subj_name),
      Number(d.candidates),
      Number(d.avg_score),
      Number(d.max_score),
      Number(d.min_score),
    ]);
  } else if (type === 'submissions') {
    title = 'Teacher Marks Submission Status Report';
    headers = ['Class', 'Stream', 'Subject', 'Teacher', 'Status', 'Submitted At'];
    const data = db
      .prepare(
        `SELECT c.code AS class_code, st.name AS stream_name, sub.name AS subj_name,
                COALESCE(u.full_name, 'Unassigned') AS teacher_name, rs.status, COALESCE(rs.submitted_at, 'Pending') AS submitted_at
         FROM result_submissions rs
         JOIN classes c ON c.id = rs.class_id
         JOIN streams st ON st.id = rs.stream_id
         JOIN subjects sub ON sub.id = rs.subject_id
         LEFT JOIN users u ON u.id = rs.submitted_by
         WHERE rs.examination_id = ? ${classId ? 'AND rs.class_id = ?' : ''}
         ORDER BY c.sort_order ASC, st.name ASC, sub.name ASC`
      )
      .all(...(classId ? [examinationId, classId] : [examinationId])) as Array<Record<string, unknown>>;

    rows = data.map((d) => [
      String(d.class_code),
      String(d.stream_name),
      String(d.subj_name),
      String(d.teacher_name),
      String(d.status),
      String(d.submitted_at),
    ]);
  } else {
    title = 'Class Merit & Student Ranking Report';
    headers = ['Pos.', 'Admission No', 'Student Name', 'Class', 'Stream', 'Subjects', 'Total', 'Average %', 'Grade', 'Agg.'];
    const data = db
      .prepare(
        `SELECT ses.class_position, s.admission_number, s.first_name || ' ' || s.last_name AS full_name,
                c.code AS class_code, st.name AS stream_name, ses.subjects_assessed,
                ses.total_marks, ses.average_score, ses.overall_grade, ses.aggregate_points
         FROM student_exam_summaries ses
         JOIN students s ON s.id = ses.student_id
         JOIN classes c ON c.id = ses.class_id
         JOIN streams st ON st.id = ses.stream_id
         WHERE ses.examination_id = ? ${classId ? 'AND ses.class_id = ?' : ''}
         ORDER BY c.sort_order ASC, COALESCE(ses.class_position, 9999) ASC`
      )
      .all(...(classId ? [examinationId, classId] : [examinationId])) as Array<Record<string, unknown>>;

    rows = data.map((d) => [
      d.class_position ? Number(d.class_position) : '—',
      String(d.admission_number),
      String(d.full_name),
      String(d.class_code),
      String(d.stream_name),
      Number(d.subjects_assessed),
      Number(d.total_marks),
      Number(d.average_score),
      String(d.overall_grade || '—'),
      d.aggregate_points !== null ? Number(d.aggregate_points) : '—',
    ]);
  }

  if (format === 'pdf') {
    const pdfBuf = await generateSummaryTablePdfBuffer({
      title,
      subtitle: `Examination ID #${examinationId}`,
      headers,
      rows,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="BGS_${type}.pdf"`);
    res.send(pdfBuf);
    return;
  }

  if (format === 'csv') {
    const csvLines = [
      headers.join(','),
      ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')),
    ];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="BGS_${type}.csv"`);
    res.send(csvLines.join('\n'));
    return;
  }

  const xlsxBuf = await buildTabularExportWorkbook({
    sheetName: title,
    title: `BUYANJA GRAMMAR SCHOOL — ${title.toUpperCase()}`,
    headers,
    rows,
  });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="BGS_${type}.xlsx"`);
  res.send(xlsxBuf);
});
