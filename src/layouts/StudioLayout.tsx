import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  AudioWaveform,
  Film,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Settings,
  Sun,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface StudioLayoutProps {
  title: string;
  primaryAction?: React.ReactNode;
  children: React.ReactNode;
}

export const StudioLayout: React.FC<StudioLayoutProps> = ({
  title,
  primaryAction,
  children,
}) => {
  const { profile, theme, toggleTheme, logout } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/projects', label: 'Projects', icon: FolderKanban },
    { to: '/studio-lab', label: 'Audio & Analysis', icon: AudioWaveform },
    { to: '/settings', label: 'Settings & Billing', icon: Settings },
  ];

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between bg-white dark:bg-[#10131A] border-r border-slate-200 dark:border-slate-800/80 w-[252px] shrink-0">
      <div>
        <div className="flex items-center justify-between px-5 h-16 border-b border-slate-200 dark:border-slate-800/80">
          <Link to="/" className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-slate-950">
              <Film className="h-4 w-4" />
            </span>
            <span className="font-display text-base font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Briqen Studio
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="px-3 py-5 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
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

      <div className="p-4 border-t border-slate-200 dark:border-slate-800/80 space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
          <span>Studio Credits</span>
          <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
            {profile?.creditsBalance ?? 0} cr
          </span>
        </div>

        <div className="flex items-center gap-3 px-1">
          {profile?.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt={profile.displayName || 'Creator'}
              referrerPolicy="no-referrer"
              className="h-8 w-8 rounded-lg object-cover shrink-0 bg-slate-200 dark:bg-slate-800"
            />
          ) : (
            <div className="h-8 w-8 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-xs font-semibold text-slate-700 dark:text-slate-200 shrink-0">
              {(profile?.displayName || profile?.email || 'B').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
              {profile?.displayName || 'Creator'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {profile?.email || ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={toggleTheme}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors whitespace-nowrap"
          >
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-colors whitespace-nowrap"
            title="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign out</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900 dark:bg-[#0B0D12] dark:text-slate-100">
      <div className="hidden lg:block">{sidebarContent}</div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/60"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-10 flex h-full">{sidebarContent}</div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 px-6 flex items-center justify-between gap-8 border-b border-slate-200 dark:border-slate-800/80 bg-white/80 dark:bg-[#0B0D12]/90 backdrop-blur-sm sticky top-0 z-30">
          <div className="flex items-center gap-4 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300"
              aria-label="Open navigation"
            >
              <Menu className="h-4 w-4" />
            </button>
            <h1 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">
              {title}
            </h1>
          </div>

          <div className="flex items-center gap-3 shrink-0">{primaryAction}</div>
        </header>

        <main className="flex-1 p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
