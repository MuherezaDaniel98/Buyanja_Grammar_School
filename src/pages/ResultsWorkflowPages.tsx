import {
  CheckCircle2,
  Edit3,
  FileText,
  Lock,
  RotateCcw,
  Save,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  EmptyState,
  FeedbackBanner,
  PageHeader,
  StatusText,
  TableSkeleton,
} from '../components/UiPrimitives';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

interface SubmissionRow {
  id: number;
  examination_id: number;
  class_id: number;
  stream_id: number;
  subject_id: number;
  class_code: string;
  class_name: string;
  stream_name: string;
  subject_code: string;
  subject_name: string;
  submitted_by_name: string | null;
  verified_by_name: string | null;
  approved_by_name: string | null;
  status: string;
  student_count: number;
  subject_average: number | null;
  submitted_at: string | null;
  teacher_notes: string | null;
  dos_notes: string | null;
}

const WORKFLOW_STEPS = ['DRAFT', 'SUBMITTED', 'VERIFIED', 'APPROVED', 'PUBLISHED'];

function WorkflowTracker({ currentStatus }: { currentStatus: string }) {
  const activeIdx = WORKFLOW_STEPS.indexOf(currentStatus);
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      {WORKFLOW_STEPS.map((step, idx) => {
        const done = activeIdx >= idx;
        return (
          <span
            key={step}
            className={`px-1.5 py-0.5 rounded font-medium ${
              currentStatus === 'RETURNED' && step === 'DRAFT'
                ? 'bg-amber-100 text-amber-800'
                : done
                  ? 'bg-[#0F2547] text-white'
                  : 'bg-slate-100 text-slate-400'
            }`}
          >
            {step}
          </span>
        );
      })}
    </div>
  );
}

