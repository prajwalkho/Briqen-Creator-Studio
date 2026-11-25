import React from 'react';
import { Link } from 'react-router-dom';
import { Film, Layers, Moon, ScrollText, Sun, Video } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface AuthSplitLayoutProps {
  children: React.ReactNode;
}

export const AuthSplitLayout: React.FC<AuthSplitLayoutProps> = ({ children }) => {
  const { theme, toggleTheme } = useAuth();

  return (
    <div className="min-h-screen grid lg:grid-cols-12 bg-slate-50 text-slate-900 dark:bg-[#070B14] dark:text-slate-100 relative overflow-hidden">
      {/* Subtle ambient depth gradient on dark navy studio canvas */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden dark:block bg-[radial-gradient(ellipse_at_top_left,rgba(245,158,11,0.08),transparent_48%),radial-gradient(ellipse_at_bottom_right,rgba(30,64,175,0.14),transparent_55%)]"
      />

      {/* Left Column: Branding, Headline & Script-to-Video Workflow Preview */}
      <section className="relative z-10 lg:col-span-6 flex flex-col justify-between p-8 sm:p-12 xl:p-16 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800/80">
        <div className="flex items-center justify-between gap-4">
          <Link to="/login" className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 text-slate-950 shadow-sm">
              <Film className="h-5 w-5" />
            </span>
            <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Briqen Creator Studio
            </span>
          </Link>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-[#101624]/80 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors whitespace-nowrap shrink-0"
          >
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5 text-amber-400" /> : <Moon className="h-3.5 w-3.5" />}
            <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>
        </div>

        <div className="my-auto py-10 space-y-8 max-w-xl">
          <div className="space-y-3">
            <h1 className="font-display text-3xl sm:text-4xl xl:text-[2.75rem] font-bold tracking-tight leading-[1.12] text-balance text-slate-900 dark:text-white">
              Create. Generate. Inspire.
            </h1>
            <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
              Your AI-powered creative workspace. Turn campaign briefs into grounded scripts, visual scenes, voiceovers, and finished MP4 exports.
            </p>
          </div>

          {/* Visual Preview of the Script-to-Video Workflow */}
          <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#0D1322] shadow-xl">
            <div className="relative h-52 sm:h-60 overflow-hidden bg-slate-950">
              <img
                src="/src/assets/images/studio_hero_cinema_1795602333947.jpg"
                alt="Briqen Creator Studio script-to-video editing suite"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#090D16] via-[#090D16]/45 to-transparent" />
              <div className="absolute bottom-4 left-5 right-5 flex items-end justify-between gap-4 text-white">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-amber-400">Script-to-Video Pipeline</p>
                  <p className="font-display text-base font-semibold truncate">
                    Campaign Storyboard · 16:9 Master Timeline
                  </p>
                </div>
                <span className="font-mono text-xs text-slate-300 tabular-nums shrink-0">
                  00:30 MP4
                </span>
              </div>
            </div>

            <div className="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800/80">
              <div className="p-4 space-y-1">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                  <ScrollText className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  <span>01. Script Studio</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Versioned revisions &amp; scene extraction
                </p>
              </div>
              <div className="p-4 space-y-1">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                  <Layers className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  <span>02. Scene Media</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  AI visuals, voiceovers &amp; soundtrack
                </p>
              </div>
              <div className="p-4 space-y-1">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                  <Video className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  <span>03. FFmpeg Export</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Drag-and-drop timeline &amp; 360p/720p render
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <span>Briqen Creator Studio</span>
          <div className="flex items-center gap-4">
            <Link to="/terms" className="hover:text-slate-900 dark:hover:text-slate-200 hover:underline">
              Terms of Service
            </Link>
            <Link to="/privacy" className="hover:text-slate-900 dark:hover:text-slate-200 hover:underline">
              Privacy Policy
            </Link>
          </div>
        </div>
      </section>

      {/* Right Column: Glassmorphism Authentication Card */}
      <section className="relative z-10 lg:col-span-6 flex items-center justify-center p-6 sm:p-10 lg:p-16">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-white/95 dark:bg-[#101624]/85 backdrop-blur-xl shadow-2xl p-6 sm:p-8">
          {children}
        </div>
      </section>
    </div>
  );
};
