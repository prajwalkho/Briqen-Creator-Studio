import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Film, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const AuthLoadingScreen: React.FC = () => (
  <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-50 dark:bg-[#0B0D12] text-slate-600 dark:text-slate-400">
    <div className="flex items-center gap-2.5 text-slate-900 dark:text-slate-100">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 text-slate-950">
        <Film className="h-5 w-5" />
      </span>
      <span className="font-display text-lg font-bold tracking-tight">Briqen Creator Studio</span>
    </div>
    <div className="flex items-center gap-2 text-xs">
      <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
      <span>Verifying workspace session...</span>
    </div>
  </div>
);

export const ProtectedRoute: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <AuthLoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};

export const PublicOnlyRoute: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();
  const state = location.state as { from?: { pathname?: string; search?: string } } | null;

  if (loading) {
    return <AuthLoadingScreen />;
  }

  if (isAuthenticated) {
    const redirectTo = state?.from?.pathname
      ? `${state.from.pathname}${state.from.search || ''}`
      : '/';
    return <Navigate to={redirectTo} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};
