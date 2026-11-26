import {
  AlertTriangle,
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  FileSpreadsheet,
  GraduationCap,
  Layers,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { MetricCard, PageHeader, StatusText, TableSkeleton } from '../components/UiPrimitives';
import { ROLE_LABELS, useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

interface DashboardData {
  context: {
    academicYear: { id: number; year_label: string } | null;
    term: { id: number; name: string } | null;
    examination: { id: number; name: string; code: string } | null;
  };
  metrics: {
    totalStudents: number;
    maleStudents: number;
    femaleStudents: number;
    totalTeachers: number;
    totalClasses: number;
    totalStreams: number;
    totalSubjects: number;
    submissionPercentage: number;
    approvalPercentage: number;
    schoolAverage: number;
    attentionCount: number;
    submissionBreakdown: {
      total_slots: number;
      submitted_count: number;
      verified_count: number;
      approved_count: number;
      published_count: number;
      returned_count: number;
    };
  };
  charts: {
    enrolmentByClass: Array<{ className: string; total: number; male: number; female: number }>;
    genderDistribution: Array<{ name: string; value: number }>;
    performanceByClass: Array<{ className: string; average: number | null; assessed: number }>;
    performanceBySubject: Array<{ subjectCode: string; subjectName: string; average: number }>;
    gradeDistribution: Array<{ grade: string; count: number }>;
    termTrends: Array<{ period: string; average: number }>;
  };
  roleData: {
    teacherAllocations: Array<{
      id: number;
      class_id: number;
      class_code: string;
      stream_id: number;
      stream_name: string;
      subject_id: number;
      subject_code: string;
      subject_name: string;
      is_class_teacher: number;
      submission_status: string;
      dos_notes: string | null;
    }>;
    pendingQueue: Array<{
      id: number;
      status: string;
      class_code: string;
      stream_name: string;
      subject_code: string;
      subject_name: string;
      teacher_name: string | null;
      submitted_at: string | null;
    }>;
  };
}

const NAVY = '#0F2547';
const ROYAL = '#1D4ED8';
const GOLD = '#B48327';
const CHART_COLORS = [NAVY, ROYAL, GOLD, '#475569', '#0EA5E9'];

export function DashboardPage() {
  const { user, hasRole } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [years, setYears] = useState<Array<{ id: number; year_label: string; is_active: number }>>([]);
  const [terms, setTerms] = useState<Array<{ id: number; academic_year_id: number; name: string; is_active: number }>>([]);
  const [classes, setClasses] = useState<Array<{ id: number; code: string; name: string }>>([]);

  const [selectedYearId, setSelectedYearId] = useState<string>('');
  const [selectedTermId, setSelectedTermId] = useState<string>('');
  const [selectedClassId, setSelectedClassId] = useState<string>('');

  useEffect(() => {
    Promise.all([api.get('/academics/years-terms'), api.get('/academics/classes-streams')])
      .then(([ytRes, csRes]) => {
        setYears(ytRes.data.years || []);
        setTerms(ytRes.data.terms || []);
        setClasses(csRes.data.classes || []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    api
      .get('/dashboard/overview', {
        params: {
          ...(selectedYearId ? { academicYearId: selectedYearId } : {}),
          ...(selectedTermId ? { termId: selectedTermId } : {}),
          ...(selectedClassId ? { classId: selectedClassId } : {}),
        },
      })
      .then((res) => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedYearId, selectedTermId, selectedClassId]);

  const roleTitle = user ? `${ROLE_LABELS[user.primaryRole] || user.primaryRole} Dashboard` : 'Dashboard';
  const filteredTerms = selectedYearId
    ? terms.filter((t) => t.academic_year_id === Number(selectedYearId))
    : terms;

  return (
    <div className="space-y-6">
      <PageHeader
        title={roleTitle}
        subtitle={`Welcome back, ${user?.fullName || ''}. Live academic overview from Buyanja Grammar School database.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedYearId}
              onChange={(e) => {
                setSelectedYearId(e.target.value);
                setSelectedTermId('');
              }}
              className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-700"
              aria-label="Filter by academic year"
            >
              <option value="">Active Year ({data?.context.academicYear?.year_label || '2026'})</option>
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  Year {y.year_label}
                </option>
              ))}
            </select>

            <select
              value={selectedTermId}
              onChange={(e) => setSelectedTermId(e.target.value)}
              className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-700"
              aria-label="Filter by term"
            >
              <option value="">Active Term ({data?.context.term?.name || 'Term II'})</option>
              {filteredTerms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>

            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-700"
              aria-label="Filter by class"
            >
              <option value="">All Classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>
        }
      />

      {loading || !data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-28 bg-white border border-slate-200 rounded-lg animate-pulse" />
            ))}
          </div>
          <TableSkeleton rows={5} cols={4} />
        </div>
      ) : (
        <>
          {/* Primary Metric Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              label="Total Enrolled Students"
              value={data.metrics.totalStudents}
              context={`${data.metrics.maleStudents} Male · ${data.metrics.femaleStudents} Female`}
              icon={GraduationCap}
              tone="primary"
            />
            <MetricCard
              label="Teaching Staff"
              value={data.metrics.totalTeachers}
              context={`${data.metrics.totalClasses} Classes · ${data.metrics.totalStreams} Streams · ${data.metrics.totalSubjects} Subjects`}
              icon={Users}
            />
            <MetricCard
              label="Active Academic Period"
              value={`${data.context.academicYear?.year_label || '—'} · ${data.context.term?.name || '—'}`}
              context={data.context.examination?.name || 'No active examination'}
              icon={Calendar}
              tone="gold"
            />
            <MetricCard
              label="School Overall Average"
              value={`${data.metrics.schoolAverage}%`}
              context={`${data.metrics.attentionCount} learners flagged for support`}
              icon={TrendingUp}
              tone={data.metrics.attentionCount > 0 ? 'warning' : 'success'}
            />
            <MetricCard
              label="Marks Submission Progress"
              value={`${data.metrics.submissionPercentage}%`}
              context={`${data.metrics.submissionBreakdown.submitted_count || 0} of ${data.metrics.submissionBreakdown.total_slots || 0} subject sheets`}
              icon={ClipboardCheck}
              tone="primary"
            />
            <MetricCard
              label="Results Approval Progress"
              value={`${data.metrics.approvalPercentage}%`}
              context={`${data.metrics.submissionBreakdown.published_count || 0} published · ${data.metrics.submissionBreakdown.returned_count || 0} returned`}
              icon={CheckCircle2}
              tone="success"
            />
            <MetricCard
              label="Academic Structure"
              value={`${data.metrics.totalClasses} / ${data.metrics.totalStreams}`}
              context={`${data.metrics.totalSubjects} registered curriculum subjects`}
              icon={Layers}
            />
            <MetricCard
              label="Learners Needing Support"
              value={data.metrics.attentionCount}
              context="Below configured threshold (< 50%)"
              icon={AlertTriangle}
              tone="warning"
            />
          </div>

          {/* Role-Specific Operational Queue */}
          {(hasRole('SUBJECT_TEACHER', 'CLASS_TEACHER') && data.roleData.teacherAllocations.length > 0) && (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-[#0F2547]">My Assigned Subjects &amp; Classes</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Direct access to your marks entry sheets and submission status</p>
                </div>
                <Link
                  to="/marks/entry"
                  className="px-3 py-1.5 bg-[#1D4ED8] text-white text-xs font-semibold rounded-md hover:bg-[#2563EB]"
                >
                  Open Marks Entry
                </Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-4 font-semibold">Class &amp; Stream</th>
                      <th className="py-2.5 px-4 font-semibold">Subject</th>
                      <th className="py-2.5 px-4 font-semibold">Role</th>
                      <th className="py-2.5 px-4 font-semibold">Submission Status</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.roleData.teacherAllocations.map((alloc) => (
                      <tr key={alloc.id} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-4 font-medium text-slate-900">
                          {alloc.class_code} · {alloc.stream_name}
                        </td>
                        <td className="py-2.5 px-4 text-slate-700">
                          {alloc.subject_code} — {alloc.subject_name}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600">
                          {alloc.is_class_teacher ? 'Class & Subject Teacher' : 'Subject Teacher'}
                        </td>
                        <td className="py-2.5 px-4">
                          <StatusText status={alloc.submission_status} />
                          {alloc.dos_notes && alloc.submission_status === 'RETURNED' && (
                            <div className="text-[11px] text-amber-700 mt-0.5">{alloc.dos_notes}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <Link
                            to={`/marks/entry?classId=${alloc.class_id}&streamId=${alloc.stream_id}&subjectId=${alloc.subject_id}`}
                            className="inline-flex items-center gap-1 text-[#1D4ED8] font-semibold hover:underline"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                            <span>Enter Marks</span>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {hasRole('SYSTEM_ADMIN', 'DOS', 'HEAD_TEACHER') && data.roleData.pendingQueue.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-[#0F2547]">Verification &amp; Approval Pipeline</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Active subject submissions requiring DOS verification or Head Teacher approval</p>
                </div>
                <div className="flex items-center gap-2">
                  {hasRole('DOS', 'SYSTEM_ADMIN') && (
                    <Link
                      to="/results/verification"
                      className="px-3 py-1.5 border border-slate-200 text-slate-700 text-xs font-semibold rounded-md hover:bg-slate-50"
                    >
                      DOS Verification
                    </Link>
                  )}
                  {hasRole('HEAD_TEACHER', 'SYSTEM_ADMIN') && (
                    <Link
                      to="/results/approval"
                      className="px-3 py-1.5 bg-[#0F2547] text-white text-xs font-semibold rounded-md hover:bg-[#163361]"
                    >
                      Final Approval
                    </Link>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-4 font-semibold">Class / Stream</th>
                      <th className="py-2.5 px-4 font-semibold">Subject</th>
                      <th className="py-2.5 px-4 font-semibold">Submitted By</th>
                      <th className="py-2.5 px-4 font-semibold">Stage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.roleData.pendingQueue.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-4 font-medium text-slate-900">
                          {item.class_code} ({item.stream_name})
                        </td>
                        <td className="py-2.5 px-4 text-slate-700">
                          {item.subject_code} — {item.subject_name}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600">{item.teacher_name || 'Assigned Teacher'}</td>
                        <td className="py-2.5 px-4">
                          <StatusText status={item.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Analytics Visualisations Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Performance by Class */}
            <div className="bg-white border border-slate-200 rounded-lg p-5 min-w-0">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-[#0F2547]">Academic Performance by Class</h3>
                  <p className="text-xs text-slate-500">Mean weighted score (%) per class level</p>
                </div>
                <Award className="w-4 h-4 text-[#B48327]" />
              </div>
              <div className="h-64 min-w-0">
                <ResponsiveContainer width="100%" height={256} minWidth={0}>
                  <BarChart data={data.charts.performanceByClass}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="className" tick={{ fontSize: 12, fill: '#475569' }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#475569' }} />
                    <Tooltip />
                    <Bar dataKey="average" name="Class Average (%)" fill={NAVY} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Termly Performance Trend */}
            <div className="bg-white border border-slate-200 rounded-lg p-5 min-w-0">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-[#0F2547]">Termly Performance Trend</h3>
                  <p className="text-xs text-slate-500">Historical school average across examination terms</p>
                </div>
                <TrendingUp className="w-4 h-4 text-[#1D4ED8]" />
              </div>
              <div className="h-64 min-w-0">
                <ResponsiveContainer width="100%" height={256} minWidth={0}>
                  <LineChart data={data.charts.termTrends}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="period" tick={{ fontSize: 12, fill: '#475569' }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#475569' }} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="average"
                      name="Mean Score (%)"
                      stroke={ROYAL}
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: GOLD }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Performance by Subject */}
            <div className="bg-white border border-slate-200 rounded-lg p-5 min-w-0">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-[#0F2547]">Subject Performance Comparison</h3>
                  <p className="text-xs text-slate-500">Average weighted percentage by subject</p>
                </div>
                <BookOpen className="w-4 h-4 text-[#0F2547]" />
              </div>
              <div className="h-64 min-w-0">
                <ResponsiveContainer width="100%" height={256} minWidth={0}>
                  <BarChart data={data.charts.performanceBySubject}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="subjectCode" tick={{ fontSize: 11, fill: '#475569' }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#475569' }} />
                    <Tooltip />
                    <Bar dataKey="average" name="Subject Mean (%)" fill={ROYAL} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Enrolment & Gender + Grade Distribution */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0">
              <div className="bg-white border border-slate-200 rounded-lg p-5 min-w-0">
                <h3 className="text-sm font-bold text-[#0F2547] mb-1">Enrolment by Gender</h3>
                <p className="text-xs text-slate-500 mb-3">Active registered learners</p>
                <div className="h-52 min-w-0">
                  <ResponsiveContainer width="100%" height={208} minWidth={0}>
                    <PieChart>
                      <Pie
                        data={data.charts.genderDistribution}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={44}
                        outerRadius={72}
                        paddingAngle={3}
                      >
                        {data.charts.genderDistribution.map((_, idx) => (
                          <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-5 min-w-0">
                <h3 className="text-sm font-bold text-[#0F2547] mb-1">Grade Distribution</h3>
                <p className="text-xs text-slate-500 mb-3">All assessed subject entries</p>
                <div className="h-52 min-w-0">
                  <ResponsiveContainer width="100%" height={208} minWidth={0}>
                    <BarChart data={data.charts.gradeDistribution}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis dataKey="grade" tick={{ fontSize: 12, fill: '#475569' }} />
                      <YAxis tick={{ fontSize: 12, fill: '#475569' }} />
                      <Tooltip />
                      <Bar dataKey="count" name="Subject Grades" fill={GOLD} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
