import React, { useEffect, useState } from 'react';
import {
  Award,
  BarChart3,
  Bell,
  BookOpen,
  CalendarRange,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  ShieldAlert,
  TrendingUp,
  UserCheck,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ROLE_LABELS, useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

interface NavItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  perms?: string[];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Students', to: '/students', icon: GraduationCap, perms: ['students.view', 'students.manage'] },
  { label: 'Teachers', to: '/teachers', icon: Users, perms: ['teachers.view', 'teachers.manage'] },
  { label: 'Classes & Streams', to: '/classes', icon: Layers, perms: ['academics.view', 'academics.manage'] },
  { label: 'Subjects', to: '/subjects', icon: BookOpen, perms: ['academics.view', 'academics.manage'] },
  { label: 'Teacher Allocations', to: '/allocations', icon: UserCheck, perms: ['academics.manage'] },
  { label: 'Academic Years & Terms', to: '/academics/years-terms', icon: CalendarRange, perms: ['academics.manage'] },
  { label: 'Examinations & Grading', to: '/academics/examinations', icon: Award, perms: ['exams.configure'] },
  { label: 'Marks Entry', to: '/marks/entry', icon: FileSpreadsheet, perms: ['marks.enter'] },
  { label: 'Marks Submissions', to: '/marks/submissions', icon: ClipboardCheck, perms: ['marks.enter', 'marks.verify', 'results.approve'] },
  { label: 'Results Verification', to: '/results/verification', icon: CheckSquare, perms: ['marks.verify'] },
  { label: 'Results Approval', to: '/results/approval', icon: Award, perms: ['results.approve'] },
  { label: 'Published Results', to: '/results/published', icon: BookOpen, perms: ['results.view_published', 'comments.manage'] },
  { label: 'Report Cards & Exports', to: '/reports', icon: FileText, perms: ['reports.generate'] },
  { label: 'Academic Analytics', to: '/analytics', icon: BarChart3, perms: ['analytics.view'] },
  { label: 'Student Progress & Risk', to: '/student-progress', icon: TrendingUp, perms: ['analytics.view', 'comments.manage'] },
  { label: 'Notifications', to: '/notifications', icon: Bell },
  { label: 'Audit Logs', to: '/audit-logs', icon: ShieldAlert, perms: ['audit.view'] },
  { label: 'User Management', to: '/users', icon: UserCog, perms: ['users.manage'] },
  { label: 'System Settings', to: '/settings', icon: Settings, perms: ['settings.manage'] },
];

const ROUTE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/students': 'Students Directory',
  '/teachers': 'Teachers Directory',
  '/classes': 'Classes & Streams',
  '/subjects': 'Subjects Registry',
  '/allocations': 'Teacher Allocations',
  '/academics/years-terms': 'Academic Years & Terms',
  '/academics/examinations': 'Examinations, Assessments & Grading',
  '/marks/entry': 'Marks Entry & Excel Import',
  '/marks/submissions': 'Marks Submission Tracker',
  '/results/verification': 'Results Verification (DOS)',
  '/results/approval': 'Final Results Approval (Head Teacher)',
  '/results/published': 'Published Results & Comments',
  '/reports': 'Report Cards & Academic Exports',
  '/analytics': 'Academic Analytics',
  '/student-progress': 'Student Progress & Risk Identification',
  '/notifications': 'Notification Centre',
  '/audit-logs': 'Security & Audit Logs',
  '/users': 'User & Role Management',
  '/settings': 'System Settings & Backups',
  '/profile': 'My Profile & Security',
};

