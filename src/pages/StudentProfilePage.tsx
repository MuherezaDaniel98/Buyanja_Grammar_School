import { ArrowLeft, Camera, Download, FileText, Save } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { FeedbackBanner, PageHeader, StatusText, TableSkeleton } from '../components/UiPrimitives';
import { useAuth } from '../context/AuthContext';
import { api, downloadProtectedFile } from '../lib/api';

interface ProfileResponse {
  student: {
    id: number;
    admission_number: string;
    first_name: string;
    last_name: string;
    other_names: string | null;
    gender: 'M' | 'F';
    date_of_birth: string | null;
    admission_date: string;
    photo_url: string | null;
    status: 'ACTIVE' | 'TRANSFERRED' | 'WITHDRAWN' | 'GRADUATED';
    withdrawal_reason: string | null;
  };
  guardians: Array<{
    id: number;
    full_name: string;
    relationship: string;
    phone: string;
    email: string | null;
    address: string | null;
  }>;
  enrolments: Array<{
    id: number;
    year_label: string;
    term_name: string;
    class_name: string;
    class_code: string;
    stream_name: string;
    roll_number: string | null;
    status: string;
  }>;
  examSummaries: Array<{
    id: number;
    examination_id: number;
    exam_name: string;
    year_label: string;
    term_name: string;
    class_code: string;
    total_marks: number;
    average_score: number;
    overall_grade: string | null;
    aggregate_points: number | null;
    class_position: number | null;
    class_size: number | null;
    performance_descriptor: string | null;
  }>;
  subjectResults: Array<{
    id: number;
    examination_id: number;
    exam_name: string;
    subject_code: string;
    subject_name: string;
    weighted_total: number | null;
    grade: string | null;
    descriptor: string | null;
  }>;
  attendance: Array<{
    id: number;
    year_label: string;
    term_name: string;
    total_days: number;
    days_present: number;
    days_absent: number;
  }>;
  reportCards: Array<{
    id: number;
    report_ref: string;
    examination_id: number;
    exam_name: string;
    year_label: string;
    term_name: string;
    generated_at: string;
  }>;
}

const TABS = [
  'Personal Information',
  'Academic Information',
  'Examination Results',
  'Performance History',
  'Attendance',
  'Documents',
] as const;

