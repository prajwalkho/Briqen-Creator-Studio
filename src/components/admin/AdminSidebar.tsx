import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  Ban,
  ClipboardList,
  Crown,
  LayoutDashboard,
  Settings,
  Shield,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { hasClientPermission, isSuperAdminClient } from '../ProtectedRoute';
import { formatRoleName } from './adminUtils';

interface AdminSidebarProps {
  onCloseMobile?: () => void;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({ onCloseMobile }) => {
  const { profile } = useAuth();
  const location = useLocation();
  const isSuperAdmin = isSuperAdminClient(profile?.role);

  const navItems = [
    { to: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
    ...(hasClientPermission(profile, 'users.view')
      ? [{ to: '/admin/users', label: 'User Management', icon: Users, exact: false }]
      : []),
    ...(hasClientPermission(profile, 'users.view')
      ? [{ to: '/admin/bans', label: 'Bans & Restrictions', icon: Ban, exact: false }]
      : []),
    ...(hasClientPermission(profile, 'analytics.operational.view')
      ? [{ to: '/admin/activities', label: 'Activity Stream', icon: Activity, exact: false }]
      : []),
    { to: '/admin/audit-logs', label: 'Admin Audit Logs', icon: ClipboardList, exact: false },
    { to: '/admin/settings', label: 'Admin Governance', icon: Settings, exact: false },
  ];

  const isActive = (to: string, exact: boolean) => {
    if (exact) return location.pathname === to;
    return location.pathname.startsWith(to);
  };

  return (
    <div className="flex h-full flex-col justify-between bg-white dark:bg-[#10131A] border-r border-slate-200 dark:border-slate-800/80 w-[256px] shrink-0">
      <div>
        <div className="flex items-center justify-between px-5 h-16 border-b border-slate-200 dark:border-slate-800/80">
          <Link
            to="/admin"
            onClick={onCloseMobile}
            className="flex items-center gap-2.5 whitespace-nowrap shrink-0"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-slate-950">
              <Shield className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <span className="font-display text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100 block leading-tight">
                Briqen Admin
              </span>
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 block leading-tight">
                Operations Panel
              </span>
            </div>
          </Link>
          {onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
              aria-label="Close admin sidebar"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        <nav className="px-3 py-5 space-y-1" aria-label="Admin navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.to, item.exact);
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onCloseMobile}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-amber-500/12 text-amber-700 dark:text-amber-400'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="p-4 border-t border-slate-200 dark:border-slate-800/80 space-y-2.5">
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] px-3 py-2.5 space-y-0.5">
          <p className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Signed in as
          </p>
          <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
            {profile?.fullName || profile?.displayName || profile?.email}
          </p>
          <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
            {formatRoleName(profile?.role)}
            {profile?.isDemoAccount ? ' · Demo' : ''}
          </p>
        </div>

        {isSuperAdmin && (
          <Link
            to="/owner"
            onClick={onCloseMobile}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition-colors"
          >
            <Crown className="h-3.5 w-3.5" />
            <span>Open Owner Console</span>
          </Link>
        )}

        <Link
          to="/"
          onClick={onCloseMobile}
          className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Creator Studio</span>
        </Link>
      </div>
    </div>
  );
};
