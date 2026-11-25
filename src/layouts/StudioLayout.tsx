import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  AudioWaveform,
  ChevronDown,
  Film,
  FolderKanban,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Settings,
  Sun,
  User as UserIcon,
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
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const displayName = profile?.fullName || profile?.displayName || 'Creator';
  const initials = (displayName || profile?.email || 'B').trim().charAt(0).toUpperCase();

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  const navItems = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/projects', label: 'Projects', icon: FolderKanban },
    { to: '/studio-lab', label: 'Audio & Analysis', icon: AudioWaveform },
    { to: '/settings', label: 'Account Settings', icon: Settings },
  ];

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const renderAvatar = (sizeClass = 'h-8 w-8 text-xs') => {
    if (profile?.avatarUrl) {
      return (
        <img
          src={profile.avatarUrl}
          alt={displayName}
          referrerPolicy="no-referrer"
          className={`${sizeClass} rounded-lg object-cover shrink-0 bg-slate-200 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80`}
        />
      );
    }
    return (
      <div
        className={`${sizeClass} rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center font-semibold text-amber-700 dark:text-amber-300 shrink-0`}
      >
        {initials}
      </div>
    );
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

        <nav className="px-3 py-5 space-y-1" aria-label="Workspace navigation">
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

        <Link
          to="/settings?tab=profile"
          onClick={() => setMobileOpen(false)}
          className="flex items-center gap-3 px-1.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
        >
          {renderAvatar('h-8 w-8 text-xs')}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
              {displayName}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {profile?.email || ''}
            </p>
          </div>
        </Link>

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
        <header className="h-16 px-4 sm:px-6 flex items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800/80 bg-white/85 dark:bg-[#0B0D12]/90 backdrop-blur-sm sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
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

          <div className="flex items-center gap-3 shrink-0">
            {primaryAction}

            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                aria-label="Account profile menu"
                className="flex items-center gap-2.5 pl-1.5 pr-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 whitespace-nowrap shrink-0"
              >
                {renderAvatar('h-7 w-7 text-xs')}
                <span className="hidden sm:block text-xs font-medium text-slate-800 dark:text-slate-100 max-w-[140px] truncate">
                  {displayName}
                </span>
                <ChevronDown
                  className={`h-3.5 w-3.5 text-slate-400 transition-transform ${
                    menuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  aria-label="User menu"
                  className="absolute right-0 mt-2 w-64 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] shadow-xl py-2 z-50"
                >
                  <div className="px-3.5 py-2.5 border-b border-slate-100 dark:border-slate-800/80 flex items-center gap-3">
                    {renderAvatar('h-9 w-9 text-sm')}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {displayName}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {profile?.email || ''}
                      </p>
                    </div>
                  </div>

                  <div className="py-1.5 px-1.5 space-y-0.5">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        navigate('/settings?tab=profile');
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors text-left"
                    >
                      <UserIcon className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span>My Profile</span>
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        navigate('/settings?tab=personal');
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors text-left"
                    >
                      <Settings className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span>Account Settings</span>
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        navigate('/settings?tab=password');
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors text-left"
                    >
                      <KeyRound className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span>Change Password</span>
                    </button>
                  </div>

                  <div className="pt-1.5 px-1.5 border-t border-slate-100 dark:border-slate-800/80">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        void logout();
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors text-left"
                    >
                      <LogOut className="h-3.5 w-3.5 shrink-0" />
                      <span>Logout</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
