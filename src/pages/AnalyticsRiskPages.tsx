import { AlertTriangle, Download, Plus, TrendingUp } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  EmptyState,
  FeedbackBanner,
  PageHeader,
  StatusText,
  TableSkeleton,
} from '../components/UiPrimitives';
import { api, downloadProtectedFile } from '../lib/api';

const COLORS = ['#0F2547', '#1D4ED8', '#B48327', '#475569', '#0EA5E9'];

export function AcademicAnalyticsPage() {
  const [exams, setExams] = useState<Array<{ id: number; name: string; year_label: string; term_name: string; is_active: number }>>([]);
  const [classes, setClasses] = useState<Array<{ id: number; code: string; name: string }>>([]);
  const [examId, setExamId] = useState('');
  const [classId, setClassId] = useState('');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    threshold: number;
    classComparisons: Array<{ classCode: string; averageScore: number; topScore: number; minScore: number; studentCount: number }>;
    subjectComparisons: Array<{ subjectCode: string; subjectName: string; department: string; averageScore: number; highestScore: number; lowestScore: number; passCount: number; totalCount: number }>;
    gradeDistribution: Array<{ grade: string; count: number }>;
    termTrends: Array<{ period: string; schoolAverage: number }>;
    topPerformers: Array<{ student_id: number; admission_number: string; full_name: string; class_code: string; stream_name: string; average_score: number; overall_grade: string; class_position: number }>;
    belowThreshold: Array<{ student_id: number; admission_number: string; full_name: string; class_code: string; stream_name: string; average_score: number; overall_grade: string }>;
  } | null>(null);

  useEffect(() => {
    Promise.all([api.get('/academics/examinations'), api.get('/academics/classes-streams')]).then(
      ([exRes, csRes]) => {
        const exList = exRes.data.examinations || [];
        setExams(exList);
        setClasses(csRes.data.classes || []);
        const act = exList.find((e: { is_active: number }) => e.is_active === 1) || exList[0];
        if (act) setExamId(String(act.id));
      }
    );
  }, []);

  useEffect(() => {
    if (!examId) return;
    setLoading(true);
    api
      .get('/analytics/overview', {
        params: { examinationId: examId, ...(classId ? { classId } : {}) },
      })
      .then((res) => setData(res.data))
      .finally(() => setLoading(false));
  }, [examId, classId]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Academic Analytics & Performance Intelligence"
        subtitle="Comparative analysis across classes, subjects, grade distributions, and term-to-term trajectories."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select value={examId} onChange={(e) => setExamId(e.target.value)} className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md">
              {exams.map((ex) => <option key={ex.id} value={ex.id}>{ex.year_label} {ex.term_name} — {ex.name}</option>)}
            </select>
            <select value={classId} onChange={(e) => setClassId(e.target.value)} className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md">
              <option value="">All Classes</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
            </select>
            {examId && (
              <button
                type="button"
                onClick={() =>
                  downloadProtectedFile(
                    `/reports/summaries/export?type=subject_summary&format=xlsx&examinationId=${examId}${classId ? `&classId=${classId}` : ''}`,
                    'BGS_Analytics_Subject_Summary.xlsx'
                  )
                }
                className="px-3 py-1.5 text-xs font-semibold bg-[#0F2547] text-white rounded-md inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Analysis</span>
              </button>
            )}
          </div>
        }
      />

      {loading || !data ? <TableSkeleton rows={8} cols={4} /> : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-lg p-5 min-w-0">
              <h3 className="text-sm font-bold text-[#0F2547] mb-1">Class Average vs Top Score</h3>
              <p className="text-xs text-slate-500 mb-4">Comparative benchmark across academic levels</p>
              <div className="h-64 min-w-0">
                <ResponsiveContainer width="100%" height={256} minWidth={0}>
                  <BarChart data={data.classComparisons}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="classCode" tick={{ fontSize: 12 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="averageScore" name="Class Mean %" fill="#0F2547" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="topScore" name="Top Score %" fill="#B48327" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-5 min-w-0">
              <h3 className="text-sm font-bold text-[#0F2547] mb-1">School-Wide Termly Trend</h3>
              <p className="text-xs text-slate-500 mb-4">Mean percentage progression across terms</p>
              <div className="h-64 min-w-0">
                <ResponsiveContainer width="100%" height={256} minWidth={0}>
                  <LineChart data={data.termTrends}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="schoolAverage" name="School Average %" stroke="#1D4ED8" strokeWidth={2.5} dot={{ r: 4, fill: '#0F2547' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-5 min-w-0">
              <h3 className="text-sm font-bold text-[#0F2547] mb-1">Subject Strengths &amp; Weaknesses</h3>
              <p className="text-xs text-slate-500 mb-4">Sorted from highest to lowest mean weighted score</p>
              <div className="h-64 min-w-0">
                <ResponsiveContainer width="100%" height={256} minWidth={0}>
                  <BarChart data={data.subjectComparisons}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="subjectCode" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="averageScore" name="Subject Average %" fill="#1D4ED8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-5 min-w-0">
              <h3 className="text-sm font-bold text-[#0F2547] mb-1">Grade Distribution</h3>
              <p className="text-xs text-slate-500 mb-4">Proportion of subject grades awarded</p>
              <div className="h-64 min-w-0">
                <ResponsiveContainer width="100%" height={256} minWidth={0}>
                  <PieChart>
                    <Pie data={data.gradeDistribution} dataKey="count" nameKey="grade" innerRadius={50} outerRadius={85} label>
                      {data.gradeDistribution.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Top Performers & Below Threshold Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200">
                <h3 className="text-sm font-bold text-[#0F2547]">Top-Performing Learners</h3>
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-2.5 px-4">Student</th>
                    <th className="py-2.5 px-4">Class</th>
                    <th className="py-2.5 px-4 text-right">Average</th>
                    <th className="py-2.5 px-4 text-center">Grade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.topPerformers.map((s) => (
                    <tr key={s.student_id}>
                      <td className="py-2.5 px-4 font-semibold">
                        <Link to={`/students/${s.student_id}`} className="text-[#0F2547] hover:underline">{s.full_name}</Link>
                        <span className="ml-2 font-mono text-[11px] text-slate-400">{s.admission_number}</span>
                      </td>
                      <td className="py-2.5 px-4">{s.class_code} · {s.stream_name}</td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold tabular-nums">{s.average_score}%</td>
                      <td className="py-2.5 px-4 text-center font-bold text-[#1D4ED8]">{s.overall_grade}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#0F2547]">Learners Below {data.threshold}% Threshold</h3>
                <Link to="/student-progress" className="text-xs text-[#1D4ED8] font-semibold hover:underline">
                  Open Support Planner
                </Link>
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-2.5 px-4">Student</th>
                    <th className="py-2.5 px-4">Class</th>
                    <th className="py-2.5 px-4 text-right">Average</th>
                    <th className="py-2.5 px-4 text-center">Grade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.belowThreshold.length === 0 ? (
                    <tr><td colSpan={4} className="py-6 text-center text-slate-500">No students below configured threshold.</td></tr>
                  ) : (
                    data.belowThreshold.map((s) => (
                      <tr key={s.student_id}>
                        <td className="py-2.5 px-4 font-semibold">
                          <Link to={`/students/${s.student_id}`} className="text-[#0F2547] hover:underline">{s.full_name}</Link>
                        </td>
                        <td className="py-2.5 px-4">{s.class_code} · {s.stream_name}</td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold text-amber-700 tabular-nums">{s.average_score}%</td>
                        <td className="py-2.5 px-4 text-center font-bold">{s.overall_grade}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function StudentProgressRiskPage() {
  const [loading, setLoading] = useState(true);
  const [flagged, setFlagged] = useState<
    Array<{
      studentId: number;
      admissionNumber: string;
      fullName: string;
      classCode: string;
      streamName: string;
      currentAverage: number;
      previousAverage: number | null;
      delta: number | null;
      supportPriority: string;
      indicators: string[];
      weakSubjects: Array<{ code: string; name: string; score: number }>;
      suggestions: string[];
      interventionNotes: Array<{ id: number; note: string; action_plan: string | null; author_name: string; created_at: string }>;
    }>
  >([]);
  const [classes, setClasses] = useState<Array<{ id: number; code: string; name: string }>>([]);
  const [classId, setClassId] = useState('');
  const [noteTarget, setNoteTarget] = useState<(typeof flagged)[0] | null>(null);
  const [noteForm, setNoteForm] = useState({ riskLevel: 'MODERATE', note: '', actionPlan: '' });
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadData = () => {
    setLoading(true);
    api
      .get('/analytics/risk-identification', { params: classId ? { classId } : {} })
      .then((res) => setFlagged(res.data.flaggedStudents || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    api.get('/academics/classes-streams').then((res) => setClasses(res.data.classes || []));
  }, []);

  useEffect(() => {
    loadData();
  }, [classId]);

  const saveIntervention = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTarget) return;
    try {
      await api.post('/analytics/interventions', {
        studentId: noteTarget.studentId,
        riskLevel: noteForm.riskLevel,
        note: noteForm.note,
        actionPlan: noteForm.actionPlan,
      });
      setFeedback({ type: 'success', message: `Intervention note recorded for ${noteTarget.fullName}.` });
      setNoteTarget(null);
      setNoteForm({ riskLevel: 'MODERATE', note: '', actionPlan: '' });
      loadData();
    } catch {
      setFeedback({ type: 'error', message: 'Failed to save intervention note.' });
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Academic Support & Early-Warning Indicators"
        subtitle="Decision-support indicators identifying learners experiencing term-to-term declines, low averages, or missing records."
        actions={
          <select value={classId} onChange={(e) => setClassId(e.target.value)} className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md">
            <option value="">All Classes</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
          </select>
        }
      />

      {feedback && <FeedbackBanner type={feedback.type} message={feedback.message} onClose={() => setFeedback(null)} />}

      <div className="bg-blue-50/60 border border-blue-200 rounded-lg px-4 py-3 text-xs text-slate-700 flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-[#1D4ED8] shrink-0" />
        <span>
          Decision-Support Guidance: These indicators assist teachers and administrators in coordinating timely mentoring and remedial support.
        </span>
      </div>

      {loading ? <TableSkeleton rows={6} cols={4} /> : flagged.length === 0 ? (
        <EmptyState title="No students currently flagged" description="All assessed learners in this filter are meeting configured support thresholds." icon={AlertTriangle} />
      ) : (
        <div className="space-y-4">
          {flagged.map((st) => (
            <div key={st.studentId} className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2.5">
                    <Link to={`/students/${st.studentId}`} className="text-sm font-bold text-[#0F2547] hover:underline">
                      {st.fullName}
                    </Link>
                    <span className="text-xs font-mono text-slate-500">{st.admissionNumber}</span>
                    <span className="text-xs text-slate-500">· {st.classCode} {st.streamName}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs tabular-nums">
                    <span>Current Average: <strong className="text-[#0F2547]">{st.currentAverage}%</strong></span>
                    {st.previousAverage !== null && (
                      <span>
                        Previous Term: <strong>{st.previousAverage}%</strong>{' '}
                        <span className={st.delta && st.delta < 0 ? 'text-rose-700 font-semibold' : 'text-emerald-700'}>
                          ({st.delta && st.delta > 0 ? `+${st.delta}` : st.delta}%)
                        </span>
                      </span>
                    )}
                    <StatusText status={st.supportPriority} />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setNoteTarget(st);
                    setNoteForm({ riskLevel: st.supportPriority, note: '', actionPlan: st.suggestions[0] || '' });
                  }}
                  className="px-3 py-1.5 text-xs font-semibold bg-[#0F2547] text-white rounded-md inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Log Support Note</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100 text-xs">
                <div>
                  <div className="font-semibold text-slate-700 mb-1">Academic Evidence</div>
                  <ul className="list-disc pl-4 space-y-1 text-slate-600">
                    {st.indicators.map((ind, i) => <li key={i}>{ind}</li>)}
                  </ul>
                </div>
                <div>
                  <div className="font-semibold text-slate-700 mb-1">Recommended Support Actions</div>
                  <ul className="list-disc pl-4 space-y-1 text-slate-600">
                    {st.suggestions.map((sug, i) => <li key={i}>{sug}</li>)}
                  </ul>
                </div>
              </div>

              {st.interventionNotes.length > 0 && (
                <div className="pt-2 border-t border-slate-100 space-y-1.5 text-xs">
                  <div className="font-semibold text-slate-700">Recorded Teacher Interventions</div>
                  {st.interventionNotes.map((n) => (
                    <div key={n.id} className="bg-slate-50 border border-slate-200 rounded p-2.5">
                      <div className="text-slate-900">{n.note}</div>
                      {n.action_plan && <div className="text-slate-600 mt-0.5">Plan: {n.action_plan}</div>}
                      <div className="text-[11px] text-slate-400 mt-1">{n.author_name} · {n.created_at}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {noteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/50" onClick={() => setNoteTarget(null)} />
          <form onSubmit={saveIntervention} className="relative z-10 w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-xl p-6 space-y-3 text-xs">
            <h2 className="text-base font-bold text-[#0F2547]">Log Intervention Note — {noteTarget.fullName}</h2>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Support Priority</label>
              <select value={noteForm.riskLevel} onChange={(e) => setNoteForm({ ...noteForm, riskLevel: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white">
                <option value="MONITOR">Monitor</option>
                <option value="MODERATE">Moderate Support</option>
                <option value="HIGH">High Priority Support</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Observation &amp; Consultation Note*</label>
              <textarea required rows={3} value={noteForm.note} onChange={(e) => setNoteForm({ ...noteForm, note: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-md" />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Action Plan</label>
              <textarea rows={2} value={noteForm.actionPlan} onChange={(e) => setNoteForm({ ...noteForm, actionPlan: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-md" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setNoteTarget(null)} className="px-4 py-2 border border-slate-200 rounded-md">Cancel</button>
              <button type="submit" className="px-4 py-2 bg-[#0F2547] text-white font-semibold rounded-md">Save Note</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
