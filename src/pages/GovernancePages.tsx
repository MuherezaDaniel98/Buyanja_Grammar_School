import { Bell, CheckCheck, Database, Download, KeyRound, Plus, Save, Send, Shield, Upload } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FeedbackBanner, PageHeader, StatusText, TableSkeleton } from '../components/UiPrimitives';
import { ROLE_LABELS, useAuth } from '../context/AuthContext';
import { api, downloadProtectedFile } from '../lib/api';

export function NotificationsPage() {
  const { hasPermission } = useAuth();
  const canBroadcast = hasPermission('notifications.manage');
  const [notifs, setNotifs] = useState<Array<{ id: number; title: string; message: string; category: string; link: string | null; is_read: number; created_at: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ title: '', message: '', targetRole: 'ALL', sendEmail: false });
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadNotifs = () => {
    setLoading(true);
    api.get('/admin/notifications').then((res) => setNotifs(res.data.notifications || [])).finally(() => setLoading(false));
  };

  useEffect(() => {
    loadNotifs();
  }, []);

  const markAllRead = async () => {
    await api.post('/admin/notifications/read', {});
    loadNotifs();
  };

  const broadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post('/admin/notifications/broadcast', form);
      setFeedback({ type: 'success', message: `Sent announcement to ${res.data.recipientCount} user(s).` });
      setForm({ title: '', message: '', targetRole: 'ALL', sendEmail: false });
      loadNotifs();
    } catch {
      setFeedback({ type: 'error', message: 'Failed to broadcast announcement.' });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notification Centre"
        subtitle="Marks submission alerts, verification requests, returned submissions, and school announcements."
        actions={
          <button type="button" onClick={markAllRead} className="px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-md hover:bg-slate-50 inline-flex items-center gap-1.5">
            <CheckCheck className="w-3.5 h-3.5" />
            <span>Mark All Read</span>
          </button>
        }
      />

      {feedback && <FeedbackBanner type={feedback.type} message={feedback.message} onClose={() => setFeedback(null)} />}

      {canBroadcast && (
        <form onSubmit={broadcast} className="bg-white border border-slate-200 rounded-lg p-5 space-y-3 text-xs">
          <h3 className="text-sm font-bold text-[#0F2547]">Broadcast Academic Announcement</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input required placeholder="Announcement Title*" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="sm:col-span-2 px-3 py-2 border border-slate-200 rounded-md" />
            <select value={form.targetRole} onChange={(e) => setForm({ ...form, targetRole: e.target.value })} className="px-3 py-2 border border-slate-200 rounded-md bg-white">
              <option value="ALL">All Staff Users</option>
              <option value="SUBJECT_TEACHER">Subject Teachers</option>
              <option value="CLASS_TEACHER">Class Teachers</option>
              <option value="DOS">Director of Studies</option>
              <option value="HEAD_TEACHER">Head Teacher</option>
            </select>
          </div>
          <textarea required rows={2} placeholder="Announcement message..." value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-md" />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.sendEmail} onChange={(e) => setForm({ ...form, sendEmail: e.target.checked })} />
              <span>Also send via SMTP email (when configured)</span>
            </label>
            <button type="submit" className="px-4 py-2 bg-[#0F2547] text-white font-semibold rounded-md inline-flex items-center gap-1.5">
              <Send className="w-3.5 h-3.5" />
              <span>Send Announcement</span>
            </button>
          </div>
        </form>
      )}

      {loading ? <TableSkeleton rows={5} cols={3} /> : (
        <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
          {notifs.map((n) => (
            <div key={n.id} className={`p-4 flex items-start justify-between gap-4 ${n.is_read ? 'opacity-75' : 'bg-blue-50/30'}`}>
              <div className="flex items-start gap-3">
                <Bell className="w-4 h-4 text-[#1D4ED8] mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-[#0F2547]">{n.title}</div>
                  <p className="text-xs text-slate-600 mt-0.5">{n.message}</p>
                  <div className="text-[11px] font-mono text-slate-400 mt-1">{n.category} · {n.created_at}</div>
                </div>
              </div>
              {n.link && (
                <Link to={n.link} className="text-xs font-semibold text-[#1D4ED8] hover:underline shrink-0">
                  Open
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AuditLogsPage() {
  const [logs, setLogs] = useState<Array<{ id: number; user_name: string | null; user_role: string | null; action: string; entity_type: string; entity_id: string | null; reason: string | null; ip_address: string | null; created_at: string }>>([]);
  const [loginAttempts, setLoginAttempts] = useState<Array<{ id: number; email: string; success: number; ip_address: string | null; failure_reason: string | null; created_at: string }>>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get('/admin/audit-logs', { params: search ? { search } : {} })
      .then((res) => {
        setLogs(res.data.logs || []);
        setLoginAttempts(res.data.loginAttempts || []);
      })
      .finally(() => setLoading(false));
  }, [search]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Immutable Security & Audit Logs"
        subtitle="Tamper-resistant record of authentication events, marks changes, approvals, and configuration updates."
        actions={
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by user, action, or reason..."
            className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md w-64"
          />
        }
      />

      {loading ? <TableSkeleton rows={8} cols={5} /> : (
        <>
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#0F2547]" />
              <h3 className="text-sm font-bold text-[#0F2547]">System Audit Trail (Read-Only)</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-2.5 px-4">Timestamp</th>
                    <th className="py-2.5 px-4">User &amp; Role</th>
                    <th className="py-2.5 px-4">Action</th>
                    <th className="py-2.5 px-4">Affected Record</th>
                    <th className="py-2.5 px-4">Reason / Context</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((l) => (
                    <tr key={l.id}>
                      <td className="py-2.5 px-4 font-mono text-slate-500 whitespace-nowrap">{l.created_at}</td>
                      <td className="py-2.5 px-4 font-medium">{l.user_name || 'System'} <span className="text-slate-400">({l.user_role || '—'})</span></td>
                      <td className="py-2.5 px-4 font-mono font-semibold text-[#0F2547]">{l.action}</td>
                      <td className="py-2.5 px-4 font-mono text-slate-600">{l.entity_type} {l.entity_id ? `#${l.entity_id}` : ''}</td>
                      <td className="py-2.5 px-4 text-slate-600">{l.reason || l.ip_address || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200">
              <h3 className="text-sm font-bold text-[#0F2547]">Recent Login Attempt Monitor</h3>
            </div>
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="py-2 px-4">Timestamp</th>
                  <th className="py-2 px-4">Email</th>
                  <th className="py-2 px-4">Outcome</th>
                  <th className="py-2 px-4">IP / Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loginAttempts.map((la) => (
                  <tr key={la.id}>
                    <td className="py-2 px-4 font-mono text-slate-500">{la.created_at}</td>
                    <td className="py-2 px-4">{la.email}</td>
                    <td className="py-2 px-4"><StatusText status={la.success ? 'ACTIVE' : 'INVALID'} /></td>
                    <td className="py-2 px-4 font-mono text-slate-500">{la.failure_reason || la.ip_address || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export function UsersRolesPage() {
  const [users, setUsers] = useState<Array<{ id: number; full_name: string; email: string; phone: string | null; is_active: number; role_codes: string; role_names: string; last_login_at: string | null }>>([]);
  const [roles, setRoles] = useState<Array<{ id: number; code: string; name: string; description: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', roleCode: 'SUBJECT_TEACHER', password: '' });
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadData = () => {
    setLoading(true);
    api.get('/admin/users').then((res) => {
      setUsers(res.data.users || []);
      setRoles(res.data.roles || []);
    }).finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/admin/users', form);
      setFeedback({ type: 'success', message: `User account ${form.email} created.` });
      setForm({ fullName: '', email: '', phone: '', roleCode: 'SUBJECT_TEACHER', password: '' });
      loadData();
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed.' });
    }
  };

  const toggleActive = async (u: (typeof users)[0]) => {
    try {
      await api.put(`/admin/users/${u.id}`, { isActive: u.is_active === 0 });
      loadData();
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Update failed.' });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="User & Role Management" subtitle="Create staff accounts, assign RBAC roles, and activate or deactivate access." />
      {feedback && <FeedbackBanner type={feedback.type} message={feedback.message} onClose={() => setFeedback(null)} />}

      <form onSubmit={createUser} className="bg-white border border-slate-200 rounded-lg p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end text-xs">
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Full Name*</label>
          <input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-md" />
        </div>
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Email*</label>
          <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-md" />
        </div>
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Role*</label>
          <select value={form.roleCode} onChange={(e) => setForm({ ...form, roleCode: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white">
            {roles.map((r) => <option key={r.id} value={r.code}>{r.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Initial Password (8+)*</label>
          <input type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-md" />
        </div>
        <button type="submit" className="px-4 py-2 bg-[#0F2547] text-white font-semibold rounded-md inline-flex items-center justify-center gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          <span>Create Account</span>
        </button>
      </form>

      {loading ? <TableSkeleton rows={6} cols={5} /> : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-3 px-4">Full Name</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Assigned Role</th>
                <th className="py-3 px-4">Last Login</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="py-3 px-4 font-semibold text-slate-900">{u.full_name}</td>
                  <td className="py-3 px-4 text-slate-600">{u.email}</td>
                  <td className="py-3 px-4">{u.role_names}</td>
                  <td className="py-3 px-4 font-mono text-slate-500">{u.last_login_at || 'Never'}</td>
                  <td className="py-3 px-4"><StatusText status={u.is_active ? 'ACTIVE' : 'INACTIVE'} /></td>
                  <td className="py-3 px-4 text-right">
                    <button type="button" onClick={() => toggleActive(u)} className="text-[#1D4ED8] font-semibold hover:underline">
                      {u.is_active ? 'Deactivate' : 'Activate'}
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

export function SystemSettingsPage() {
  const { refreshProfile } = useAuth();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [backups, setBackups] = useState<Array<{ id: number; filename: string; file_size: number; created_by_name: string | null; created_at: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [sRes, bRes] = await Promise.all([api.get('/admin/settings'), api.get('/admin/backups')]);
      setSettings(sRes.data.settings || {});
      setBackups(bRes.data.backups || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.put('/admin/settings', { settings });
      await refreshProfile();
      setFeedback({ type: 'success', message: 'Institutional settings and report card preferences saved.' });
    } catch {
      setFeedback({ type: 'error', message: 'Failed to save settings.' });
    }
  };

  const uploadLogo = async (file: File) => {
    const fd = new FormData();
    fd.append('logo', file);
    const res = await api.post('/admin/settings/logo', fd);
    setSettings((s) => ({ ...s, school_logo_url: res.data.logoUrl }));
    await refreshProfile();
    setFeedback({ type: 'success', message: 'School logo uploaded and applied to report cards.' });
  };

  const createBackup = async () => {
    const res = await api.post('/admin/backups/create');
    setFeedback({ type: 'success', message: `Database snapshot created: ${res.data.filename}` });
    loadAll();
  };

  if (loading) return <TableSkeleton rows={8} cols={3} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Settings & Database Backups"
        subtitle="Configure Buyanja Grammar School identity, report card layout options, thresholds, and backups."
      />

      {feedback && <FeedbackBanner type={feedback.type} message={feedback.message} onClose={() => setFeedback(null)} />}

      <form onSubmit={saveSettings} className="bg-white border border-slate-200 rounded-lg p-6 space-y-5 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div className="flex items-center gap-4">
            <img
              src={settings.school_logo_url || '/assets/aistudio/Bgs_logo_6081ecf0.png'}
              alt="School Crest"
              referrerPolicy="no-referrer"
              className="w-14 h-14 rounded-lg border border-slate-200 object-contain p-1 bg-white"
            />
            <div>
              <div className="text-sm font-bold text-[#0F2547]">Official School Crest &amp; Identity</div>
              <p className="text-slate-500">Appears on navigation headers and official A4 PDF report cards.</p>
            </div>
          </div>
          <label className="cursor-pointer px-3 py-2 border border-slate-200 rounded-md hover:bg-slate-50 inline-flex items-center gap-1.5 font-medium">
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Custom Logo</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); }} />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">School Name</label>
            <input value={settings.school_name || ''} onChange={(e) => setSettings({ ...settings, school_name: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-md" />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">School Motto</label>
            <input value={settings.school_motto || ''} onChange={(e) => setSettings({ ...settings, school_motto: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-md" />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Postal &amp; Physical Address</label>
            <input value={settings.school_address || ''} onChange={(e) => setSettings({ ...settings, school_address: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-md" />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Contact Phone Numbers</label>
            <input value={settings.school_phone || ''} onChange={(e) => setSettings({ ...settings, school_phone: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-md" />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Official Academic Email</label>
            <input value={settings.school_email || ''} onChange={(e) => setSettings({ ...settings, school_email: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-md" />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Report Card Document Heading</label>
            <input value={settings.report_document_title || ''} onChange={(e) => setSettings({ ...settings, report_document_title: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-md" />
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={settings.show_class_position_on_report !== 'false'} onChange={(e) => setSettings({ ...settings, show_class_position_on_report: String(e.target.checked) })} />
            <span>Show Class Position on Report</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={settings.show_attendance_on_report !== 'false'} onChange={(e) => setSettings({ ...settings, show_attendance_on_report: String(e.target.checked) })} />
            <span>Show Attendance Summary</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={settings.show_subject_teacher_initials !== 'false'} onChange={(e) => setSettings({ ...settings, show_subject_teacher_initials: String(e.target.checked) })} />
            <span>Show Subject Teacher Initials</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={settings.show_student_photo_on_report === 'true'} onChange={(e) => setSettings({ ...settings, show_student_photo_on_report: String(e.target.checked) })} />
            <span>Include Student Photo on Report</span>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Next Term Announcement</label>
            <textarea rows={2} value={settings.next_term_announcement || ''} onChange={(e) => setSettings({ ...settings, next_term_announcement: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-md" />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Official Footer Notice</label>
            <textarea rows={2} value={settings.report_footer_notice || ''} onChange={(e) => setSettings({ ...settings, report_footer_notice: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-md" />
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" className="px-4 py-2 bg-[#0F2547] text-white font-semibold rounded-md inline-flex items-center gap-1.5">
            <Save className="w-3.5 h-3.5" />
            <span>Save System Configuration</span>
          </button>
        </div>
      </form>

      {/* Database Backups */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-[#0F2547]" />
            <h3 className="text-sm font-bold text-[#0F2547]">Database Backups &amp; Recovery Snapshots</h3>
          </div>
          <button type="button" onClick={createBackup} className="px-3.5 py-1.5 bg-[#1D4ED8] text-white text-xs font-semibold rounded-md">
            Create Snapshot Now
          </button>
        </div>
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
            <tr>
              <th className="py-2.5 px-4">Snapshot Filename</th>
              <th className="py-2.5 px-4 text-right">Size (KB)</th>
              <th className="py-2.5 px-4">Created By</th>
              <th className="py-2.5 px-4">Timestamp</th>
              <th className="py-2.5 px-4 text-right">Download</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {backups.length === 0 ? (
              <tr><td colSpan={5} className="py-6 text-center text-slate-500">No backup snapshots created yet.</td></tr>
            ) : (
              backups.map((b) => (
                <tr key={b.id}>
                  <td className="py-2.5 px-4 font-mono font-medium">{b.filename}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums">{(b.file_size / 1024).toFixed(1)} KB</td>
                  <td className="py-2.5 px-4">{b.created_by_name || 'System'}</td>
                  <td className="py-2.5 px-4 font-mono text-slate-500">{b.created_at}</td>
                  <td className="py-2.5 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => downloadProtectedFile(`/admin/backups/${b.id}/download`, b.filename)}
                      className="text-[#1D4ED8] font-semibold hover:underline inline-flex items-center gap-1"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ProfilePage() {
  const { user, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [phone, setPhone] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    api.get('/auth/me').then((res) => {
      if (res.data.profile) {
        setFullName(res.data.profile.full_name || '');
        setPhone(res.data.profile.phone || '');
      }
    });
  }, []);

  const updateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.put('/auth/profile', { fullName, phone });
    await refreshProfile();
    setFeedback({ type: 'success', message: 'Profile updated.' });
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setFeedback({ type: 'success', message: 'Password updated securely.' });
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed.' });
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader title="My Profile & Security" subtitle={`${user?.email} · ${ROLE_LABELS[user?.primaryRole || ''] || user?.primaryRole}`} />
      {feedback && <FeedbackBanner type={feedback.type} message={feedback.message} onClose={() => setFeedback(null)} />}

      <form onSubmit={updateProfile} className="bg-white border border-slate-200 rounded-lg p-6 space-y-4 text-xs">
        <h3 className="text-sm font-bold text-[#0F2547]">Account Profile</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Full Name</label>
            <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md" />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Phone Number</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md" />
          </div>
        </div>
        <button type="submit" className="px-4 py-2 bg-[#0F2547] text-white font-semibold rounded-md">Save Profile</button>
      </form>

      <form onSubmit={changePassword} className="bg-white border border-slate-200 rounded-lg p-6 space-y-4 text-xs">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-[#0F2547]" />
          <h3 className="text-sm font-bold text-[#0F2547]">Change Password</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Current Password</label>
            <input type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md" />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">New Password (8+ chars)</label>
            <input type="password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md" />
          </div>
        </div>
        <button type="submit" className="px-4 py-2 bg-[#1D4ED8] text-white font-semibold rounded-md">Update Password</button>
      </form>
    </div>
  );
}
