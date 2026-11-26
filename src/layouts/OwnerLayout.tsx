import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  ClipboardList,
  Crown,
  DollarSign,
  FolderKanban,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Settings,
  Shield,
  Sparkles,
  Sun,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface OwnerLayoutProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export const OwnerLayout: React.FC<OwnerLayoutProps> = ({
  title,
  subtitle,
  actions,
  children,
}) => {
  const { profile, theme, toggleTheme, logout } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { to: '/owner', label: 'Owner Overview', icon: LayoutDashboard, exact: true },
    { to: '/owner/users', label: 'All Users & Roles', icon: Users, exact: false },
    { to: '/owner/admins', label: 'Admin Management', icon: UserCog, exact: false },
    { to: '/owner/permissions', label: 'Permission Matrix', icon: KeyRound, exact: false },
    { to: '/owner/projects', label: 'Platform Projects', icon: FolderKanban, exact: false },
    { to: '/owner/ai-analytics', label: 'AI & Media Analytics', icon: Sparkles, exact: false },
    { to: '/owner/financials', label: 'Credits & Financials', icon: DollarSign, exact: false },
    { to: '/owner/audit-logs', label: 'Complete Audit Trail', icon: ClipboardList, exact: false },
    { to: '/owner/settings', label: 'System & Settings', icon: Settings, exact: false },
  ];

  const isActive = (to: string, exact: boolean) => {
    if (exact) return location.pathname === to;
    return location.pathname.startsWith(to);
  };

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between bg-white dark:bg-[#10131A] border-r border-slate-200 dark:border-slate-800/80 w-[264px] shrink-0">
      <div>
        <div className="flex items-center justify-between px-5 h-16 border-b border-slate-200 dark:border-slate-800/80">
          <Link
            to="/owner"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-2.5 whitespace-nowrap shrink-0"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-slate-950">
              <Crown className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <span className="font-display text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100 block leading-tight">
                Briqen Owner
              </span>
              <span className="text-[11px] font-mono text-amber-600 dark:text-amber-400 block leading-tight">
                Super Admin Console
              </span>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
            aria-label="Close owner navigation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="px-3 py-4 space-y-1" aria-label="Owner console navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.to, item.exact);
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-amber-500/12 text-amber-700 dark:text-amber-400 font-semibold'
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
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 space-y-0.5">
          <p className="text-[10px] font-mono uppercase tracking-wider text-amber-700 dark:text-amber-400">
            Platform Owner
          </p>
          <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
            {profile?.fullName || profile?.displayName || profile?.email}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {profile?.email}
          </p>
        </div>

        <Link
          to="/admin"
          onClick={() => setMobileOpen(false)}
          className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors"
        >
          <Shield className="h-3.5 w-3.5 text-sky-500" />
          <span>Operational Admin Panel</span>
        </Link>

        <Link
          to="/"
          onClick={() => setMobileOpen(false)}
          className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Creator Studio</span>
        </Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900 dark:bg-[#0B0D12] dark:text-slate-100">
      <div className="hidden lg:block">{sidebarContent}</div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="fixed inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="relative z-10 flex h-full">{sidebarContent}</div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="min-h-16 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800/80 bg-white/90 dark:bg-[#0B0D12]/90 backdrop-blur-sm sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300"
              aria-label="Open owner navigation"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-amber-500 shrink-0 hidden sm:block" />
                <h1 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {title}
                </h1>
              </div>
              {subtitle && (
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{subtitle}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            {actions}
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-5 sm:p-6 lg:p-8 max-w-[1520px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
