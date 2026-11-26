import { Plus, Users } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { FeedbackBanner, PageHeader, StatusText, TableSkeleton } from '../components/UiPrimitives';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

interface TeacherRow {
  id: number;
  staff_number: string;
  full_name: string;
  email: string;
  phone: string | null;
  initials: string;
  qualification: string | null;
  specialization: string | null;
  department: string | null;
  status: string;
  active_assignments: number;
}

export function TeachersPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('teachers.manage');

  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    initials: '',
    qualification: '',
    specialization: '',
    department: 'Sciences',
    roleCode: 'SUBJECT_TEACHER' as 'SUBJECT_TEACHER' | 'CLASS_TEACHER' | 'DOS',
  });

  const loadTeachers = () => {
    setLoading(true);
    api
      .get('/academics/teachers')
      .then((res) => setTeachers(res.data.teachers || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTeachers();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post('/academics/teachers', form);
      setFeedback({ type: 'success', message: `Registered teacher (${res.data.staffNumber}).` });
      setShowAdd(false);
      setForm({
        fullName: '',
        email: '',
        phone: '',
        initials: '',
        qualification: '',
        specialization: '',
        department: 'Sciences',
        roleCode: 'SUBJECT_TEACHER',
      });
      loadTeachers();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to register teacher.';
      setFeedback({ type: 'error', message: msg });
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Teaching Staff & Workload"
        subtitle="Manage teacher profiles, initials for report cards, academic departments, and active teaching loads."
        actions={
          canManage ? (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="px-3.5 py-2 text-xs font-semibold bg-[#0F2547] text-white rounded-md hover:bg-[#163361] inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Register Teacher</span>
            </button>
          ) : undefined
        }
      />

      {feedback && <FeedbackBanner type={feedback.type} message={feedback.message} onClose={() => setFeedback(null)} />}

      {loading ? (
        <TableSkeleton rows={6} cols={6} />
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="py-3 px-4">Staff No.</th>
                  <th className="py-3 px-4">Full Name</th>
                  <th className="py-3 px-4">Initials</th>
                  <th className="py-3 px-4">Department &amp; Specialization</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4 text-right">Active Assignments</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {teachers.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono font-medium text-[#0F2547]">{t.staff_number}</td>
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      <div>{t.full_name}</div>
                      <div className="text-[11px] font-normal text-slate-500">{t.qualification || ''}</div>
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-slate-700">{t.initials}</td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-800">{t.department}</div>
                      <div className="text-[11px] text-slate-500">{t.specialization}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      <div>{t.email}</div>
                      <div className="text-[11px] font-mono text-slate-400">{t.phone}</div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums">
                      {t.active_assignments}
                    </td>
                    <td className="py-3 px-4"><StatusText status={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/50" onClick={() => setShowAdd(false)} />
          <div className="relative z-10 w-full max-w-lg bg-white border border-slate-200 rounded-lg shadow-xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[#0F2547]" />
              <h2 className="text-base font-bold text-[#0F2547]">Register Teaching Staff</h2>
            </div>
            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Full Name*</label>
                  <input
                    required
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Report Card Initials*</label>
                  <input
                    required
                    placeholder="e.g. J.M."
                    value={form.initials}
                    onChange={(e) => setForm({ ...form, initials: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Email*</label>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Phone</label>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Department</label>
                  <input
                    value={form.department}
                    onChange={(e) => setForm({ ...form, department: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">System Role</label>
                  <select
                    value={form.roleCode}
                    onChange={(e) =>
                      setForm({ ...form, roleCode: e.target.value as 'SUBJECT_TEACHER' | 'CLASS_TEACHER' | 'DOS' })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
                  >
                    <option value="SUBJECT_TEACHER">Subject Teacher</option>
                    <option value="CLASS_TEACHER">Class Teacher</option>
                    <option value="DOS">Director of Studies</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Qualification</label>
                  <input
                    value={form.qualification}
                    onChange={(e) => setForm({ ...form, qualification: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Specialization</label>
                  <input
                    value={form.specialization}
                    onChange={(e) => setForm({ ...form, specialization: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md"
                  />
                </div>
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 border border-slate-200 rounded-md">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-[#0F2547] text-white font-semibold rounded-md">
                  Register Teacher
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
