import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import {
  AdminRoute,
  OwnerRoute,
  ProtectedRoute,
  PublicOnlyRoute,
} from './components/ProtectedRoute';
import { AuthProvider } from './context/AuthContext';
import { DashboardPage } from './pages/DashboardPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { LegalPage } from './pages/LegalPage';
import { LoginPage } from './pages/LoginPage';
import { ProjectWorkspacePage } from './pages/ProjectWorkspacePage';
import { RegisterPage } from './pages/RegisterPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { SettingsPage } from './pages/SettingsPage';
import { StudioLabPage } from './pages/StudioLabPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { AdminActivityLogsPage } from './pages/admin/AdminActivityLogsPage';
import { AdminAuditLogsPage } from './pages/admin/AdminAuditLogsPage';
import { AdminBanManagementPage } from './pages/admin/AdminBanManagementPage';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { AdminEditUserPage } from './pages/admin/AdminEditUserPage';
import { AdminSettingsPage } from './pages/admin/AdminSettingsPage';
import { AdminUserDetailsPage } from './pages/admin/AdminUserDetailsPage';
import { AdminUsersPage } from './pages/admin/AdminUsersPage';
import { OwnerAIAnalytics } from './pages/owner/OwnerAIAnalytics';
import { OwnerAdmins } from './pages/owner/OwnerAdmins';
import { OwnerAuditLogs } from './pages/owner/OwnerAuditLogs';
import { OwnerDashboard } from './pages/owner/OwnerDashboard';
import { OwnerFinancialAnalytics } from './pages/owner/OwnerFinancialAnalytics';
import { OwnerPermissions } from './pages/owner/OwnerPermissions';
import { OwnerProjects } from './pages/owner/OwnerProjects';
import { OwnerSystemSettings } from './pages/owner/OwnerSystemSettings';
import { OwnerUsers } from './pages/owner/OwnerUsers';
import { MyAssetsPage } from './pages/user/MyAssetsPage';
import { MyUsagePage } from './pages/user/MyUsagePage';

const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/terms" element={<LegalPage type="terms" />} />
      <Route path="/privacy" element={<LegalPage type="privacy" />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<DashboardPage mode="dashboard" />} />
        <Route path="/projects" element={<DashboardPage mode="projects" />} />
        <Route path="/projects/:projectId" element={<ProjectWorkspacePage />} />
        <Route path="/my-assets" element={<MyAssetsPage />} />
        <Route path="/my-usage" element={<MyUsagePage />} />
        <Route path="/studio-lab" element={<StudioLabPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      <Route element={<AdminRoute />}>
        <Route path="/admin" element={<AdminDashboardPage />} />
        <Route path="/admin/users" element={<AdminUsersPage />} />
        <Route path="/admin/users/:userId" element={<AdminUserDetailsPage />} />
        <Route path="/admin/users/:userId/edit" element={<AdminEditUserPage />} />
        <Route path="/admin/bans" element={<AdminBanManagementPage />} />
        <Route path="/admin/activities" element={<AdminActivityLogsPage />} />
        <Route path="/admin/audit-logs" element={<AdminAuditLogsPage />} />
        <Route path="/admin/settings" element={<AdminSettingsPage />} />
      </Route>

      <Route element={<OwnerRoute />}>
        <Route path="/owner" element={<OwnerDashboard />} />
        <Route path="/owner/users" element={<OwnerUsers />} />
        <Route path="/owner/admins" element={<OwnerAdmins />} />
        <Route path="/owner/admins/:adminId" element={<OwnerAdmins />} />
        <Route path="/owner/permissions" element={<OwnerPermissions />} />
        <Route path="/owner/projects" element={<OwnerProjects />} />
        <Route path="/owner/ai-analytics" element={<OwnerAIAnalytics />} />
        <Route path="/owner/financials" element={<OwnerFinancialAnalytics />} />
        <Route path="/owner/audit-logs" element={<OwnerAuditLogs />} />
        <Route path="/owner/settings" element={<OwnerSystemSettings />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
