import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  Laptop,
  Loader2,
  LogOut,
  MailCheck,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  getActiveSessions,
  getSecurityOverview,
  logoutAllDevices,
  resendEmailVerification,
  revokeSessionById,
} from '../../services/userService';
import { UserSecurityInfo, UserSessionInfo } from '../../types/studio';

interface SecuritySettingsProps {
  onNotify: (type: 'success' | 'error', message: string) => void;
}

function summarizeUserAgent(ua: string): string {
  if (!ua || ua === 'Browser session') return 'Web Browser Session';
  let browser = 'Browser';
  if (ua.includes('Edg/')) browser = 'Microsoft Edge';
  else if (ua.includes('Chrome/')) browser = 'Google Chrome';
  else if (ua.includes('Firefox/')) browser = 'Mozilla Firefox';
  else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Apple Safari';
  else if (ua.includes('node') || ua.includes('undici')) browser = 'API Client';

  let os = '';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS X')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

  return os ? `${browser} on ${os}` : browser;
}

export const SecuritySettings: React.FC<SecuritySettingsProps> = ({ onNotify }) => {
  const { clearAuthState } = useAuth();
  const navigate = useNavigate();

  const [security, setSecurity] = useState<UserSecurityInfo | null>(null);
  const [sessions, setSessions] = useState<UserSessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [confirmLogoutAll, setConfirmLogoutAll] = useState(false);
  const [loggingOutAll, setLoggingOutAll] = useState(false);
  const [resendingVerify, setResendingVerify] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sec, sess] = await Promise.all([getSecurityOverview(), getActiveSessions()]);
      setSecurity(sec);
      setSessions(sess);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load account security details.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleRevokeSession = async (session: UserSessionInfo) => {
    if (revokingId) return;
    setRevokingId(session.id);
    try {
      const res = await revokeSessionById(session.id);
      onNotify('success', res.message);
      if (res.revokedCurrentSession) {
        await clearAuthState();
        navigate('/login', { replace: true });
        return;
      }
      await loadData();
    } catch (err: unknown) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to revoke session.');
    } finally {
      setRevokingId(null);
    }
  };

  const handleLogoutAll = async () => {
    if (loggingOutAll) return;
    setLoggingOutAll(true);
    try {
      const msg = await logoutAllDevices();
      onNotify('success', msg);
      await clearAuthState();
      navigate('/login', { replace: true });
    } catch (err: unknown) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to sign out of all devices.');
      setLoggingOutAll(false);
    }
  };

  const handleResendVerification = async () => {
    if (resendingVerify) return;
    setResendingVerify(true);
    try {
      const msg = await resendEmailVerification();
      onNotify('success', msg);
    } catch (err: unknown) {
      onNotify('error', err instanceof Error ? err.message : 'Could not send verification link.');
    } finally {
      setResendingVerify(false);
    }
  };

  if (loading) {
    return (
      <section className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#13161E] p-6 space-y-4">
        <div className="h-6 w-48 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        <div className="h-28 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/60" />
        <div className="h-36 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/60" />
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#13161E] p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800/80 pb-4">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Account Security Overview
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Authentication status, email verification, linked OAuth provider, and security hygiene.
            </p>
          </div>
          {security && !security.emailVerified && (
            <button
              type="button"
              disabled={resendingVerify}
              onClick={() => void handleResendVerification()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition-colors whitespace-nowrap shrink-0"
            >
              <MailCheck className="h-3.5 w-3.5" />
              <span>{resendingVerify ? 'Sending...' : 'Verify Email'}</span>
            </button>
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="p-3.5 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-600 dark:text-red-400 flex items-start gap-2"
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {security && (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] space-y-1">
                <p className="text-slate-500 dark:text-slate-400">Current Login Status</p>
                <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                  Active Authenticated Session
                </p>
              </div>
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] space-y-1">
                <p className="text-slate-500 dark:text-slate-400">Email Verification</p>
                <p
                  className={`font-semibold ${
                    security.emailVerified
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {security.emailVerified ? 'Verified' : 'Pending Verification'}
                </p>
              </div>
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] space-y-1">
                <p className="text-slate-500 dark:text-slate-400">Password Last Changed</p>
                <p className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {security.passwordLastChangedAt
                    ? new Date(security.passwordLastChangedAt).toLocaleDateString()
                    : security.hasLocalPassword
                      ? 'Set at registration'
                      : 'Google OAuth only'}
                </p>
              </div>
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] space-y-1">
                <p className="text-slate-500 dark:text-slate-400">Google OAuth Status</p>
                <p className="font-semibold text-slate-900 dark:text-slate-100">
                  {!security.googleOAuthConfigured
                    ? 'Not configured'
                    : security.googleConnected
                      ? 'Connected'
                      : 'Available (Not linked)'}
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Security Recommendations
              </h4>
              <div className="divide-y divide-slate-100 dark:divide-slate-800/70 rounded-lg border border-slate-200 dark:border-slate-800">
                {security.recommendations.map((rec) => (
                  <div key={rec.id} className="p-3.5 flex items-start gap-3 text-xs">
                    {rec.status === 'done' ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                    ) : (
                      <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-0.5">
                      <p className="font-semibold text-slate-900 dark:text-white">{rec.title}</p>
                      <p className="text-slate-600 dark:text-slate-400">{rec.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#13161E] p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800/80 pb-4">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Active Sessions
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Manage active refresh sessions or immediately sign out from all devices.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setConfirmLogoutAll((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-red-500/35 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors whitespace-nowrap shrink-0"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Logout All Devices</span>
          </button>
        </div>

        {confirmLogoutAll && (
          <div className="p-4 rounded-lg border border-red-500/35 bg-red-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="space-y-0.5">
              <p className="font-semibold text-red-700 dark:text-red-300">
                Sign out from all devices?
              </p>
              <p className="text-red-600/90 dark:text-red-400/90">
                This revokes every active refresh session and invalidates all issued access tokens, including your current browser.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={loggingOutAll}
                onClick={() => setConfirmLogoutAll(false)}
                className="px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-white dark:bg-[#0B0D12]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loggingOutAll}
                onClick={() => void handleLogoutAll()}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-red-600 hover:bg-red-500 text-white font-semibold"
              >
                {loggingOutAll && <Loader2 className="h-3 w-3 animate-spin" />}
                <span>Confirm Sign Out All</span>
              </button>
            </div>
          </div>
        )}

        {sessions.length === 0 ? (
          <div className="p-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-center space-y-1 text-xs">
            <ShieldCheck className="h-5 w-5 text-slate-400 mx-auto" />
            <p className="font-medium text-slate-700 dark:text-slate-300">
              No persistent refresh-token sessions recorded.
            </p>
            <p className="text-slate-500 dark:text-slate-400">
              Federated OAuth logins and password logins with active cookies appear here when active.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/70 rounded-lg border border-slate-200 dark:border-slate-800">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <Laptop className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {summarizeUserAgent(session.userAgent)}
                      </span>
                      {session.isCurrent && (
                        <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          · Current session
                        </span>
                      )}
                      {session.rememberMe && (
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          · Extended login
                        </span>
                      )}
                    </div>
                    <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                      IP {session.ipAddress} · Started {new Date(session.createdAt).toLocaleString()} · Expires{' '}
                      {new Date(session.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={revokingId === session.id}
                  onClick={() => void handleRevokeSession(session)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 self-start sm:self-center"
                >
                  {revokingId === session.id && <Loader2 className="h-3 w-3 animate-spin" />}
                  <span>Revoke</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
