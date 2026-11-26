import { ArrowLeft, Download, Eye, FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  EmptyState,
  FeedbackBanner,
  PageHeader,
  TableSkeleton,
} from '../components/UiPrimitives';
import { api, downloadProtectedFile } from '../lib/api';

interface ReportCardPayload {
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
  categories: Array<{ id: number; name: string; code: string; max_marks: number; weight_percentage: number }>;
  subjects: Array<{
    subjectId: number;
    code: string;
    name: string;
    categoryScores: Record<string, number | string | null>;
    weightedTotal: number | null;
    grade: string | null;
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

export function ReportCardsHubPage() {
  const [exams, setExams] = useState<Array<{ id: number; name: string; year_label: string; term_name: string; is_active: number }>>([]);
  const [classes, setClasses] = useState<Array<{ id: number; code: string; name: string }>>([]);
  const [streams, setStreams] = useState<Array<{ id: number; class_id: number; name: string }>>([]);
  const [students, setStudents] = useState<Array<{ id: number; admission_number: string; first_name: string; last_name: string; stream_name: string }>>([]);

  const [examId, setExamId] = useState('');
  const [classId, setClassId] = useState('');
  const [streamId, setStreamId] = useState('');
  const [loading, setLoading] = useState(true);
  const [generatingBulk, setGeneratingBulk] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    Promise.all([api.get('/academics/examinations'), api.get('/academics/classes-streams')]).then(
      ([exRes, csRes]) => {
        const exList = exRes.data.examinations || [];
        const clsList = csRes.data.classes || [];
        const strList = csRes.data.streams || [];
        setExams(exList);
        setClasses(clsList);
        setStreams(strList);
        const act = exList.find((e: { is_active: number }) => e.is_active === 1) || exList[0];
        if (act) setExamId(String(act.id));
        const s2 = clsList.find((c: { code: string }) => c.code === 'S.2') || clsList[0];
        if (s2) setClassId(String(s2.id));
      }
    );
  }, []);

  useEffect(() => {
    if (!classId) return;
    setLoading(true);
    api
      .get('/students', { params: { classId, ...(streamId ? { streamId } : {}) } })
      .then((res) => setStudents(res.data.students || []))
      .finally(() => setLoading(false));
  }, [classId, streamId]);