export function StudentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('students.manage');

  const [data, setData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>('Personal Information');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [editForm, setEditForm] = useState({
    firstName: '',
    lastName: '',
    otherNames: '',
    gender: 'F' as 'M' | 'F',
    dateOfBirth: '',
    status: 'ACTIVE' as 'ACTIVE' | 'TRANSFERRED' | 'WITHDRAWN' | 'GRADUATED',
    withdrawalReason: '',
    guardianName: '',
    guardianRelationship: '',
    guardianPhone: '',
    guardianAddress: '',
  });

  const loadProfile = () => {
    if (!id) return;
    setLoading(true);
    api
      .get(`/students/${id}`)
      .then((res) => {
        setData(res.data);
        const s = res.data.student;
        const g = res.data.guardians?.[0];
        setEditForm({
          firstName: s.first_name || '',
          lastName: s.last_name || '',
          otherNames: s.other_names || '',
          gender: s.gender || 'F',
          dateOfBirth: s.date_of_birth || '',
          status: s.status || 'ACTIVE',
          withdrawalReason: s.withdrawal_reason || '',
          guardianName: g?.full_name || '',
          guardianRelationship: g?.relationship || 'Parent',
          guardianPhone: g?.phone || '',
          guardianAddress: g?.address || '',
        });
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadProfile();
  }, [id]);

  const handleSavePersonal = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.put(`/students/${id}`, editForm);
      setFeedback({ type: 'success', message: 'Student profile updated successfully.' });
      loadProfile();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Update failed.';
      setFeedback({ type: 'error', message: msg });
    }
  };

  const handlePhotoUpload = async (file: File) => {
    const fd = new FormData();
    fd.append('photo', file);
    try {
      await api.post(`/students/${id}/photo`, fd);
      setFeedback({ type: 'success', message: 'Student photograph updated.' });
      loadProfile();
    } catch {
      setFeedback({ type: 'error', message: 'Failed to upload photo (max 2MB JPG/PNG).' });
    }
  };

  if (loading) {
    return <TableSkeleton rows={6} cols={4} />;
  }

  if (!data) {
    return (
      <div className="p-8 text-center text-sm text-slate-600">
        Student record not found.{' '}
        <Link to="/students" className="text-[#1D4ED8] underline">
          Return to Students
        </Link>
      </div>
    );
  }

  const { student, enrolments, examSummaries, subjectResults, attendance, reportCards } = data;
  const fullName = [student.first_name, student.other_names, student.last_name].filter(Boolean).join(' ');
  const trendData = [...examSummaries].reverse().map((e) => ({
    period: `${e.year_label} ${e.term_name}`,
    average: e.average_score,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Link to="/students" className="inline-flex items-center gap-1 hover:text-[#0F2547]">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Students Directory</span>
        </Link>
      </div>

      <PageHeader
        title={fullName}
        subtitle={`Admission No: ${student.admission_number} · Gender: ${student.gender === 'F' ? 'Female' : 'Male'} · Admitted: ${student.admission_date}`}
        actions={
          examSummaries[0] ? (
            <div className="flex items-center gap-2">
              <Link
                to={`/reports/preview/${student.id}?examinationId=${examSummaries[0].examination_id}`}
                className="px-3 py-2 text-xs font-medium bg-white border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Preview Latest Report</span>
              </Link>
              <button
                type="button"
                onClick={() =>
                  downloadProtectedFile(
                    `/reports/pdf/student/${student.id}?examinationId=${examSummaries[0].examination_id}`,
                    `BGS_Report_${student.last_name}.pdf`
                  )
                }
                className="px-3.5 py-2 text-xs font-semibold bg-[#0F2547] text-white rounded-md hover:bg-[#163361] inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download PDF Report</span>
              </button>
            </div>
          ) : undefined
        }
      />

      {feedback && <FeedbackBanner type={feedback.type} message={feedback.message} onClose={() => setFeedback(null)} />}

      {/* Tabs Navigation */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === tab ? 'bg-white text-[#0F2547] shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab 1: Personal Information */}
      {activeTab === 'Personal Information' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col items-center text-center space-y-4">
            <div className="w-28 h-28 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center text-2xl font-bold text-[#0F2547]">
              {student.photo_url ? (
                <img
                  src={student.photo_url}
                  alt={fullName}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                `${student.first_name.charAt(0)}${student.last_name.charAt(0)}`
              )}
            </div>
            <div>
              <div className="text-sm font-bold text-[#0F2547]">{fullName}</div>
              <div className="text-xs font-mono text-slate-500 mt-0.5">{student.admission_number}</div>
              <div className="mt-2">
                <StatusText status={student.status} />
              </div>
            </div>
            {canManage && (
              <label className="cursor-pointer px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-md hover:bg-slate-50 inline-flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5" />
                <span>Upload Student Photo</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handlePhotoUpload(f);
                  }}
                />
              </label>
            )}
          </div>

          <form
            onSubmit={handleSavePersonal}
            className="lg:col-span-2 bg-white border border-slate-200 rounded-lg p-6 space-y-4 text-xs"
          >
            <h3 className="text-sm font-bold text-[#0F2547]">Personal &amp; Guardian Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">First Name</label>
                <input
                  disabled={!canManage}
                  value={editForm.firstName}
                  onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Last Name</label>
                <input
                  disabled={!canManage}
                  value={editForm.lastName}
                  onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Other Names</label>
                <input
                  disabled={!canManage}
                  value={editForm.otherNames}
                  onChange={(e) => setEditForm({ ...editForm, otherNames: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md disabled:bg-slate-50"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Gender</label>
                <select
                  disabled={!canManage}
                  value={editForm.gender}
                  onChange={(e) => setEditForm({ ...editForm, gender: e.target.value as 'M' | 'F' })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white disabled:bg-slate-50"
                >
                  <option value="F">Female</option>
                  <option value="M">Male</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Date of Birth</label>
                <input
                  type="date"
                  disabled={!canManage}
                  value={editForm.dateOfBirth}
                  onChange={(e) => setEditForm({ ...editForm, dateOfBirth: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Enrolment Status</label>
                <select
                  disabled={!canManage}
                  value={editForm.status}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      status: e.target.value as 'ACTIVE' | 'TRANSFERRED' | 'WITHDRAWN' | 'GRADUATED',
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white disabled:bg-slate-50"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="TRANSFERRED">TRANSFERRED</option>
                  <option value="WITHDRAWN">WITHDRAWN</option>
                  <option value="GRADUATED">GRADUATED</option>
                </select>
              </div>
            </div>

            {(editForm.status === 'TRANSFERRED' || editForm.status === 'WITHDRAWN') && (
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Transfer / Withdrawal Reason</label>
                <input
                  disabled={!canManage}
                  value={editForm.withdrawalReason}
                  onChange={(e) => setEditForm({ ...editForm, withdrawalReason: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md"
                />
              </div>
            )}

            <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Guardian Full Name</label>
                <input
                  disabled={!canManage}
                  value={editForm.guardianName}
                  onChange={(e) => setEditForm({ ...editForm, guardianName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Guardian Phone</label>
                <input
                  disabled={!canManage}
                  value={editForm.guardianPhone}
                  onChange={(e) => setEditForm({ ...editForm, guardianPhone: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md disabled:bg-slate-50"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">Home Address</label>
                <input
                  disabled={!canManage}
                  value={editForm.guardianAddress}
                  onChange={(e) => setEditForm({ ...editForm, guardianAddress: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md disabled:bg-slate-50"
                />
              </div>
            </div>

            {canManage && (
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#0F2547] text-white font-semibold rounded-md hover:bg-[#163361] inline-flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Changes</span>
                </button>
              </div>
            )}
          </form>
        </div>
      )}

      {/* Tab 2: Academic Information */}
      {activeTab === 'Academic Information' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h3 className="text-sm font-bold text-[#0F2547]">Term-by-Term Enrolment History</h3>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-2.5 px-4">Academic Year</th>
                <th className="py-2.5 px-4">Term</th>
                <th className="py-2.5 px-4">Class</th>
                <th className="py-2.5 px-4">Stream</th>
                <th className="py-2.5 px-4">Roll No.</th>
                <th className="py-2.5 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {enrolments.map((en) => (
                <tr key={en.id}>
                  <td className="py-2.5 px-4 font-mono font-medium">{en.year_label}</td>
                  <td className="py-2.5 px-4">{en.term_name}</td>
                  <td className="py-2.5 px-4 font-semibold">{en.class_name} ({en.class_code})</td>
                  <td className="py-2.5 px-4">{en.stream_name}</td>
                  <td className="py-2.5 px-4 font-mono">{en.roll_number || '—'}</td>
                  <td className="py-2.5 px-4"><StatusText status={en.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 3: Examination Results */}
      {activeTab === 'Examination Results' && (
        <div className="space-y-6">
          {examSummaries.map((sum) => {
            const subRows = subjectResults.filter((r) => r.examination_id === sum.examination_id);
            return (
              <div key={sum.id} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
                  <div>
                    <h3 className="text-sm font-bold text-[#0F2547]">{sum.exam_name}</h3>
                    <p className="text-xs text-slate-500">
                      {sum.year_label} · {sum.term_name} · Class {sum.class_code}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-xs tabular-nums">
                    <div>
                      Average: <span className="font-bold text-[#0F2547]">{sum.average_score}%</span>
                    </div>
                    <div>
                      Grade: <span className="font-bold text-[#1D4ED8]">{sum.overall_grade || '—'}</span>
                    </div>
                    {sum.class_position && (
                      <div>
                        Rank: <span className="font-bold">{sum.class_position} / {sum.class_size}</span>
                      </div>
                    )}
                  </div>
                </div>
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="py-2.5 px-4">Code</th>
                      <th className="py-2.5 px-4">Subject</th>
                      <th className="py-2.5 px-4 text-right">Weighted Total %</th>
                      <th className="py-2.5 px-4 text-center">Grade</th>
                      <th className="py-2.5 px-4">Descriptor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {subRows.map((sr) => (
                      <tr key={sr.id}>
                        <td className="py-2 px-4 font-mono font-semibold text-[#0F2547]">{sr.subject_code}</td>
                        <td className="py-2 px-4">{sr.subject_name}</td>
                        <td className="py-2 px-4 text-right font-mono tabular-nums">
                          {sr.weighted_total !== null ? sr.weighted_total.toFixed(1) : '—'}
                        </td>
                        <td className="py-2 px-4 text-center font-bold text-[#1D4ED8]">{sr.grade || '—'}</td>
                        <td className="py-2 px-4 text-slate-600">{sr.descriptor || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab 4: Performance History */}
      {activeTab === 'Performance History' && (
        <div className="bg-white border border-slate-200 rounded-lg p-6">
          <h3 className="text-sm font-bold text-[#0F2547] mb-1">Term-to-Term Average Progression</h3>
          <p className="text-xs text-slate-500 mb-4">Historical weighted mean percentage across recorded examinations</p>
          <div className="h-72 min-w-0">
            <ResponsiveContainer width="100%" height={288} minWidth={0}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="average" name="Average %" stroke="#1D4ED8" strokeWidth={2.5} dot={{ r: 5, fill: '#0F2547' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Tab 5: Attendance */}
      {activeTab === 'Attendance' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-2.5 px-4">Academic Year</th>
                <th className="py-2.5 px-4">Term</th>
                <th className="py-2.5 px-4 text-right">School Days</th>
                <th className="py-2.5 px-4 text-right">Days Present</th>
                <th className="py-2.5 px-4 text-right">Days Absent</th>
                <th className="py-2.5 px-4 text-right">Attendance %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {attendance.map((a) => {
                const pct = a.total_days > 0 ? ((a.days_present / a.total_days) * 100).toFixed(1) : '0.0';
                return (
                  <tr key={a.id}>
                    <td className="py-2.5 px-4 font-mono">{a.year_label}</td>
                    <td className="py-2.5 px-4">{a.term_name}</td>
                    <td className="py-2.5 px-4 text-right">{a.total_days}</td>
                    <td className="py-2.5 px-4 text-right text-emerald-700 font-semibold">{a.days_present}</td>
                    <td className="py-2.5 px-4 text-right text-rose-700">{a.days_absent}</td>
                    <td className="py-2.5 px-4 text-right font-semibold">{pct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 6: Documents */}
      {activeTab === 'Documents' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h3 className="text-sm font-bold text-[#0F2547]">Generated Official Report Cards</h3>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-2.5 px-4">Report Reference</th>
                <th className="py-2.5 px-4">Examination</th>
                <th className="py-2.5 px-4">Generated</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reportCards.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-500">
                    No report cards generated yet. Use Preview Latest Report above to generate one.
                  </td>
                </tr>
              ) : (
                reportCards.map((rc) => (
                  <tr key={rc.id}>
                    <td className="py-2.5 px-4 font-mono font-medium text-[#0F2547]">{rc.report_ref}</td>
                    <td className="py-2.5 px-4">{rc.exam_name} ({rc.year_label} {rc.term_name})</td>
                    <td className="py-2.5 px-4 font-mono text-slate-500">{rc.generated_at}</td>
                    <td className="py-2.5 px-4 text-right space-x-3">
                      <Link
                        to={`/reports/preview/${student.id}?examinationId=${rc.examination_id}`}
                        className="text-[#1D4ED8] font-semibold hover:underline"
                      >
                        Preview
                      </Link>
                      <button
                        type="button"
                        onClick={() =>
                          downloadProtectedFile(
                            `/reports/pdf/student/${student.id}?examinationId=${rc.examination_id}`,
                            `BGS_Report_${rc.report_ref}.pdf`
                          )
                        }
                        className="text-[#0F2547] font-semibold hover:underline"
                      >
                        Download PDF
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