export function AppLayout() {
  const { user, contextInfo, logout, hasPermission } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{
    students: Array<{ id: number; admission_number: string; full_name: string }>;
    teachers: Array<{ id: number; staff_number: string; full_name: string }>;
    subjects: Array<{ id: number; code: string; name: string }>;
  }>({ students: [], teachers: [], subjects: [] });

  const [notifOpen, setNotifOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [recentNotifs, setRecentNotifs] = useState<
    Array<{ id: number; title: string; message: string; link: string | null; is_read: number; created_at: string }>
  >([]);
  const [profileOpen, setProfileOpen] = useState(false);

  const visibleNav = NAV_ITEMS.filter((item) => !item.perms || hasPermission(...item.perms));

  useEffect(() => {
    setMobileOpen(false);
    setNotifOpen(false);
    setProfileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    let active = true;
    api
      .get('/admin/notifications')
      .then((res) => {
        if (active) {
          setUnreadCount(res.data.unreadCount || 0);
          setRecentNotifs((res.data.notifications || []).slice(0, 6));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [location.pathname]);

  useEffect(() => {
    if (!searchOpen || searchQuery.trim().length < 2) {
      setSearchResults({ students: [], teachers: [], subjects: [] });
      return;
    }
    const t = setTimeout(() => {
      api
        .get('/dashboard/search', { params: { q: searchQuery.trim() } })
        .then((res) => setSearchResults(res.data))
        .catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [searchOpen, searchQuery]);

  const currentTitle =
    ROUTE_TITLES[location.pathname] ||
    (location.pathname.startsWith('/students/')
      ? 'Student Profile'
      : location.pathname.startsWith('/reports/preview')
        ? 'Live Report Card Preview'
        : 'Academic Workspace');

  const markNotifRead = async (id: number, link: string | null) => {
    await api.post('/admin/notifications/read', { id });
    setUnreadCount((c) => Math.max(0, c - 1));
    setNotifOpen(false);
    if (link) navigate(link);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex">
      {/* Desktop Sidebar */}
      <aside
        className={`no-print hidden lg:flex flex-col bg-[#0F2547] text-slate-200 border-r border-[#09172E] transition-all duration-200 shrink-0 ${
          collapsed ? 'w-[72px]' : 'w-[260px]'
        }`}
      >
        {/* School Crest & Name */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-white/10">
          <Link to="/dashboard" className="flex items-center gap-3 min-w-0">
            <img
              src={contextInfo.schoolLogoUrl}
              alt="Buyanja Grammar School Crest"
              referrerPolicy="no-referrer"
              className="w-9 h-9 rounded-md object-contain bg-white p-0.5 shrink-0"
            />
            {!collapsed && (
              <div className="min-w-0">
                <div className="text-xs font-bold tracking-wide text-white truncate">
                  BUYANJA GRAMMAR
                </div>
                <div className="text-[11px] text-[#E5C98B] truncate">Academic System</div>
              </div>
            )}
          </Link>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="p-1.5 rounded text-slate-300 hover:text-white hover:bg-white/10 transition-colors shrink-0"
            title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-0.5">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-md text-[13px] font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-[#1D4ED8] text-white'
                      : 'text-slate-300 hover:text-white hover:bg-white/10'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* User Footer Summary */}
        {!collapsed && user && (
          <div className="p-3 border-t border-white/10 text-xs">
            <div className="font-semibold text-white truncate">{user.fullName}</div>
            <div className="text-slate-400 truncate">
              {ROLE_LABELS[user.primaryRole] || user.primaryRole}
            </div>
          </div>
        )}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-10 w-72 max-w-[85vw] bg-[#0F2547] text-slate-200 flex flex-col h-full">
            <div className="h-16 px-4 flex items-center justify-between border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <img
                  src={contextInfo.schoolLogoUrl}
                  alt="School Crest"
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded bg-white p-0.5 object-contain"
                />
                <span className="text-xs font-bold text-white">BUYANJA GRAMMAR</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="p-2 text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
              {visibleNav.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium ${
                        isActive ? 'bg-[#1D4ED8] text-white' : 'text-slate-300 hover:bg-white/10'
                      }`
                    }
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Wrapper */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Navigation Bar */}
        <header className="no-print h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-md text-slate-600 hover:bg-slate-100"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="hidden sm:inline text-slate-400">Academics</span>
              <ChevronRight className="hidden sm:inline w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="font-semibold text-[#0F2547] truncate">{currentTitle}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Academic Period Context Indicator */}
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-600 pr-2 border-r border-slate-200 whitespace-nowrap">
              <span className="font-semibold text-[#0F2547] tabular-nums">
                {contextInfo.yearLabel}
              </span>
              <span aria-hidden="true">·</span>
              <span>{contextInfo.termName}</span>
            </div>

            {/* Global Search Trigger */}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100 transition-colors whitespace-nowrap"
            >
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden sm:inline">Search records</span>
            </button>

            {/* Notification Centre */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setNotifOpen((o) => !o);
                  setProfileOpen(false);
                }}
                className="relative p-2 rounded-md text-slate-600 hover:bg-slate-100 transition-colors"
                aria-label="Notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[#1D4ED8] text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-lg shadow-lg z-40 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#0F2547]">Notifications</span>
                    <Link
                      to="/notifications"
                      className="text-xs text-[#1D4ED8] hover:underline"
                      onClick={() => setNotifOpen(false)}
                    >
                      View all
                    </Link>
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                    {recentNotifs.length === 0 ? (
                      <div className="px-4 py-6 text-center text-xs text-slate-500">
                        No notifications right now.
                      </div>
                    ) : (
                      recentNotifs.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => markNotifRead(n.id, n.link)}
                          className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors ${
                            n.is_read ? 'opacity-70' : 'bg-blue-50/30'
                          }`}
                        >
                          <div className="text-xs font-semibold text-slate-900">{n.title}</div>
                          <div className="text-xs text-slate-600 mt-0.5 line-clamp-2">{n.message}</div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User Profile Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setProfileOpen((o) => !o);
                  setNotifOpen(false);
                }}
                className="flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                <div className="w-6 h-6 rounded bg-[#0F2547] text-white text-xs font-bold flex items-center justify-center shrink-0">
                  {user?.fullName?.charAt(0) || 'U'}
                </div>
                <span className="hidden sm:inline text-xs font-medium text-slate-800 max-w-[120px] truncate">
                  {user?.fullName}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {profileOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-40 py-1.5">
                  <div className="px-3.5 py-2 border-b border-slate-100">
                    <div className="text-xs font-semibold text-slate-900 truncate">{user?.fullName}</div>
                    <div className="text-[11px] text-slate-500 truncate">{user?.email}</div>
                  </div>
                  <Link
                    to="/profile"
                    className="flex items-center gap-2 px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50"
                    onClick={() => setProfileOpen(false)}
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>Profile &amp; Password</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => logout()}
                    className="w-full flex items-center gap-2 px-3.5 py-2 text-xs text-rose-700 hover:bg-rose-50"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          <Outlet />
        </main>
      </div>

      {/* Global Search Modal */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
          <div className="fixed inset-0 bg-slate-900/40" onClick={() => setSearchOpen(false)} />
          <div className="relative z-10 w-full max-w-lg bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search students by name or admission number, teachers, subjects..."
                className="w-full text-sm outline-none text-slate-900 placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                Close
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto p-3 space-y-3">
              {searchQuery.trim().length < 2 ? (
                <p className="text-xs text-slate-500 py-4 text-center">
                  Type at least 2 characters to search across Buyanja Grammar School records.
                </p>
              ) : (
                <>
                  {searchResults.students.length > 0 && (
                    <div>
                      <div className="text-[11px] font-semibold text-slate-400 px-2 mb-1">Students</div>
                      {searchResults.students.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setSearchOpen(false);
                            navigate(`/students/${s.id}`);
                          }}
                          className="w-full text-left px-2 py-2 rounded hover:bg-slate-50 flex items-center justify-between text-xs"
                        >
                          <span className="font-medium text-slate-900">{s.full_name}</span>
                          <span className="font-mono text-slate-500">{s.admission_number}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {searchResults.teachers.length > 0 && (
                    <div>
                      <div className="text-[11px] font-semibold text-slate-400 px-2 mb-1">Teachers</div>
                      {searchResults.teachers.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setSearchOpen(false);
                            navigate('/teachers');
                          }}
                          className="w-full text-left px-2 py-2 rounded hover:bg-slate-50 flex items-center justify-between text-xs"
                        >
                          <span className="font-medium text-slate-900">{t.full_name}</span>
                          <span className="font-mono text-slate-500">{t.staff_number}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {searchResults.subjects.length > 0 && (
                    <div>
                      <div className="text-[11px] font-semibold text-slate-400 px-2 mb-1">Subjects</div>
                      {searchResults.subjects.map((sub) => (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => {
                            setSearchOpen(false);
                            navigate('/subjects');
                          }}
                          className="w-full text-left px-2 py-2 rounded hover:bg-slate-50 flex items-center justify-between text-xs"
                        >
                          <span className="font-medium text-slate-900">{sub.name}</span>
                          <span className="font-mono text-slate-500">{sub.code}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {searchResults.students.length === 0 &&
                    searchResults.teachers.length === 0 &&
                    searchResults.subjects.length === 0 && (
                      <p className="text-xs text-slate-500 py-4 text-center">No matching records found.</p>
                    )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
