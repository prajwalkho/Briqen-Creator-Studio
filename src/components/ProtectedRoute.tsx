import React, { useEffect, useState } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Film, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { bootstrapSuperAdmin, getAdminBootstrapStatus } from '../services/adminService';

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

export function normalizeClientRole(raw?: string | null): 'super_admin' | 'admin' | 'user' {
  const val = (raw || '').trim().toLowerCase();
  if (val === 'super_admin' || val === 'superadmin') return 'super_admin';
  if (val === 'admin' || val === 'moderator' || val === 'mod') return 'admin';
  return 'user';
}

export function hasAdminPanelAccess(raw?: string | null): boolean {
  const r = normalizeClientRole(raw);
  return r === 'super_admin' || r === 'admin';
}

export function isSuperAdminClient(raw?: string | null): boolean {
  return normalizeClientRole(raw) === 'super_admin';
}

export function hasClientPermission(
  profile: { role?: string | null; permissions?: string[] } | null | undefined,
  permission: string
): boolean {
  if (!profile) return false;
  const role = normalizeClientRole(profile.role);
  if (role === 'super_admin') return true;
  if (role !== 'admin') return false;
  return Array.isArray(profile.permissions) && profile.permissions.includes(permission);
}

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

export const OwnerRoute: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, loading, profile } = useAuth();
  const location = useLocation();

  if (loading) {
    return <AuthLoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!isSuperAdminClient(profile?.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-[#0B0D12]">
        <div className="max-w-md w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/15 text-red-600 dark:text-red-400">
              <ShieldAlert className="h-5 w-5" />
            </span>
            <div>
              <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                Platform Owner Access Required
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                403 · Super Admin Exclusive Console
              </p>
            </div>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Your current role (<span className="font-mono text-xs">{normalizeClientRole(profile?.role)}</span>) cannot access the Owner Console, system governance, or complete platform financials.
          </p>
          <div className="flex items-center gap-3 pt-1">
            {hasAdminPanelAccess(profile?.role) ? (
              <Link
                to="/admin"
                className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm transition-colors"
              >
                Open Admin Panel
              </Link>
            ) : null}
            <Link
              to="/"
              className="inline-flex items-center justify-center px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium text-sm transition-colors"
            >
              Return to Studio
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return children ? <>{children}</> : <Outlet />;
};

export const AdminRoute: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, loading, profile, refreshProfile } = useAuth();
  const location = useLocation();
  const [checkingBootstrap, setCheckingBootstrap] = useState(false);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [activating, setActivating] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  const isAdmin = hasAdminPanelAccess(profile?.role);

  useEffect(() => {
    if (!isAuthenticated || loading || isAdmin) return;
    let active = true;
    setCheckingBootstrap(true);
    void getAdminBootstrapStatus()
      .then((res) => {
        if (active) setNeedsBootstrap(res.needsBootstrap);
      })
      .catch(() => {
        if (active) setNeedsBootstrap(false);
      })
      .finally(() => {
        if (active) setCheckingBootstrap(false);
      });
    return () => {
      active = false;
    };
  }, [isAuthenticated, loading, isAdmin]);

  if (loading || checkingBootstrap) {
    return <AuthLoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!isAdmin) {
    if (needsBootstrap) {
      const handleBootstrap = async () => {
        setActivating(true);
        setBootstrapError(null);
        try {
          await bootstrapSuperAdmin();
          await refreshProfile();
        } catch (err) {
          setBootstrapError(
            err instanceof Error ? err.message : 'Unable to activate Super Admin.'
          );
        } finally {
          setActivating(false);
        }
      };

      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-[#0B0D12]">
          <div className="max-w-md w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-6 space-y-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                  Initialize Admin Workspace
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No active Super Admin exists yet.
                </p>
              </div>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              You can claim the initial Super Admin role for <span className="font-mono text-xs">{profile?.email}</span> to manage users, roles, and audit logs.
            </p>
            {bootstrapError && (
              <p className="text-xs text-red-600 dark:text-red-400">{bootstrapError}</p>
            )}
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                disabled={activating}
                onClick={() => void handleBootstrap()}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm transition-colors disabled:opacity-60"
              >
                {activating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                <span>Activate Super Admin</span>
              </button>
              <Link
                to="/"
                className="px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Back
              </Link>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-[#0B0D12]">
        <div className="max-w-md w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/15 text-red-600 dark:text-red-400">
              <ShieldAlert className="h-5 w-5" />
            </span>
            <div>
              <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                Administrator Access Required
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                403 · Insufficient privileges
              </p>
            </div>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Your current role (<span className="font-mono text-xs">{normalizeClientRole(profile?.role)}</span>) does not permit access to the Briqen Admin Panel.
          </p>
          <div className="pt-1">
            <Link
              to="/"
              className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm transition-colors"
            >
              Return to Studio Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
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


