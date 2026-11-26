import { Plus, Trash2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { FeedbackBanner, PageHeader, StatusText, TableSkeleton } from '../components/UiPrimitives';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

export function ClassesPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('academics.manage');

  const [classes, setClasses] = useState<Array<{ id: number; name: string; code: string; level: string }>>([]);
  const [streams, setStreams] = useState<
    Array<{ id: number; class_id: number; class_name: string; class_code: string; name: string; student_count: number; class_teacher_name: string | null }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [newClass, setNewClass] = useState({ name: '', code: '', level: 'O-Level' });
  const [newStream, setNewStream] = useState({ classId: '', name: '' });
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadData = () => {
    setLoading(true);
    api
      .get('/academics/classes-streams')
      .then((res) => {
        setClasses(res.data.classes || []);
        setStreams(res.data.streams || []);
        if (res.data.classes?.length && !newStream.classId) {
          setNewStream((s) => ({ ...s, classId: String(res.data.classes[0].id) }));
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const addClass = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/academics/classes', { ...newClass, sortOrder: classes.length + 1 });
      setNewClass({ name: '', code: '', level: 'O-Level' });
      setFeedback({ type: 'success', message: 'Class created.' });
      loadData();
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed.' });
    }
  };

  const addStream = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/academics/streams', { classId: Number(newStream.classId), name: newStream.name });
      setNewStream((s) => ({ ...s, name: '' }));
      setFeedback({ type: 'success', message: 'Stream added.' });
      loadData();
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed.' });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Classes & Streams"
        subtitle="Configure school classes, academic streams, and inspect active stream enrolment and class teachers."
      />
      {feedback && <FeedbackBanner type={feedback.type} message={feedback.message} onClose={() => setFeedback(null)} />}

      {canManage && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <form onSubmit={addClass} className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-end gap-2 text-xs">
            <div className="flex-1 min-w-[130px]">
              <label className="block font-semibold text-slate-700 mb-1">Class Name</label>
              <input required placeholder="e.g. Senior Five" value={newClass.name} onChange={(e) => setNewClass({ ...newClass, name: e.target.value })} className="w-full px-3 py-1.5 border border-slate-200 rounded-md" />
            </div>
            <div className="w-24">
              <label className="block font-semibold text-slate-700 mb-1">Code</label>
              <input required placeholder="S.5" value={newClass.code} onChange={(e) => setNewClass({ ...newClass, code: e.target.value })} className="w-full px-3 py-1.5 border border-slate-200 rounded-md" />
            </div>
            <div className="w-28">
              <label className="block font-semibold text-slate-700 mb-1">Level</label>
              <select value={newClass.level} onChange={(e) => setNewClass({ ...newClass, level: e.target.value })} className="w-full px-2 py-1.5 border border-slate-200 rounded-md bg-white">
                <option value="O-Level">O-Level</option>
                <option value="A-Level">A-Level</option>
              </select>
            </div>
            <button type="submit" className="px-3 py-1.5 bg-[#0F2547] text-white font-semibold rounded-md inline-flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" />
              <span>Add Class</span>
            </button>
          </form>

          <form onSubmit={addStream} className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-end gap-2 text-xs">
            <div className="flex-1 min-w-[130px]">
              <label className="block font-semibold text-slate-700 mb-1">Class</label>
              <select value={newStream.classId} onChange={(e) => setNewStream({ ...newStream, classId: e.target.value })} className="w-full px-3 py-1.5 border border-slate-200 rounded-md bg-white">
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-[130px]">
              <label className="block font-semibold text-slate-700 mb-1">New Stream Name</label>
              <input required placeholder="e.g. East" value={newStream.name} onChange={(e) => setNewStream({ ...newStream, name: e.target.value })} className="w-full px-3 py-1.5 border border-slate-200 rounded-md" />
            </div>
            <button type="submit" className="px-3 py-1.5 bg-[#1D4ED8] text-white font-semibold rounded-md inline-flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" />
              <span>Add Stream</span>
            </button>
          </form>
        </div>
      )}

      {loading ? <TableSkeleton rows={6} cols={5} /> : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-3 px-4">Class</th>
                <th className="py-3 px-4">Stream</th>
                <th className="py-3 px-4">Assigned Class Teacher</th>
                <th className="py-3 px-4 text-right">Enrolled Students</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {streams.map((st) => (
                <tr key={st.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 font-semibold text-[#0F2547]">{st.class_name} ({st.class_code})</td>
                  <td className="py-3 px-4 font-medium">{st.name}</td>
                  <td className="py-3 px-4 text-slate-600">{st.class_teacher_name || 'Unassigned'}</td>
                  <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums">{st.student_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function SubjectsPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('academics.manage');

  const [subjects, setSubjects] = useState<Array<{ id: number; code: string; name: string; short_name: string; department: string; is_core: number; is_active: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ code: '', name: '', department: 'Sciences', isCore: true });
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadSubjects = () => {
    setLoading(true);
    api.get('/academics/subjects').then((res) => setSubjects(res.data.subjects || [])).finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSubjects();
  }, []);

  const createSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/academics/subjects', form);
      setForm({ code: '', name: '', department: 'Sciences', isCore: true });
      setFeedback({ type: 'success', message: 'Subject registered.' });
      loadSubjects();
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed.' });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Subjects Registry" subtitle="Maintain curriculum subjects, department groupings, and core/elective status." />
      {feedback && <FeedbackBanner type={feedback.type} message={feedback.message} onClose={() => setFeedback(null)} />}

      {canManage && (
        <form onSubmit={createSubject} className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-end gap-3 text-xs">
          <div className="w-28">
            <label className="block font-semibold text-slate-700 mb-1">Code*</label>
            <input required placeholder="LIT" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="w-full px-3 py-1.5 border border-slate-200 rounded-md font-mono uppercase" />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block font-semibold text-slate-700 mb-1">Subject Name*</label>
            <input required placeholder="Literature in English" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-1.5 border border-slate-200 rounded-md" />
          </div>
          <div className="w-40">
            <label className="block font-semibold text-slate-700 mb-1">Department</label>
            <input required value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className="w-full px-3 py-1.5 border border-slate-200 rounded-md" />
          </div>
          <label className="flex items-center gap-2 py-1.5">
            <input type="checkbox" checked={form.isCore} onChange={(e) => setForm({ ...form, isCore: e.target.checked })} />
            <span>Compulsory / Core</span>
          </label>
          <button type="submit" className="px-4 py-1.5 bg-[#0F2547] text-white font-semibold rounded-md inline-flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" />
            <span>Add Subject</span>
          </button>
        </form>
      )}

      {loading ? <TableSkeleton rows={6} cols={5} /> : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-3 px-4">Code</th>
                <th className="py-3 px-4">Subject Title</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4">Classification</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {subjects.map((sub) => (
                <tr key={sub.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 font-mono font-bold text-[#0F2547]">{sub.code}</td>
                  <td className="py-3 px-4 font-semibold text-slate-900">{sub.name}</td>
                  <td className="py-3 px-4 text-slate-600">{sub.department}</td>
                  <td className="py-3 px-4 text-slate-600">{sub.is_core ? 'Core Subject' : 'Elective'}</td>
                  <td className="py-3 px-4"><StatusText status={sub.is_active ? 'ACTIVE' : 'INACTIVE'} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function AllocationsPage() {
  const [allocations, setAllocations] = useState<
    Array<{ id: number; teacher_name: string; staff_number: string; class_code: string; stream_name: string; subject_code: string | null; subject_name: string | null; is_class_teacher: number; is_active: number }>
  >([]);
  const [teachers, setTeachers] = useState<Array<{ id: number; full_name: string }>>([]);
  const [classes, setClasses] = useState<Array<{ id: number; code: string; name: string }>>([]);
  const [streams, setStreams] = useState<Array<{ id: number; class_id: number; name: string }>>([]);
  const [subjects, setSubjects] = useState<Array<{ id: number; code: string; name: string }>>([]);
  const [activeYearId, setActiveYearId] = useState(0);
  const [activeTermId, setActiveTermId] = useState(0);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [form, setForm] = useState({
    teacherId: '',
    classId: '',
    streamId: '',
    subjectId: '',
    isClassTeacher: false,
  });

  const loadAll = async () => {
    setLoading(true);
    try {
      const [alRes, tRes, csRes, subRes, ytRes] = await Promise.all([
        api.get('/academics/allocations'),
        api.get('/academics/teachers'),
        api.get('/academics/classes-streams'),
        api.get('/academics/subjects'),
        api.get('/academics/years-terms'),
      ]);
      setAllocations(alRes.data.allocations || []);
      setTeachers(tRes.data.teachers || []);
      setClasses(csRes.data.classes || []);
      setStreams(csRes.data.streams || []);
      setSubjects(subRes.data.subjects || []);
      const yr = (ytRes.data.years || []).find((y: { is_active: number }) => y.is_active === 1);
      const tr = (ytRes.data.terms || []).find((t: { is_active: number }) => t.is_active === 1);
      if (yr) setActiveYearId(yr.id);
      if (tr) setActiveTermId(tr.id);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const assignTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/academics/allocations', {
        teacherId: Number(form.teacherId),
        academicYearId: activeYearId,
        termId: activeTermId,
        classId: Number(form.classId),
        streamId: Number(form.streamId),
        subjectId: form.subjectId ? Number(form.subjectId) : null,
        isClassTeacher: form.isClassTeacher,
      });
      setFeedback({ type: 'success', message: 'Teacher responsibility assigned.' });
      loadAll();
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to assign.' });
    }
  };

  const revoke = async (id: number) => {
    await api.delete(`/academics/allocations/${id}`);
    setFeedback({ type: 'success', message: 'Allocation revoked and archived.' });
    loadAll();
  };

  const filteredStreams = streams.filter((s) => s.class_id === Number(form.classId));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teacher Subject & Class Allocations"
        subtitle="Assign teachers to classes, streams, and subjects. Teachers can only enter marks for assigned responsibilities."
      />
      {feedback && <FeedbackBanner type={feedback.type} message={feedback.message} onClose={() => setFeedback(null)} />}

      <form onSubmit={assignTeacher} className="bg-white border border-slate-200 rounded-lg p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end text-xs">
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Teacher*</label>
          <select required value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white">
            <option value="">Select teacher</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </select>
        </div>
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Class*</label>
          <select
            required
            value={form.classId}
            onChange={(e) => {
              const cId = e.target.value;
              const firstStr = streams.find((s) => s.class_id === Number(cId))?.id || '';
              setForm({ ...form, classId: cId, streamId: String(firstStr) });
            }}
            className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
          >
            <option value="">Select class</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
          </select>
        </div>
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Stream*</label>
          <select required value={form.streamId} onChange={(e) => setForm({ ...form, streamId: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white">
            <option value="">Select stream</option>
            {filteredStreams.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Subject</label>
          <select value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white">
            <option value="">Class Teacher Only</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 py-2">
          <input type="checkbox" checked={form.isClassTeacher} onChange={(e) => setForm({ ...form, isClassTeacher: e.target.checked })} />
          <span>Class Teacher</span>
        </label>
        <button type="submit" className="px-4 py-2 bg-[#0F2547] text-white font-semibold rounded-md hover:bg-[#163361]">
          Assign Allocation
        </button>
      </form>

      {loading ? <TableSkeleton rows={6} cols={5} /> : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-3 px-4">Teacher</th>
                <th className="py-3 px-4">Class &amp; Stream</th>
                <th className="py-3 px-4">Subject</th>
                <th className="py-3 px-4">Responsibility</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {allocations.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 font-semibold text-slate-900">{a.teacher_name} <span className="font-mono text-slate-400">({a.staff_number})</span></td>
                  <td className="py-3 px-4">{a.class_code} · {a.stream_name}</td>
                  <td className="py-3 px-4">{a.subject_name ? `${a.subject_code} — ${a.subject_name}` : '—'}</td>
                  <td className="py-3 px-4">{a.is_class_teacher ? 'Class Teacher' : 'Subject Teacher'}</td>
                  <td className="py-3 px-4"><StatusText status={a.is_active ? 'ACTIVE' : 'INACTIVE'} /></td>
                  <td className="py-3 px-4 text-right">
                    {a.is_active === 1 && (
                      <button type="button" onClick={() => revoke(a.id)} className="text-rose-700 hover:underline inline-flex items-center gap-1">
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Revoke</span>
                      </button>
                    )}
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
