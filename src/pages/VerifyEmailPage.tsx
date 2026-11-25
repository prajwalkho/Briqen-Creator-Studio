import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, KeyRound, Loader2 } from 'lucide-react';
import { AuthSplitLayout } from '../components/auth/AuthSplitLayout';
import { useAuth } from '../context/AuthContext';
import { verifyEmailToken } from '../services/authService';

export const VerifyEmailPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const initialToken = searchParams.get('token') || '';
  const { isAuthenticated, refreshProfile } = useAuth();

  const [token, setToken] = useState(initialToken);
  const [status, setStatus] = useState<'idle' | 'verifying' | 'verified' | 'error'>(
    initialToken ? 'verifying' : 'idle'
  );
  const [message, setMessage] = useState<string | null>(null);

  const runVerification = async (rawToken: string) => {
    setStatus('verifying');
    setMessage(null);
    try {
      const msg = await verifyEmailToken(rawToken.trim());
      setStatus('verified');
      setMessage(msg);
      await refreshProfile();
    } catch (err: unknown) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Unable to verify email.');
    }
  };

  useEffect(() => {
    if (initialToken) {
      void runVerification(initialToken);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) {
      setStatus('error');
      setMessage('Verification token is required.');
      return;
    }
    await runVerification(token);
  };

  return (
    <AuthSplitLayout>
      <div className="space-y-6">
        <div className="space-y-1.5">
          <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Email Verification
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Confirm your Briqen Creator Studio email address.
          </p>
        </div>

        {status === 'verifying' && (
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090D16] flex items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
            <Loader2 className="h-4 w-4 animate-spin text-amber-500 shrink-0" />
            <span>Verifying your email token...</span>
          </div>
        )}

        {status === 'verified' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-700 dark:text-emerald-300 flex items-start gap-2.5">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{message || 'Your email address has been verified.'}</span>
            </div>
            <Link
              to={isAuthenticated ? '/' : '/login'}
              className="w-full inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm transition-colors"
            >
              {isAuthenticated ? 'Continue to Dashboard' : 'Sign In to Workspace'}
            </Link>
          </div>
        )}

        {(status === 'idle' || status === 'error') && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {status === 'error' && message && (
              <div className="p-3.5 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-600 dark:text-red-400 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{message}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="verify-token"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Verification token
              </label>
              <div className="relative">
                <KeyRound className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="verify-token"
                  type="text"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste verification token"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090D16] text-xs font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm transition-colors"
            >
              Verify Email
            </button>

            <p className="text-center text-xs text-slate-500">
              <Link to="/login" className="text-amber-600 dark:text-amber-400 hover:underline">
                Return to Sign In
              </Link>
            </p>
          </form>
        )}
      </div>
    </AuthSplitLayout>
  );
};