export function SubmissionsTrackerPage() {
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    setLoading(true);
    api
      .get('/marks/submissions', { params: statusFilter ? { status: statusFilter } : {} })
      .then((res) => setSubmissions(res.data.submissions || []))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Marks Submission & Workflow Tracker"
        subtitle="Track real-time submission progress from Subject Teachers through DOS Verification to Publication."
        actions={
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
          >
            <option value="">All Workflow Stages</option>
            <option value="DRAFT">Draft</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="RETURNED">Returned</option>
            <option value="VERIFIED">Verified</option>
            <option value="APPROVED">Approved</option>
            <option value="PUBLISHED">Published</option>
          </select>
        }
      />

      {loading ? (
        <TableSkeleton rows={8} cols={6} />
      ) : submissions.length === 0 ? (
        <EmptyState title="No submissions recorded" description="No marks sheets match the selected stage." />
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="py-3 px-4">Class / Stream</th>
                  <th className="py-3 px-4">Subject</th>
                  <th className="py-3 px-4">Teacher</th>
                  <th className="py-3 px-4 text-right">Mean %</th>
                  <th className="py-3 px-4">Stage</th>
                  <th className="py-3 px-4">Workflow Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {submissions.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-semibold text-[#0F2547]">{s.class_code} · {s.stream_name}</td>
                    <td className="py-3 px-4">{s.subject_code} — {s.subject_name}</td>
                    <td className="py-3 px-4 text-slate-600">{s.submitted_by_name || 'Assigned Teacher'}</td>
                    <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums">
                      {s.subject_average !== null ? `${s.subject_average}%` : '—'}
                    </td>
                    <td className="py-3 px-4"><StatusText status={s.status} /></td>
                    <td className="py-3 px-4"><WorkflowTracker currentStatus={s.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export function VerificationPage() {
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [returnTarget, setReturnTarget] = useState<SubmissionRow | null>(null);
  const [returnReason, setReturnReason] = useState('');

  const loadQueue = () => {
    setLoading(true);
    api
      .get('/marks/submissions')
      .then((res) => setSubmissions(res.data.submissions || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadQueue();
  }, []);

  const verifySubmission = async (id: number) => {
    try {
      const res = await api.post('/marks/verify', { submissionId: id, decision: 'VERIFIED' });
      setFeedback({ type: 'success', message: res.data.message });
      loadQueue();
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Verification failed.' });
    }
  };

  const submitReturn = async () => {
    if (!returnTarget) return;
    try {
      const res = await api.post('/marks/verify', {
        submissionId: returnTarget.id,
        decision: 'RETURNED',
        comments: returnReason,
      });
      setFeedback({ type: 'success', message: res.data.message });
      setReturnTarget(null);
      setReturnReason('');
      loadQueue();
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Return failed.' });
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Results Verification (Director of Studies)"
        subtitle="Review submitted subject marks, return anomalies for correction, or verify results for Head Teacher approval."
      />
      {feedback && <FeedbackBanner type={feedback.type} message={feedback.message} onClose={() => setFeedback(null)} />}

      {loading ? <TableSkeleton rows={6} cols={6} /> : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-3 px-4">Class / Stream</th>
                <th className="py-3 px-4">Subject</th>
                <th className="py-3 px-4">Submitted By</th>
                <th className="py-3 px-4 text-right">Candidates</th>
                <th className="py-3 px-4 text-right">Subject Mean</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">DOS Decision</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {submissions.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 font-semibold text-[#0F2547]">{s.class_code} · {s.stream_name}</td>
                  <td className="py-3 px-4">{s.subject_code} — {s.subject_name}</td>
                  <td className="py-3 px-4 text-slate-600">{s.submitted_by_name || '—'}</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">{s.student_count}</td>
                  <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums">
                    {s.subject_average !== null ? `${s.subject_average}%` : '—'}
                  </td>
                  <td className="py-3 px-4"><StatusText status={s.status} /></td>
                  <td className="py-3 px-4 text-right space-x-2">
                    <Link
                      to={`/marks/entry?classId=${s.class_id}&streamId=${s.stream_id}&subjectId=${s.subject_id}`}
                      className="text-slate-600 hover:underline mr-2"
                    >
                      Inspect
                    </Link>
                    {s.status === 'SUBMITTED' && (
                      <>
                        <button
                          type="button"
                          onClick={() => setReturnTarget(s)}
                          className="px-2.5 py-1 border border-amber-300 text-amber-800 rounded hover:bg-amber-50 inline-flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Return</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => verifySubmission(s.id)}
                          className="px-2.5 py-1 bg-[#1D4ED8] text-white font-semibold rounded hover:bg-[#2563EB] inline-flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Verify</span>
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {returnTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/50" onClick={() => setReturnTarget(null)} />
          <div className="relative z-10 w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-[#0F2547]">
              Return Marks for Correction ({returnTarget.class_code} {returnTarget.subject_code})
            </h2>
            <textarea
              rows={3}
              required
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              placeholder="Specify which marks or students need correction..."
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setReturnTarget(null)} className="px-4 py-2 text-xs border border-slate-200 rounded-md">
                Cancel
              </button>
              <button type="button" onClick={submitReturn} className="px-4 py-2 text-xs font-semibold bg-amber-600 text-white rounded-md">
                Return to Teacher
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ApprovalPage() {
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadQueue = () => {
    setLoading(true);
    api
      .get('/marks/submissions')
      .then((res) => setSubmissions(res.data.submissions || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadQueue();
  }, []);

  const runDecision = async (ids: number[], decision: 'APPROVED' | 'PUBLISHED' | 'RETURNED') => {
    try {
      const res = await api.post('/marks/approve', { submissionIds: ids, decision });
      setFeedback({ type: 'success', message: res.data.message });
      setSelectedIds([]);
      loadQueue();
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Action failed.' });
    }
  };

  const actionable = submissions.filter((s) => s.status === 'VERIFIED' || s.status === 'APPROVED');

  return (
    <div className="space-y-5">
      <PageHeader
        title="Final Results Approval & Publication (Head Teacher)"
        subtitle="Approve DOS-verified subject results, lock records against unauthorised changes, and publish official report cards."
        actions={
          selectedIds.length > 0 ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => runDecision(selectedIds, 'APPROVED')}
                className="px-3.5 py-2 text-xs font-semibold bg-[#1D4ED8] text-white rounded-md inline-flex items-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Approve &amp; Lock ({selectedIds.length})</span>
              </button>
              <button
                type="button"
                onClick={() => runDecision(selectedIds, 'PUBLISHED')}
                className="px-3.5 py-2 text-xs font-semibold bg-[#0F2547] text-white rounded-md inline-flex items-center gap-1.5"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Publish Selected ({selectedIds.length})</span>
              </button>
            </div>
          ) : undefined
        }
      />

      {feedback && <FeedbackBanner type={feedback.type} message={feedback.message} onClose={() => setFeedback(null)} />}

      {loading ? <TableSkeleton rows={6} cols={6} /> : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-3 px-4 w-10">
                  <input
                    type="checkbox"
                    checked={selectedIds.length > 0 && selectedIds.length === actionable.length}
                    onChange={(e) => setSelectedIds(e.target.checked ? actionable.map((a) => a.id) : [])}
                  />
                </th>
                <th className="py-3 px-4">Class / Stream</th>
                <th className="py-3 px-4">Subject</th>
                <th className="py-3 px-4">Verified By (DOS)</th>
                <th className="py-3 px-4 text-right">Subject Mean</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Decision</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {submissions.map((s) => {
                const canSelect = s.status === 'VERIFIED' || s.status === 'APPROVED';
                return (
                  <tr key={s.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      {canSelect && (
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(s.id)}
                          onChange={(e) =>
                            setSelectedIds((prev) => (e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id)))
                          }
                        />
                      )}
                    </td>
                    <td className="py-3 px-4 font-semibold text-[#0F2547]">{s.class_code} · {s.stream_name}</td>
                    <td className="py-3 px-4">{s.subject_code} — {s.subject_name}</td>
                    <td className="py-3 px-4 text-slate-600">{s.verified_by_name || 'Pending DOS'}</td>
                    <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums">
                      {s.subject_average !== null ? `${s.subject_average}%` : '—'}
                    </td>
                    <td className="py-3 px-4"><StatusText status={s.status} /></td>
                    <td className="py-3 px-4 text-right space-x-2">
                      {s.status === 'VERIFIED' && (
                        <button
                          type="button"
                          onClick={() => runDecision([s.id], 'APPROVED')}
                          className="px-2.5 py-1 bg-[#1D4ED8] text-white font-semibold rounded"
                        >
                          Approve
                        </button>
                      )}
                      {(s.status === 'VERIFIED' || s.status === 'APPROVED') && (
                        <button
                          type="button"
                          onClick={() => runDecision([s.id], 'PUBLISHED')}
                          className="px-2.5 py-1 bg-[#0F2547] text-white font-semibold rounded"
                        >
                          Publish
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const SUGGESTED_COMMENTS = [
  'Consistent academic diligence across all subjects. Keep aiming higher.',
  'Good performance with strong analytical potential; maintain regular revision.',
  'Satisfactory term effort; focused practice in sciences will boost overall grade.',
  'Requires closer academic follow-up and structured remedial revision.',
];

export function PublishedResultsPage() {
  const { hasPermission } = useAuth();
  const canEditComments = hasPermission('comments.manage', 'headteacher.remarks');
  const canHeadRemarks = hasPermission('headteacher.remarks');
  const canCorrectApproved = hasPermission('results.correct_approved');

  const [exams, setExams] = useState<Array<{ id: number; name: string; year_label: string; term_name: string; is_active: number }>>([]);
  const [classes, setClasses] = useState<Array<{ id: number; code: string; name: string }>>([]);
  const [streams, setStreams] = useState<Array<{ id: number; class_id: number; name: string }>>([]);
  const [examId, setExamId] = useState('');
  const [classId, setClassId] = useState('');
  const [streamId, setStreamId] = useState('');

  const [summaries, setSummaries] = useState<
    Array<{
      student_id: number;
      stream_id: number;
      admission_number: string;
      first_name: string;
      last_name: string;
      stream_name: string;
      total_marks: number;
      average_score: number;
      overall_grade: string | null;
      aggregate_points: number | null;
      class_position: number | null;
      class_size: number | null;
      class_teacher_comment: string | null;
      head_teacher_comment: string | null;
      total_days: number | null;
      days_present: number | null;
    }>
  >([]);
  const [subjects, setSubjects] = useState<Array<{ id: number; code: string; name: string }>>([]);
  const [subjectScores, setSubjectScores] = useState<
    Array<{ student_id: number; subject_code: string; weighted_total: number | null; grade: string | null }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Comment modal
  const [commentTarget, setCommentTarget] = useState<(typeof summaries)[0] | null>(null);
  const [ctComment, setCtComment] = useState('');
  const [htComment, setHtComment] = useState('');
  const [totalDays, setTotalDays] = useState(65);
  const [daysPresent, setDaysPresent] = useState(63);

  // Authorized correction modal
  const [showCorrectModal, setShowCorrectModal] = useState(false);
  const [corrForm, setCorrForm] = useState({
    studentId: '',
    subjectId: '',
    assessmentCategoryId: '',
    newScore: '',
    reason: '',
  });
  const [examCats, setExamCats] = useState<Array<{ id: number; code: string; name: string; max_marks: number }>>([]);

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
        if (act) {
          setExamId(String(act.id));
          setExamCats(act.categories || []);
        }
        const s2 = clsList.find((c: { code: string }) => c.code === 'S.2') || clsList[0];
        if (s2) setClassId(String(s2.id));
      }
    );
  }, []);

  const loadPublished = () => {
    if (!examId || !classId) return;
    setLoading(true);
    api
      .get('/marks/published', {
        params: { examinationId: examId, classId, ...(streamId ? { streamId } : {}) },
      })
      .then((res) => {
        setSummaries(res.data.summaries || []);
        setSubjects(res.data.subjects || []);
        setSubjectScores(res.data.subjectScores || []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPublished();
  }, [examId, classId, streamId]);

  const saveComments = async () => {
    if (!commentTarget) return;
    try {
      await api.post('/marks/comments-attendance', {
        examinationId: Number(examId),
        classId: Number(classId),
        streamId: commentTarget.stream_id,
        studentId: commentTarget.student_id,
        classTeacherComment: ctComment,
        ...(canHeadRemarks ? { headTeacherComment: htComment } : {}),
        totalDays: Number(totalDays),
        daysPresent: Number(daysPresent),
      });
      setFeedback({ type: 'success', message: `Updated report remarks and attendance for ${commentTarget.first_name} ${commentTarget.last_name}.` });
      setCommentTarget(null);
      loadPublished();
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to save remarks.' });
    }
  };

  const submitCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    const stu = summaries.find((s) => s.student_id === Number(corrForm.studentId));
    if (!stu) return;
    try {
      await api.post('/marks/correct-approved', {
        examinationId: Number(examId),
        classId: Number(classId),
        streamId: stu.stream_id,
        subjectId: Number(corrForm.subjectId),
        studentId: Number(corrForm.studentId),
        assessmentCategoryId: Number(corrForm.assessmentCategoryId),
        newScore: Number(corrForm.newScore),
        reason: corrForm.reason,
      });
      setFeedback({ type: 'success', message: 'Authorized mark correction recorded in version history and class ranks updated.' });
      setShowCorrectModal(false);
      setCorrForm({ studentId: '', subjectId: '', assessmentCategoryId: '', newScore: '', reason: '' });
      loadPublished();
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Correction failed.' });
    }
  };

  const scoreLookup = new Map<string, { weighted_total: number | null; grade: string | null }>();
  for (const sc of subjectScores) {
    scoreLookup.set(`${sc.student_id}:${sc.subject_code}`, sc);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Published Results, Merit List & Comments"
        subtitle="View class rankings, weighted subject results, manage class/head teacher remarks, and preview student report cards."
        actions={
          canCorrectApproved ? (
            <button
              type="button"
              onClick={() => setShowCorrectModal(true)}
              className="px-3.5 py-2 text-xs font-semibold bg-white border border-slate-300 text-[#0F2547] rounded-md hover:bg-slate-50 inline-flex items-center gap-1.5"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Authorized Mark Correction</span>
            </button>
          ) : undefined
        }
      />

      {feedback && <FeedbackBanner type={feedback.type} message={feedback.message} onClose={() => setFeedback(null)} />}

      <div className="bg-white border border-slate-200 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Examination</label>
          <select
            value={examId}
            onChange={(e) => {
              setExamId(e.target.value);
              const found = exams.find((x) => String(x.id) === e.target.value) as unknown as { categories?: typeof examCats } | undefined;
              if (found?.categories) setExamCats(found.categories);
            }}
            className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
          >
            {exams.map((ex) => (
              <option key={ex.id} value={ex.id}>{ex.year_label} {ex.term_name} — {ex.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Class</label>
          <select
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setStreamId('');
            }}
            className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
          >
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

      {loading ? <TableSkeleton rows={8} cols={8} /> : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0F2547] text-white">
                <tr>
                  <th className="py-2.5 px-3">Pos.</th>
                  <th className="py-2.5 px-3">Adm No.</th>
                  <th className="py-2.5 px-3 min-w-[160px]">Student Name</th>
                  {subjects.slice(0, 6).map((sub) => (
                    <th key={sub.id} className="py-2.5 px-2.5 text-right">{sub.code}</th>
                  ))}
                  <th className="py-2.5 px-3 text-right">Avg %</th>
                  <th className="py-2.5 px-3 text-center">Grade</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summaries.map((sum) => (
                  <tr key={sum.student_id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-3 font-mono font-bold text-[#0F2547] tabular-nums">
                      {sum.class_position ?? '—'}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-600">{sum.admission_number}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900">
                      {sum.first_name} {sum.last_name}
                      <div className="text-[11px] font-normal text-slate-500">{sum.stream_name}</div>
                    </td>
                    {subjects.slice(0, 6).map((sub) => {
                      const sc = scoreLookup.get(`${sum.student_id}:${sub.code}`);
                      return (
                        <td key={sub.id} className="py-2.5 px-2.5 text-right font-mono tabular-nums">
                          {sc?.weighted_total !== null && sc?.weighted_total !== undefined
                            ? `${Math.round(sc.weighted_total)}`
                            : '—'}
                        </td>
                      );
                    })}
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-[#0F2547] tabular-nums">
                      {sum.average_score.toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3 text-center font-bold text-[#1D4ED8]">{sum.overall_grade || '—'}</td>
                    <td className="py-2.5 px-3 text-right space-x-2 whitespace-nowrap">
                      {canEditComments && (
                        <button
                          type="button"
                          onClick={() => {
                            setCommentTarget(sum);
                            setCtComment(sum.class_teacher_comment || '');
                            setHtComment(sum.head_teacher_comment || '');
                            setTotalDays(sum.total_days ?? 65);
                            setDaysPresent(sum.days_present ?? 63);
                          }}
                          className="text-slate-700 hover:text-[#0F2547] font-medium hover:underline"
                        >
                          Remarks
                        </button>
                      )}
                      <Link
                        to={`/reports/preview/${sum.student_id}?examinationId=${examId}`}
                        className="inline-flex items-center gap-1 text-[#1D4ED8] font-semibold hover:underline"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Report</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Teacher Comments & Attendance Modal */}
      {commentTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/50" onClick={() => setCommentTarget(null)} />
          <div className="relative z-10 w-full max-w-lg bg-white border border-slate-200 rounded-lg shadow-xl p-6 space-y-4 text-xs">
            <h2 className="text-base font-bold text-[#0F2547]">
              Report Remarks &amp; Attendance — {commentTarget.first_name} {commentTarget.last_name}
            </h2>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Suggested Class Teacher Remarks</label>
              <select
                value=""
                onChange={(e) => { if (e.target.value) setCtComment(e.target.value); }}
                className="w-full px-3 py-1.5 border border-slate-200 rounded-md bg-white mb-2"
              >
                <option value="">Insert a suggested observation...</option>
                {SUGGESTED_COMMENTS.map((c, i) => <option key={i} value={c}>{c}</option>)}
              </select>
              <textarea
                rows={2}
                value={ctComment}
                onChange={(e) => setCtComment(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>

            {canHeadRemarks && (
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Head Teacher&apos;s Remarks</label>
                <textarea
                  rows={2}
                  value={htComment}
                  onChange={(e) => setHtComment(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Total School Days</label>
                <input type="number" value={totalDays} onChange={(e) => setTotalDays(Number(e.target.value))} className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono" />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Days Present</label>
                <input type="number" value={daysPresent} onChange={(e) => setDaysPresent(Number(e.target.value))} className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono" />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setCommentTarget(null)} className="px-4 py-2 border border-slate-200 rounded-md">Cancel</button>
              <button type="button" onClick={saveComments} className="px-4 py-2 bg-[#0F2547] text-white font-semibold rounded-md inline-flex items-center gap-1.5">
                <Save className="w-3.5 h-3.5" />
                <span>Save Remarks</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Authorized Post-Approval Mark Correction Modal */}
      {showCorrectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/50" onClick={() => setShowCorrectModal(false)} />
          <form onSubmit={submitCorrection} className="relative z-10 w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-xl p-6 space-y-3 text-xs">
            <h2 className="text-base font-bold text-[#0F2547]">Authorized Post-Approval Correction</h2>
            <p className="text-slate-500">All revisions to approved marks are permanently logged with user identity and reason.</p>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Student</label>
              <select required value={corrForm.studentId} onChange={(e) => setCorrForm({ ...corrForm, studentId: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white">
                <option value="">Select student</option>
                {summaries.map((s) => <option key={s.student_id} value={s.student_id}>{s.admission_number} — {s.first_name} {s.last_name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Subject</label>
                <select required value={corrForm.subjectId} onChange={(e) => setCorrForm({ ...corrForm, subjectId: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white">
                  <option value="">Select subject</option>
                  {subjects.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Assessment</label>
                <select required value={corrForm.assessmentCategoryId} onChange={(e) => setCorrForm({ ...corrForm, assessmentCategoryId: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white">
                  <option value="">Select category</option>
                  {examCats.map((c) => <option key={c.id} value={c.id}>{c.code} (Max {c.max_marks})</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Corrected Raw Score</label>
              <input type="number" step="0.1" required value={corrForm.newScore} onChange={(e) => setCorrForm({ ...corrForm, newScore: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono" />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Mandatory Audit Reason*</label>
              <textarea rows={2} required minLength={5} value={corrForm.reason} onChange={(e) => setCorrForm({ ...corrForm, reason: e.target.value })} placeholder="e.g. Script re-tally approved by DOS" className="w-full px-3 py-2 border border-slate-200 rounded-md" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowCorrectModal(false)} className="px-4 py-2 border border-slate-200 rounded-md">Cancel</button>
              <button type="submit" className="px-4 py-2 bg-[#0F2547] text-white font-semibold rounded-md">Apply &amp; Recalculate</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
