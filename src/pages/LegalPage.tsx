import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Film } from 'lucide-react';

interface LegalPageProps {
  type: 'terms' | 'privacy';
}

export const LegalPage: React.FC<LegalPageProps> = ({ type }) => {
  const isTerms = type === 'terms';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#070B14] dark:text-slate-100 py-12 px-6">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-slate-950">
              <Film className="h-4 w-4" />
            </span>
            <span className="font-display text-base font-bold">Briqen Creator Studio</span>
          </div>
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Sign In</span>
          </Link>
        </div>

        <article className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#101624] p-6 sm:p-10 space-y-6">
          <div className="space-y-2">
            <h1 className="font-display text-2xl sm:text-3xl font-bold">
              {isTerms ? 'Terms of Service' : 'Privacy Policy'}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Effective Date: November 25, 2026
            </p>
          </div>

          {isTerms ? (
            <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              <p>
                By creating an account or accessing Briqen Creator Studio, you agree to use the script authoring, scene generation, media management, and FFmpeg video export features solely for lawful marketing and creative production workflows.
              </p>
              <p>
                You retain ownership of the scripts, uploaded assets, and exported video renders created within your workspace. You are responsible for safeguarding your login credentials and notifying us immediately of any unauthorized session activity.
              </p>
              <p>
                Workspace credits are reserved and settled once per unique generation action. Automated abuse, credential stuffing, or unauthorized access attempts against other creators&apos; workspaces are strictly prohibited and may result in account suspension.
              </p>
            </div>
          ) : (
            <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              <p>
                Briqen Creator Studio collects only the account information needed to authenticate your workspace—your name, email address, securely hashed password (never stored in plaintext), and optional Google sign-in profile details.
              </p>
              <p>
                Authentication sessions use short-lived access tokens held in application memory alongside rotating, HttpOnly refresh cookies stored as cryptographic hashes in PostgreSQL. Signed media URLs are time-limited and scoped to your owned project assets.
              </p>
              <p>
                We do not sell personal information or expose project scripts, assets, or exported renders across user accounts. Signing out or resetting your password immediately revokes active refresh sessions.
              </p>
            </div>
          )}
        </article>
      </div>
    </div>
  );
};