  const handleBulkPdf = async () => {
    if (!examId || !classId) return;
    setGeneratingBulk(true);
    try {
      await downloadProtectedFile(
        '/reports/pdf/bulk',
        `BGS_Class_Reports_Exam${examId}.pdf`,
        'POST',
        {
          examinationId: Number(examId),
          classId: Number(classId),
          ...(streamId ? { streamId: Number(streamId) } : {}),
        }
      );
      setFeedback({ type: 'success', message: 'Bulk A4 PDF report cards downloaded successfully.' });
    } catch {
      setFeedback({ type: 'error', message: 'Failed to generate bulk PDF.' });
    } finally {
      setGeneratingBulk(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Report Cards & Institutional Exports"
        subtitle="Preview official A4 report cards, download bulk class PDFs, and export academic summaries."
        actions={
          <button
            type="button"
            disabled={generatingBulk || students.length === 0}
            onClick={handleBulkPdf}
            className="px-4 py-2 text-xs font-semibold bg-[#0F2547] text-white rounded-md hover:bg-[#163361] disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{generatingBulk ? 'Generating A4 PDFs...' : `Bulk Class PDF (${students.length})`}</span>
          </button>
        }
      />

      {feedback && <FeedbackBanner type={feedback.type} message={feedback.message} onClose={() => setFeedback(null)} />}

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Examination</label>
          <select value={examId} onChange={(e) => setExamId(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white">
            {exams.map((ex) => (
              <option key={ex.id} value={ex.id}>{ex.year_label} {ex.term_name} — {ex.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Class</label>
          <select value={classId} onChange={(e) => { setClassId(e.target.value); setStreamId(''); }} className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white">
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
          </select>
        </div>
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Stream</label>
          <select value={streamId} onChange={(e) => setStreamId(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white">
            <option value="">All Streams</option>
            {streams.filter((s) => s.class_id === Number(classId)).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Institutional Summary Exports */}
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <h2 className="text-sm font-bold text-[#0F2547] mb-3">Academic Analysis &amp; Summary Exports</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {[
            { type: 'ranking', title: 'Class Merit & Ranking Report', desc: 'Student averages, grades, aggregates, and class positions.' },
            { type: 'subject_summary', title: 'Subject Performance Summary', desc: 'Subject mean scores, candidate counts, highest and lowest marks.' },
            { type: 'submissions', title: 'Teacher Submission Report', desc: 'Submission timestamps and DOS/Head Teacher approval status.' },
          ].map((rep) => (
            <div key={rep.type} className="border border-slate-200 rounded-lg p-4 flex flex-col justify-between gap-3">
              <div>
                <div className="font-bold text-slate-900">{rep.title}</div>
                <p className="text-slate-500 mt-1">{rep.desc}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    downloadProtectedFile(
                      `/reports/summaries/export?type=${rep.type}&format=pdf&examinationId=${examId}&classId=${classId}`,
                      `BGS_${rep.type}.pdf`
                    )
                  }
                  className="px-2.5 py-1.5 bg-[#0F2547] text-white rounded font-medium inline-flex items-center gap-1"
                >
                  <FileText className="w-3 h-3" />
                  <span>PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadProtectedFile(
                      `/reports/summaries/export?type=${rep.type}&format=xlsx&examinationId=${examId}&classId=${classId}`,
                      `BGS_${rep.type}.xlsx`
                    )
                  }
                  className="px-2.5 py-1.5 border border-slate-200 text-slate-700 rounded font-medium hover:bg-slate-50 inline-flex items-center gap-1"
                >
                  <FileSpreadsheet className="w-3 h-3" />
                  <span>Excel</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadProtectedFile(
                      `/reports/summaries/export?type=${rep.type}&format=csv&examinationId=${examId}&classId=${classId}`,
                      `BGS_${rep.type}.csv`
                    )
                  }
                  className="px-2.5 py-1.5 border border-slate-200 text-slate-700 rounded font-medium hover:bg-slate-50"
                >
                  CSV
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Individual Student Report Cards Table */}
      {loading ? <TableSkeleton rows={8} cols={5} /> : students.length === 0 ? (
        <EmptyState title="No students in selection" description="Select a class with enrolled learners to generate report cards." />
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#0F2547]">Individual Student Report Cards</h3>
            <span className="text-xs text-slate-500 tabular-nums">{students.length} students</span>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-2.5 px-4">Admission No.</th>
                <th className="py-2.5 px-4">Student Name</th>
                <th className="py-2.5 px-4">Stream</th>
                <th className="py-2.5 px-4 text-right">Live Preview &amp; PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {students.map((st) => (
                <tr key={st.id} className="hover:bg-slate-50/70">
                  <td className="py-2.5 px-4 font-mono font-medium text-[#0F2547]">{st.admission_number}</td>
                  <td className="py-2.5 px-4 font-semibold text-slate-900">{st.first_name} {st.last_name}</td>
                  <td className="py-2.5 px-4 text-slate-600">{st.stream_name}</td>
                  <td className="py-2.5 px-4 text-right space-x-3">
                    <Link
                      to={`/reports/preview/${st.id}?examinationId=${examId}`}
                      className="inline-flex items-center gap-1 text-[#1D4ED8] font-semibold hover:underline"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Live Preview</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() =>
                        downloadProtectedFile(
                          `/reports/pdf/student/${st.id}?examinationId=${examId}`,
                          `BGS_Report_${st.last_name}.pdf`
                        )
                      }
                      className="inline-flex items-center gap-1 text-[#0F2547] font-semibold hover:underline"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>PDF</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ReportCardPreviewPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const [searchParams] = useSearchParams();
  const examinationId = searchParams.get('examinationId') || '3';

  const [data, setData] = useState<ReportCardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!studentId) return;
    setLoading(true);
    api
      .get(`/reports/preview/${studentId}`, { params: { examinationId } })
      .then((res) => setData(res.data))
      .catch((err) => setError(err?.response?.data?.error || 'Unable to load report card preview.'))
      .finally(() => setLoading(false));
  }, [studentId, examinationId]);

  if (loading) return <TableSkeleton rows={10} cols={5} />;
  if (error || !data) {
    return (
      <EmptyState
        title="Report Preview Unavailable"
        description={error || 'Student report card data could not be assembled.'}
      />
    );
  }

  const showPhoto = data.settings.show_student_photo_on_report === 'true' && data.student.photoUrl;
  const showPosition = data.settings.show_class_position_on_report !== 'false' && data.exam.rankingEnabled;
  const showAttendance = data.settings.show_attendance_on_report !== 'false' && data.attendance;
  const showInitials = data.settings.show_subject_teacher_initials !== 'false';

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link to="/reports" className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-[#0F2547]">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Report Cards</span>
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3.5 py-2 text-xs font-medium bg-white border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print A4</span>
          </button>
          <button
            type="button"
            onClick={() =>
              downloadProtectedFile(
                `/reports/pdf/student/${data.student.id}?examinationId=${data.exam.id}`,
                `BGS_Report_${data.student.fullName.replace(/[^a-zA-Z0-9_-]/g, '_') || data.student.admissionNumber}.pdf`
              )
            }
            className="px-4 py-2 text-xs font-semibold bg-[#0F2547] text-white rounded-md hover:bg-[#163361] inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Official PDF</span>
          </button>
        </div>
      </div>

      {/* Print-Ready A4 Academic Document Sheet */}
      <div className="print-only-sheet max-w-[820px] mx-auto bg-white border-2 border-[#0F2547] p-2 shadow-sm">
        <div className="border border-[#B48327] p-6 sm:p-8 space-y-5">
          {/* A. OFFICIAL SCHOOL HEADER */}
          <div className="flex items-center justify-between gap-4 pb-4 border-b-2 border-[#0F2547]">
            <img
              src={data.settings.school_logo_url || '/assets/aistudio/Bgs_logo_6081ecf0.png'}
              alt="Buyanja Grammar School Crest"
              referrerPolicy="no-referrer"
              className="w-16 h-16 object-contain shrink-0"
            />
            <div className="text-center flex-1">
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-wide text-[#0F2547]">
                {data.settings.school_name || 'BUYANJA GRAMMAR SCHOOL'}
              </h1>
              <p className="text-xs italic font-medium text-[#9A6D1A] mt-0.5">
                &ldquo;{data.settings.school_motto || 'Discipline, Knowledge and Service'}&rdquo;
              </p>
              <p className="text-[11px] text-slate-600 mt-1">{data.settings.school_address}</p>
              <p className="text-[11px] text-slate-600">
                Tel: {data.settings.school_phone} · Email: {data.settings.school_email}
              </p>
            </div>
            {showPhoto ? (
              <img
                src={data.student.photoUrl!}
                alt={data.student.fullName}
                referrerPolicy="no-referrer"
                className="w-16 h-20 object-cover border border-slate-300 shrink-0"
              />
            ) : (
              <div className="w-16 shrink-0" />
            )}
          </div>

          <div className="bg-[#0F2547] text-white text-center py-1.5 px-3 text-xs font-bold tracking-wider">
            {data.settings.report_document_title || 'OFFICIAL TERMLY ACADEMIC PROGRESS REPORT'} — {data.exam.yearLabel}{' '}
            {data.exam.termName.toUpperCase()}
          </div>

          {/* B. STUDENT INFORMATION PANEL */}
          <div className="bg-[#F8FAFC] border border-slate-200 p-3.5 grid grid-cols-2 sm:grid-cols-3 gap-y-2.5 gap-x-4 text-xs">
            <div>
              <div className="text-[10px] font-semibold text-slate-500">STUDENT NAME</div>
              <div className="font-bold text-[#0F2547] uppercase">{data.student.fullName}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-500">ADMISSION NUMBER</div>
              <div className="font-mono font-bold text-[#0F2547]">{data.student.admissionNumber}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-500">CLASS &amp; STREAM</div>
              <div className="font-bold text-slate-900">
                {data.student.className} ({data.student.streamName})
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-500">EXAMINATION</div>
              <div className="font-semibold text-slate-800">{data.exam.name}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-500">CLASS TEACHER</div>
              <div className="font-semibold text-slate-800">{data.student.classTeacherName}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-500">GENDER</div>
              <div className="font-semibold text-slate-800">{data.student.gender}</div>
            </div>
          </div>

          {/* C. ACADEMIC PERFORMANCE TABLE */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse border border-slate-300">
              <thead>
                <tr className="bg-[#0F2547] text-white">
                  <th className="py-2 px-2.5 border border-[#0F2547]">CODE</th>
                  <th className="py-2 px-2.5 border border-[#0F2547]">SUBJECT</th>
                  {data.categories.map((c) => (
                    <th key={c.id} className="py-2 px-2 border border-[#0F2547] text-right">
                      {c.code} ({c.max_marks})
                    </th>
                  ))}
                  <th className="py-2 px-2.5 border border-[#0F2547] text-right">TOTAL %</th>
                  <th className="py-2 px-2 border border-[#0F2547] text-center">GRADE</th>
                  <th className="py-2 px-2.5 border border-[#0F2547]">REMARKS</th>
                  {showInitials && <th className="py-2 px-2 border border-[#0F2547] text-center">INIT.</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {data.subjects.map((sub, idx) => (
                  <tr key={sub.subjectId} className={idx % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'}>
                    <td className="py-1.5 px-2.5 font-mono font-bold text-[#0F2547] border border-slate-200">
                      {sub.code}
                    </td>
                    <td className="py-1.5 px-2.5 font-medium text-slate-900 border border-slate-200">
                      {sub.name}
                    </td>
                    {data.categories.map((c) => (
                      <td
                        key={c.id}
                        className="py-1.5 px-2 text-right font-mono tabular-nums text-slate-700 border border-slate-200"
                      >
                        {sub.categoryScores[c.code] ?? '—'}
                      </td>
                    ))}
                    <td className="py-1.5 px-2.5 text-right font-mono font-bold tabular-nums text-[#0F2547] border border-slate-200">
                      {sub.weightedTotal !== null ? sub.weightedTotal.toFixed(1) : '—'}
                    </td>
                    <td className="py-1.5 px-2 text-center font-bold text-[#1D4ED8] border border-slate-200">
                      {sub.grade || '—'}
                    </td>
                    <td className="py-1.5 px-2.5 text-slate-600 border border-slate-200">
                      {sub.descriptor || '—'}
                    </td>
                    {showInitials && (
                      <td className="py-1.5 px-2 text-center font-mono text-slate-500 border border-slate-200">
                        {sub.teacherInitials}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* D. PERFORMANCE SUMMARY STRIP */}
          <div className="grid grid-cols-3 sm:grid-cols-6 border border-slate-300 bg-slate-50 divide-x divide-slate-300 text-center">
            <div className="p-2.5">
              <div className="text-[10px] text-slate-500 font-semibold">TOTAL MARKS</div>
              <div className="text-sm font-bold font-mono text-[#0F2547] mt-0.5 tabular-nums">
                {data.summary.totalMarks.toFixed(1)}
              </div>
            </div>
            <div className="p-2.5">
              <div className="text-[10px] text-slate-500 font-semibold">AVERAGE</div>
              <div className="text-sm font-bold font-mono text-[#0F2547] mt-0.5 tabular-nums">
                {data.summary.averageScore.toFixed(1)}%
              </div>
            </div>
            <div className="p-2.5">
              <div className="text-[10px] text-slate-500 font-semibold">OVERALL GRADE</div>
              <div className="text-sm font-bold text-[#1D4ED8] mt-0.5">{data.summary.overallGrade}</div>
            </div>
            <div className="p-2.5">
              <div className="text-[10px] text-slate-500 font-semibold">AGGREGATE</div>
              <div className="text-sm font-bold font-mono text-[#0F2547] mt-0.5 tabular-nums">
                {data.exam.aggregateEnabled && data.summary.aggregatePoints !== null
                  ? data.summary.aggregatePoints
                  : '—'}
              </div>
            </div>
            <div className="p-2.5">
              <div className="text-[10px] text-slate-500 font-semibold">POSITION</div>
              <div className="text-sm font-bold font-mono text-[#0F2547] mt-0.5 tabular-nums">
                {showPosition && data.summary.classPosition
                  ? `${data.summary.classPosition} / ${data.summary.classSize}`
                  : '—'}
              </div>
            </div>
            <div className="p-2.5">
              <div className="text-[10px] text-slate-500 font-semibold">SUBJECTS</div>
              <div className="text-sm font-bold font-mono text-[#0F2547] mt-0.5 tabular-nums">
                {data.summary.subjectsAssessed}
              </div>
            </div>
          </div>

          {/* F. PERFORMANCE STANDING & ATTENDANCE */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700">
            <div>
              <span className="font-semibold text-[#0F2547]">Performance Standing:</span>{' '}
              {data.summary.performanceDescriptor}
            </div>
            {showAttendance && data.attendance && (
              <div className="tabular-nums">
                <span className="font-semibold text-[#0F2547]">Attendance:</span>{' '}
                {data.attendance.daysPresent} / {data.attendance.totalDays} days ({data.attendance.percentage}%) · Absent:{' '}
                {data.attendance.daysAbsent}
              </div>
            )}
          </div>

          {/* E & G. COMMENTS */}
          <div className="space-y-2.5 text-xs">
            <div className="border border-slate-200 p-3">
              <div className="text-[10px] font-bold text-[#0F2547] mb-1">CLASS TEACHER&apos;S COMMENT</div>
              <p className="text-slate-800">{data.comments.classTeacherComment}</p>
            </div>
            <div className="border border-slate-200 p-3">
              <div className="text-[10px] font-bold text-[#0F2547] mb-1">HEAD TEACHER&apos;S REMARKS</div>
              <p className="text-slate-800">{data.comments.headTeacherComment}</p>
            </div>
          </div>

          {/* H. SIGNATURES & STAMP */}
          <div className="grid grid-cols-4 gap-4 pt-6 items-end text-center text-[11px] text-slate-600">
            <div>
              <div className="border-b border-slate-400 h-6" />
              <div className="mt-1">Class Teacher</div>
            </div>
            <div>
              <div className="border-b border-slate-400 h-6" />
              <div className="mt-1">Director of Studies</div>
            </div>
            <div>
              <div className="border-b border-slate-400 h-6" />
              <div className="mt-1">Head Teacher</div>
            </div>
            <div className="border border-dashed border-[#B48327] py-3 text-[10px] text-slate-500">
              OFFICIAL SCHOOL STAMP
            </div>
          </div>

          {/* I. NEXT TERM INFORMATION */}
          <div className="bg-[#FEF7E6] border border-[#E5C98B] p-3 text-xs">
            <div className="font-bold text-[#0F2547]">
              NEXT TERM BEGINS: {data.exam.nextTermBegins || 'To be communicated'}
            </div>
            <p className="text-slate-700 mt-0.5">{data.settings.next_term_announcement}</p>
          </div>

          {/* J. FOOTER & VERIFICATION */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-4 text-[11px] text-slate-500">
            <div className="space-y-1">
              <div className="font-mono font-semibold text-[#0F2547]">
                Report Reference: {data.reportRef}
              </div>
              <div>
                Generated: {new Date(data.generatedAt).toLocaleString('en-UG')} ·{' '}
                <Link
                  to={`/verify-report/${encodeURIComponent(data.reportRef)}`}
                  className="text-[#1D4ED8] hover:underline"
                >
                  Verify Document Authenticity
                </Link>
              </div>
              <p className="italic text-[10px]">{data.settings.report_footer_notice}</p>
            </div>
            <div className="text-right text-[10px] font-mono text-[#0F2547] border border-slate-200 px-2.5 py-2 rounded shrink-0">
              QR Embedded in PDF
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
