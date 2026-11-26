import ExcelJS from 'exceljs';

export async function buildMarksTemplateWorkbook(params: {
  examName: string;
  className: string;
  streamName: string;
  subjectName: string;
  categories: Array<{ code: string; name: string; max_marks: number }>;
  students: Array<{ admission_number: string; full_name: string }>;
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Buyanja Grammar School Academic System';
  const ws = wb.addWorksheet('Marks Import');

  ws.addRow([`BUYANJA GRAMMAR SCHOOL — MARKS ENTRY TEMPLATE`]);
  ws.addRow([`Exam: ${params.examName} | Class: ${params.className} (${params.streamName}) | Subject: ${params.subjectName}`]);
  ws.addRow([]);

  const headerRow = [
    'Admission Number',
    'Student Name',
    ...params.categories.map((c) => `${c.code} (Max ${c.max_marks})`),
    'Status (PRESENT/ABSENT/EXEMPTED)',
  ];
  const hdr = ws.addRow(headerRow);
  hdr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  hdr.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2547' } };
  });

  for (const st of params.students) {
    ws.addRow([
      st.admission_number,
      st.full_name,
      ...params.categories.map(() => ''),
      'PRESENT',
    ]);
  }

  ws.columns.forEach((col) => {
    col.width = 22;
  });

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export async function buildStudentsTemplateWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Students Import');
  const hdr = ws.addRow([
    'First Name*',
    'Last Name*',
    'Gender (M/F)*',
    'Date of Birth (YYYY-MM-DD)',
    'Class Code (e.g. S.1)*',
    'Stream Name (e.g. North)*',
    'Guardian Name*',
    'Relationship',
    'Guardian Phone*',
  ]);
  hdr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  hdr.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2547' } };
  });
  ws.addRow(['Grace', 'Atwine', 'F', '2012-04-12', 'S.1', 'North', 'Peter Atwine', 'Father', '+256 772 000 111']);
  ws.columns.forEach((c) => (c.width = 22));
  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export async function buildTabularExportWorkbook(params: {
  sheetName: string;
  title: string;
  headers: string[];
  rows: Array<Array<string | number | null>>;
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(params.sheetName.slice(0, 31));

  const titleRow = ws.addRow([params.title]);
  titleRow.font = { bold: true, size: 13, color: { argb: 'FF0F2547' } };
  ws.addRow([`Generated on ${new Date().toLocaleString('en-UG')}`]);
  ws.addRow([]);

  const hdr = ws.addRow(params.headers);
  hdr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  hdr.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2547' } };
  });

  for (const r of params.rows) {
    ws.addRow(r);
  }

  ws.columns.forEach((col) => {
    col.width = 20;
  });

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export async function parseSpreadsheetBuffer(
  buffer: Buffer,
  filename: string
): Promise<Array<Array<string>>> {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.csv')) {
    const text = buffer.toString('utf8');
    return text
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) =>
        line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, ''))
      );
  }

  const wb = new ExcelJS.Workbook();
  // @ts-expect-error ExcelJS accepts Node Buffer at runtime
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];

  const rows: Array<Array<string>> = [];
  ws.eachRow((row) => {
    const vals = row.values as Array<unknown>;
    // ExcelJS row.values is 1-indexed
    const normalized = vals.slice(1).map((v) => {
      if (v === null || v === undefined) return '';
      if (typeof v === 'object' && v !== null && 'text' in v) {
        return String((v as { text: unknown }).text).trim();
      }
      return String(v).trim();
    });
    if (normalized.some((c) => c.length > 0)) {
      rows.push(normalized);
    }
  });
  return rows;
}
