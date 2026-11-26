import {
  ArrowRightLeft,
  Download,
  Eye,
  FileSpreadsheet,
  Plus,
  Search,
  Upload,
  UserPlus,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  EmptyState,
  FeedbackBanner,
  PageHeader,
  StatusText,
  TableSkeleton,
} from '../components/UiPrimitives';
import { useAuth } from '../context/AuthContext';
import { api, downloadProtectedFile } from '../lib/api';

interface StudentRow {
  id: number;
  admission_number: string;
  first_name: string;
  last_name: string;
  other_names: string | null;
  gender: 'M' | 'F';
  date_of_birth: string | null;
  admission_date: string;
  status: string;
  class_id: number | null;
  stream_id: number | null;
  class_code: string | null;
  class_name: string | null;
  stream_name: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
}

export function StudentsPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('students.manage');

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [nextAdm, setNextAdm] = useState('BGS/2026/0040');
  const [classes, setClasses] = useState<Array<{ id: number; name: string; code: string }>>([]);
  const [streams, setStreams] = useState<Array<{ id: number; class_id: number; name: string }>>([]);
  const [years, setYears] = useState<Array<{ id: number; year_label: string; is_active: number }>>([]);
  const [terms, setTerms] = useState<Array<{ id: number; academic_year_id: number; name: string; is_active: number }>>([]);

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterClassId, setFilterClassId] = useState('');
  const [filterStreamId, setFilterStreamId] = useState('');
  const [filterGender, setFilterGender] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modals
  const [showRegister, setShowRegister] = useState(false);
  const [showPromote, setShowPromote] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Register form state
  const [regForm, setRegForm] = useState({
    firstName: '',
    lastName: '',
    otherNames: '',
    gender: 'F' as 'M' | 'F',
    dateOfBirth: '',
    admissionDate: new Date().toISOString().slice(0, 10),
    classId: '',
    streamId: '',
    guardianName: '',
    guardianRelationship: 'Mother',
    guardianPhone: '',
    guardianAddress: '',
  });

  // Promote form state
  const [promoteForm, setPromoteForm] = useState({
    targetAcademicYearId: '',
    targetTermId: '',
    targetClassId: '',
    targetStreamId: '',
    actionType: 'PROMOTE' as 'PROMOTE' | 'TRANSFER_STREAM',
  });

  // Import state
  const [importPreview, setImportPreview] = useState<{
    totalRows: number;
    validCount: number;
    invalidCount: number;
    rows: Array<{
      rowNumber: number;
      firstName: string;
      lastName: string;
      gender: string;
      classCode: string;
      streamName: string;
      guardianName: string;
      guardianPhone: string;
      valid: boolean;
      errors: string[];
    }>;
  } | null>(null);

  const loadMeta = async () => {
    const [csRes, ytRes] = await Promise.all([
      api.get('/academics/classes-streams'),
      api.get('/academics/years-terms'),
    ]);
    const clsList = csRes.data.classes || [];
    const strList = csRes.data.streams || [];
    const yrList = ytRes.data.years || [];
    const trList = ytRes.data.terms || [];
    setClasses(clsList);
    setStreams(strList);
    setYears(yrList);
    setTerms(trList);

    if (clsList.length > 0 && !regForm.classId) {
      const firstCls = clsList[0].id;
      const firstStr = strList.find((s: { class_id: number }) => s.class_id === firstCls)?.id || '';
      setRegForm((f) => ({ ...f, classId: String(firstCls), streamId: String(firstStr) }));
    }
    const actYr = yrList.find((y: { is_active: number }) => y.is_active === 1);
    const actTr = trList.find((t: { is_active: number }) => t.is_active === 1);
    if (actYr && actTr) {
      setPromoteForm((p) => ({
        ...p,
        targetAcademicYearId: String(actYr.id),
        targetTermId: String(actTr.id),
      }));
    }
  };

  const loadStudents = async () => {
    setLoading(true);
    try {
      const res = await api.get('/students', {
        params: {
          ...(search ? { search } : {}),
          ...(filterClassId ? { classId: filterClassId } : {}),
          ...(filterStreamId ? { streamId: filterStreamId } : {}),
          ...(filterGender ? { gender: filterGender } : {}),
        },
      });
      setStudents(res.data.students || []);
      setNextAdm(res.data.nextAdmissionPreview || '');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMeta();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => loadStudents(), 180);
    return () => clearTimeout(t);
  }, [search, filterClassId, filterStreamId, filterGender]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post('/students', {
        ...regForm,
        classId: Number(regForm.classId),
        streamId: Number(regForm.streamId),
      });
      setFeedback({
        type: 'success',
        message: `Registered student with Admission Number ${res.data.admissionNumber}.`,
      });
      setShowRegister(false);
      setRegForm((f) => ({ ...f, firstName: '', lastName: '', otherNames: '', guardianName: '', guardianPhone: '' }));
      loadStudents();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Registration failed.';
      setFeedback({ type: 'error', message: msg });
    }
  };

  const handlePromote = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/students/promote', {
        studentIds: selectedIds,
        targetAcademicYearId: Number(promoteForm.targetAcademicYearId),
        targetTermId: Number(promoteForm.targetTermId),
        targetClassId: Number(promoteForm.targetClassId),
        targetStreamId: Number(promoteForm.targetStreamId),
        actionType: promoteForm.actionType,
      });
      setFeedback({
        type: 'success',
        message: `Updated enrolment for ${selectedIds.length} selected student(s).`,
      });
      setSelectedIds([]);
      setShowPromote(false);
      loadStudents();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Action failed.';
      setFeedback({ type: 'error', message: msg });
    }
  };

  const handleImportFile = async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await api.post('/students/import/preview', fd);
      setImportPreview(res.data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to parse spreadsheet.';
      setFeedback({ type: 'error', message: msg });
    }
  };

  const commitImport = async () => {
    if (!importPreview) return;
    try {
      const res = await api.post('/students/import/commit', { rows: importPreview.rows });
      setFeedback({
        type: 'success',
        message: `Successfully imported ${res.data.importedCount} student(s).`,
      });
      setImportPreview(null);
      setShowImport(false);
      loadStudents();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Import commit failed.';
      setFeedback({ type: 'error', message: msg });
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === students.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(students.map((s) => s.id));
    }
  };

  const availableRegStreams = streams.filter((s) => s.class_id === Number(regForm.classId));
  const availableFilterStreams = filterClassId
    ? streams.filter((s) => s.class_id === Number(filterClassId))
    : streams;
  const availablePromoteStreams = streams.filter((s) => s.class_id === Number(promoteForm.targetClassId));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Student Records Management"
        subtitle="Manage student registrations, guardians, class enrolments, promotions, and academic histories."
        actions={
          <>
            <button
              type="button"
              onClick={() => downloadProtectedFile('/students/export?format=xlsx', 'BGS_Students_Directory.xlsx')}
              className="px-3 py-2 text-xs font-medium bg-white border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Excel</span>
            </button>
            {canManage && (
              <>
                <button
                  type="button"
                  onClick={() => setShowImport(true)}
                  className="px-3 py-2 text-xs font-medium bg-white border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Import Excel/CSV</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowRegister(true)}
                  className="px-3.5 py-2 text-xs font-semibold bg-[#0F2547] hover:bg-[#163361] text-white rounded-md inline-flex items-center gap-1.5"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Register Student</span>
                </button>
              </>
            )}
          </>
        }
      />

      {feedback && (
        <FeedbackBanner type={feedback.type} message={feedback.message} onClose={() => setFeedback(null)} />
      )}

      {/* Search & Filters Toolbar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or admission number..."
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-[#1D4ED8]"
            />
          </div>
          <select
            value={filterClassId}
            onChange={(e) => {
              setFilterClassId(e.target.value);
              setFilterStreamId('');
            }}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-md bg-white text-slate-700"
          >
            <option value="">All Classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
          <select
            value={filterStreamId}
            onChange={(e) => setFilterStreamId(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-md bg-white text-slate-700"
          >
            <option value="">All Streams</option>
            {availableFilterStreams.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={filterGender}
            onChange={(e) => setFilterGender(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-md bg-white text-slate-700"
          >
            <option value="">All Genders</option>
            <option value="F">Female</option>
            <option value="M">Male</option>
          </select>
        </div>

        {canManage && selectedIds.length > 0 && (
          <button
            type="button"
            onClick={() => setShowPromote(true)}
            className="px-3 py-1.5 text-xs font-semibold bg-[#1D4ED8] text-white rounded-md inline-flex items-center gap-1.5 shrink-0"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>Promote / Transfer ({selectedIds.length})</span>
          </button>
        )}
      </div>

      {/* Students Data Table */}
      {loading ? (
        <TableSkeleton rows={8} cols={6} />
      ) : students.length === 0 ? (
        <EmptyState
          title="No students match your filters"
          description="Try clearing the search query or register a new learner to populate the directory."
          action={
            canManage ? (
              <button
                type="button"
                onClick={() => setShowRegister(true)}
                className="px-4 py-2 text-xs font-semibold bg-[#0F2547] text-white rounded-md"
              >
                Register First Student
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <tr>
                  {canManage && (
                    <th className="py-3 px-4 w-10">
                      <input
                        type="checkbox"
                        checked={selectedIds.length === students.length && students.length > 0}
                        onChange={toggleSelectAll}
                        aria-label="Select all students"
                      />
                    </th>
                  )}
                  <th className="py-3 px-4 font-semibold">Admission No.</th>
                  <th className="py-3 px-4 font-semibold">Student Name</th>
                  <th className="py-3 px-4 font-semibold">Gender</th>
                  <th className="py-3 px-4 font-semibold">Class &amp; Stream</th>
                  <th className="py-3 px-4 font-semibold">Guardian Contact</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Profile</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((st) => (
                  <tr key={st.id} className="hover:bg-slate-50/70">
                    {canManage && (
                      <td className="py-3 px-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(st.id)}
                          onChange={(e) =>
                            setSelectedIds((prev) =>
                              e.target.checked ? [...prev, st.id] : prev.filter((x) => x !== st.id)
                            )
                          }
                          aria-label={`Select ${st.first_name} ${st.last_name}`}
                        />
                      </td>
                    )}
                    <td className="py-3 px-4 font-mono font-medium text-[#0F2547] tabular-nums">
                      {st.admission_number}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {st.first_name} {st.other_names ? `${st.other_names} ` : ''}
                      {st.last_name}
                    </td>
                    <td className="py-3 px-4 text-slate-600">{st.gender === 'F' ? 'Female' : 'Male'}</td>
                    <td className="py-3 px-4 text-slate-700">
                      {st.class_code ? `${st.class_code} · ${st.stream_name}` : 'Unassigned'}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      <div>{st.guardian_name || '—'}</div>
                      <div className="text-[11px] font-mono text-slate-400">{st.guardian_phone || ''}</div>
                    </td>
                    <td className="py-3 px-4">
                      <StatusText status={st.status} />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link
                        to={`/students/${st.id}`}
                        className="inline-flex items-center gap-1 text-[#1D4ED8] font-semibold hover:underline"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 tabular-nums">
            Showing {students.length} student record(s)
          </div>
        </div>
      )}

      {/* Register Student Modal */}
      {showRegister && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/50" onClick={() => setShowRegister(false)} />
          <div className="relative z-10 w-full max-w-2xl bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-[#0F2547]">Register New Student</h2>
                <p className="text-xs text-slate-500">Auto-assigned Admission Number: <span className="font-mono font-semibold">{nextAdm}</span></p>
              </div>
              <button type="button" onClick={() => setShowRegister(false)} className="text-xs text-slate-500">
                Close
              </button>
            </div>
            <form onSubmit={handleRegister} className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">First Name*</label>
                  <input
                    required
                    value={regForm.firstName}
                    onChange={(e) => setRegForm({ ...regForm, firstName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Last Name*</label>
                  <input
                    required
                    value={regForm.lastName}
                    onChange={(e) => setRegForm({ ...regForm, lastName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Other Names</label>
                  <input
                    value={regForm.otherNames}
                    onChange={(e) => setRegForm({ ...regForm, otherNames: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Gender*</label>
                  <select
                    value={regForm.gender}
                    onChange={(e) => setRegForm({ ...regForm, gender: e.target.value as 'M' | 'F' })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
                  >
                    <option value="F">Female</option>
                    <option value="M">Male</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Date of Birth</label>
                  <input
                    type="date"
                    value={regForm.dateOfBirth}
                    onChange={(e) => setRegForm({ ...regForm, dateOfBirth: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Admission Date*</label>
                  <input
                    type="date"
                    required
                    value={regForm.admissionDate}
                    onChange={(e) => setRegForm({ ...regForm, admissionDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Assigned Class*</label>
                  <select
                    required
                    value={regForm.classId}
                    onChange={(e) => {
                      const cId = e.target.value;
                      const firstStr = streams.find((s) => s.class_id === Number(cId))?.id || '';
                      setRegForm({ ...regForm, classId: cId, streamId: String(firstStr) });
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Stream*</label>
                  <select
                    required
                    value={regForm.streamId}
                    onChange={(e) => setRegForm({ ...regForm, streamId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
                  >
                    {availableRegStreams.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200">
                <h3 className="font-bold text-[#0F2547] mb-3">Primary Parent / Guardian Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Guardian Full Name*</label>
                    <input
                      required
                      value={regForm.guardianName}
                      onChange={(e) => setRegForm({ ...regForm, guardianName: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Relationship*</label>
                    <input
                      required
                      value={regForm.guardianRelationship}
                      onChange={(e) => setRegForm({ ...regForm, guardianRelationship: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Phone Contact*</label>
                    <input
                      required
                      placeholder="+256 772 ..."
                      value={regForm.guardianPhone}
                      onChange={(e) => setRegForm({ ...regForm, guardianPhone: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-md"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRegister(false)}
                  className="px-4 py-2 border border-slate-200 rounded-md text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#0F2547] text-white font-semibold rounded-md hover:bg-[#163361] inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Save Student</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Promote / Transfer Modal */}
      {showPromote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/50" onClick={() => setShowPromote(false)} />
          <div className="relative z-10 w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-[#0F2547]">
              Promote or Transfer ({selectedIds.length} Students)
            </h2>
            <p className="text-xs text-slate-500">
              Historical academic results remain permanently linked to previous terms and classes.
            </p>
            <form onSubmit={handlePromote} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Action Type</label>
                <select
                  value={promoteForm.actionType}
                  onChange={(e) =>
                    setPromoteForm({ ...promoteForm, actionType: e.target.value as 'PROMOTE' | 'TRANSFER_STREAM' })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
                >
                  <option value="PROMOTE">Promote to New Class / Term</option>
                  <option value="TRANSFER_STREAM">Transfer Between Streams</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Target Year</label>
                  <select
                    required
                    value={promoteForm.targetAcademicYearId}
                    onChange={(e) => setPromoteForm({ ...promoteForm, targetAcademicYearId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
                  >
                    {years.map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.year_label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Target Term</label>
                  <select
                    required
                    value={promoteForm.targetTermId}
                    onChange={(e) => setPromoteForm({ ...promoteForm, targetTermId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
                  >
                    {terms
                      .filter((t) => t.academic_year_id === Number(promoteForm.targetAcademicYearId))
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Target Class</label>
                  <select
                    required
                    value={promoteForm.targetClassId}
                    onChange={(e) => {
                      const cId = e.target.value;
                      const firstStr = streams.find((s) => s.class_id === Number(cId))?.id || '';
                      setPromoteForm({ ...promoteForm, targetClassId: cId, targetStreamId: String(firstStr) });
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
                  >
                    <option value="">Select class</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Target Stream</label>
                  <select
                    required
                    value={promoteForm.targetStreamId}
                    onChange={(e) => setPromoteForm({ ...promoteForm, targetStreamId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
                  >
                    <option value="">Select stream</option>
                    {availablePromoteStreams.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPromote(false)}
                  className="px-4 py-2 border border-slate-200 rounded-md"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-[#1D4ED8] text-white font-semibold rounded-md">
                  Apply Enrolment Change
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Excel/CSV Import Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/50" onClick={() => setShowImport(false)} />
          <div className="relative z-10 w-full max-w-3xl bg-white border border-slate-200 rounded-lg shadow-xl p-6 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#0F2547]">Bulk Student Import (Excel / CSV)</h2>
              <button
                type="button"
                onClick={() =>
                  downloadProtectedFile('/students/import-template', 'BGS_Students_Import_Template.xlsx')
                }
                className="text-xs font-semibold text-[#1D4ED8] hover:underline inline-flex items-center gap-1"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Download Template</span>
              </button>
            </div>

            <div className="border border-dashed border-slate-300 rounded-lg p-5 text-center bg-slate-50">
              <input
                type="file"
                accept=".xlsx,.csv"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImportFile(file);
                }}
                className="text-xs"
              />
              <p className="text-xs text-slate-500 mt-2">
                Upload a populated .xlsx or .csv file. Rows will be validated before saving.
              </p>
            </div>

            {importPreview && (
              <div className="flex-1 overflow-y-auto space-y-3">
                <div className="text-xs font-medium text-slate-700">
                  Preview: {importPreview.totalRows} row(s) ·{' '}
                  <span className="text-emerald-700 font-semibold">{importPreview.validCount} valid</span> ·{' '}
                  <span className="text-rose-700 font-semibold">{importPreview.invalidCount} invalid</span>
                </div>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3">Row</th>
                        <th className="py-2 px-3">Name</th>
                        <th className="py-2 px-3">Class</th>
                        <th className="py-2 px-3">Guardian</th>
                        <th className="py-2 px-3">Validation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {importPreview.rows.map((r) => (
                        <tr key={r.rowNumber}>
                          <td className="py-2 px-3 font-mono">{r.rowNumber}</td>
                          <td className="py-2 px-3">
                            {r.firstName} {r.lastName} ({r.gender})
                          </td>
                          <td className="py-2 px-3">
                            {r.classCode} {r.streamName}
                          </td>
                          <td className="py-2 px-3">
                            {r.guardianName} ({r.guardianPhone})
                          </td>
                          <td className="py-2 px-3">
                            {r.valid ? (
                              <span className="text-emerald-700 font-semibold">Valid</span>
                            ) : (
                              <span className="text-rose-700">{r.errors.join('; ')}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowImport(false)}
                className="px-4 py-2 text-xs border border-slate-200 rounded-md"
              >
                Cancel
              </button>
              {importPreview && importPreview.validCount > 0 && (
                <button
                  type="button"
                  onClick={commitImport}
                  className="px-4 py-2 text-xs font-semibold bg-[#0F2547] text-white rounded-md"
                >
                  Commit {importPreview.validCount} Valid Students
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
