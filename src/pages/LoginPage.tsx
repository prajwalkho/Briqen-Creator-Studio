import React, { useState } from 'react';
import { Film, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const LoginPage: React.FC = () => {
  const { loginWithGoogle } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const handleSignIn = async () => {
    setError(null);
    setSigningIn(true);
    try {
      await loginWithGoogle();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to sign in with Google.';
      setError(msg);
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-slate-50 text-slate-900 dark:bg-[#0B0D12] dark:text-slate-100">
      <div className="flex flex-col justify-between p-8 sm:p-12 lg:p-16">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 text-slate-950">
            <Film className="h-5 w-5" />
          </span>
          <span className="font-display text-lg font-bold tracking-tight">
            Briqen Creator Studio
          </span>
        </div>

        <div className="max-w-md my-auto py-12 space-y-6">
          <div className="space-y-3">
            <p className="text-xs font-medium tracking-wide text-amber-600 dark:text-amber-400">
              AI Video Production Suite
            </p>
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-balance">
              Script, scene, and render campaign videos in one workspace.
            </h1>
            <p className="text-base text-slate-600 dark:text-slate-400 leading-relaxed">
              Draft grounded marketing scripts, break narratives into timed scenes, generate imagery, voiceovers, music, and motion clips, and export finished MP4 drafts with FFmpeg.
            </p>
          </div>

          {error && (
            <div className="p-3.5 rounded-lg border border-red-500/30 bg-red-500/10 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleSignIn}
            disabled={signingIn}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-6 py-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm transition-colors disabled:opacity-60 whitespace-nowrap"
          >
            <span>{signingIn ? 'Connecting account...' : 'Continue with Google'}</span>
            <ArrowRight className="h-4 w-4" />
          </button>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800/80 grid grid-cols-3 gap-4 text-xs text-slate-500 dark:text-slate-400">
            <div>
              <p className="font-semibold text-slate-900 dark:text-slate-200">Immutable Scripts</p>
              <p className="mt-0.5">Versioned revisions</p>
            </div>
            <div>
              <p className="font-semibold text-slate-900 dark:text-slate-200">Multimodal AI</p>
              <p className="mt-0.5">Images, video, TTS, music</p>
            </div>
            <div>
              <p className="font-semibold text-slate-900 dark:text-slate-200">FFmpeg Render</p>
              <p className="mt-0.5">Signed MP4 exports</p>
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-500">
          Briqen Creator Studio · PostgreSQL &amp; Cloud Run Ready
        </p>
      </div>

      <div className="hidden lg:block relative bg-slate-900 overflow-hidden border-l border-slate-200 dark:border-slate-800/80">
        <img
          src="/src/assets/images/studio_hero_cinema_1795602333947.jpg"
          alt="Briqen film production and color grading workstation"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
        <div className="absolute bottom-10 left-10 right-10 text-white space-y-1.5">
          <p className="text-xs font-medium text-amber-400">End-to-End Pipeline</p>
          <p className="font-display text-xl font-semibold">
            From Search-grounded brief to drag-and-drop timeline export.
          </p>
        </div>
      </div>
    </div>
  );
};
