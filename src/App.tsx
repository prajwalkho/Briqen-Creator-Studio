import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProjectWorkspacePage } from './pages/ProjectWorkspacePage';
import { StudioLabPage } from './pages/StudioLabPage';
import { SettingsPage } from './pages/SettingsPage';

const AppRoutes: React.FC = () => {
  const { firebaseUser, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0B0D12] text-slate-600 dark:text-slate-400 text-sm">
        Loading Briqen Creator Studio...
      </div>
    );
  }

  if (!firebaseUser) {
    return <LoginPage />;
  }

  return (
    <Routes>
      <Route path="/" element={<DashboardPage mode="dashboard" />} />
      <Route path="/projects" element={<DashboardPage mode="projects" />} />
      <Route path="/projects/:projectId" element={<ProjectWorkspacePage />} />
      <Route path="/studio-lab" element={<StudioLabPage />} />
      <Route path="/settings" element={<SettingsPage />} />
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
