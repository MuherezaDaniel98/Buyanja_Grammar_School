import React from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { AppLayout } from './components/Layout';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ExaminationsGradingPage, YearsTermsPage } from './pages/AcademicConfigPages';
import { AllocationsPage, ClassesPage, SubjectsPage } from './pages/AcademicsStructurePages';
import { AcademicAnalyticsPage, StudentProgressRiskPage } from './pages/AnalyticsRiskPages';
import { DashboardPage } from './pages/DashboardPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import {
  AuditLogsPage,
  NotificationsPage,
  ProfilePage,
  SystemSettingsPage,
  UsersRolesPage,
} from './pages/GovernancePages';
import { LoginPage } from './pages/LoginPage';
import { MarksEntryPage } from './pages/MarksEntryPage';
import { ReportCardPreviewPage, ReportCardsHubPage } from './pages/ReportCardPages';
import {
  ApprovalPage,
  PublishedResultsPage,
  SubmissionsTrackerPage,
  VerificationPage,
} from './pages/ResultsWorkflowPages';
import { StudentProfilePage } from './pages/StudentProfilePage';
import { StudentsPage } from './pages/StudentsPage';
import { TeachersPage } from './pages/TeachersPage';
import { VerifyReportPage } from './pages/VerifyReportPage';

function FullScreenLoading() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center gap-3">
      <div className="w-8 h-8 border-2 border-[#0F2547] border-t-transparent rounded-full animate-spin" />
      <p className="text-xs font-medium text-slate-500 tracking-wide uppercase">
        Loading Academic Registry...
      </p>
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoading />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoading />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function RequirePermission({
  perms,
  children,
}: {
  perms: string[];
  children: React.ReactNode;
}) {
  const { hasPermission } = useAuth();
  if (!hasPermission(...perms)) {
    return (
      <div className="max-w-lg mx-auto mt-16 bg-white border border-slate-200 rounded-lg p-8 text-center space-y-3">
        <div className="w-11 h-11 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-5 h-5" />
        </div>
        <h2 className="text-lg font-bold text-[#0F2547]">Access Restricted</h2>
        <p className="text-sm text-slate-500">
          Your current role does not have permission to view this module. Contact the System Administrator if you need elevated access.
        </p>
        <div className="pt-2">
          <Link
            to="/dashboard"
            className="inline-flex items-center px-4 py-2 text-xs font-semibold text-white bg-[#0F2547] rounded-md hover:bg-[#1a3766]"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public Authentication & Verification Routes */}
      <Route
        path="/login"
        element={
          <PublicOnly>
            <LoginPage />
          </PublicOnly>
        }
      />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/verify-report/:reportRef" element={<VerifyReportPage />} />

      {/* Authenticated Application Shell */}
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />

        <Route
          path="/students"
          element={
            <RequirePermission perms={['students.view', 'students.manage']}>
              <StudentsPage />
            </RequirePermission>
          }
        />
        <Route
          path="/students/:id"
          element={
            <RequirePermission perms={['students.view', 'students.manage']}>
              <StudentProfilePage />
            </RequirePermission>
          }
        />
        <Route
          path="/teachers"
          element={
            <RequirePermission perms={['teachers.view', 'teachers.manage']}>
              <TeachersPage />
            </RequirePermission>
          }
        />
        <Route
          path="/classes"
          element={
            <RequirePermission perms={['academics.view', 'academics.manage']}>
              <ClassesPage />
            </RequirePermission>
          }
        />
        <Route
          path="/subjects"
          element={
            <RequirePermission perms={['academics.view', 'academics.manage']}>
              <SubjectsPage />
            </RequirePermission>
          }
        />
        <Route
          path="/allocations"
          element={
            <RequirePermission perms={['academics.manage']}>
              <AllocationsPage />
            </RequirePermission>
          }
        />
        <Route
          path="/academics/years-terms"
          element={
            <RequirePermission perms={['academics.manage']}>
              <YearsTermsPage />
            </RequirePermission>
          }
        />
        <Route
          path="/academics/examinations"
          element={
            <RequirePermission perms={['exams.configure']}>
              <ExaminationsGradingPage />
            </RequirePermission>
          }
        />
        <Route
          path="/marks/entry"
          element={
            <RequirePermission perms={['marks.enter']}>
              <MarksEntryPage />
            </RequirePermission>
          }
        />
        <Route
          path="/marks/submissions"
          element={
            <RequirePermission perms={['marks.enter', 'marks.verify', 'results.approve']}>
              <SubmissionsTrackerPage />
            </RequirePermission>
          }
        />
        <Route
          path="/results/verification"
          element={
            <RequirePermission perms={['marks.verify']}>
              <VerificationPage />
            </RequirePermission>
          }
        />
        <Route
          path="/results/approval"
          element={
            <RequirePermission perms={['results.approve']}>
              <ApprovalPage />
            </RequirePermission>
          }
        />
        <Route
          path="/results/published"
          element={
            <RequirePermission perms={['results.view_published', 'comments.manage']}>
              <PublishedResultsPage />
            </RequirePermission>
          }
        />
        <Route
          path="/reports"
          element={
            <RequirePermission perms={['reports.generate']}>
              <ReportCardsHubPage />
            </RequirePermission>
          }
        />
        <Route
          path="/reports/preview/:studentId"
          element={
            <RequirePermission perms={['reports.generate', 'results.view_published']}>
              <ReportCardPreviewPage />
            </RequirePermission>
          }
        />
        <Route
          path="/analytics"
          element={
            <RequirePermission perms={['analytics.view']}>
              <AcademicAnalyticsPage />
            </RequirePermission>
          }
        />
        <Route
          path="/student-progress"
          element={
            <RequirePermission perms={['analytics.view', 'comments.manage']}>
              <StudentProgressRiskPage />
            </RequirePermission>
          }
        />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route
          path="/audit-logs"
          element={
            <RequirePermission perms={['audit.view']}>
              <AuditLogsPage />
            </RequirePermission>
          }
        />
        <Route
          path="/users"
          element={
            <RequirePermission perms={['users.manage']}>
              <UsersRolesPage />
            </RequirePermission>
          }
        />
        <Route
          path="/settings"
          element={
            <RequirePermission perms={['settings.manage']}>
              <SystemSettingsPage />
            </RequirePermission>
          }
        />
        <Route path="/profile" element={<ProfilePage />} />
      </Route>

      {/* Default & Fallback Routes */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
