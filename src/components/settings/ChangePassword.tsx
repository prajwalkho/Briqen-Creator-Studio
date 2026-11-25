import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
} from 'lucide-react';
import { changeAccountPassword } from '../../services/userService';
import { UserProfile } from '../../types/studio';
import { evaluatePasswordStrength } from '../../utils/passwordStrength';

interface ChangePasswordProps {
  profile: UserProfile;
  onProfileUpdated: (user: UserProfile) => void;
  onNotify: (type: 'success' | 'error', message: string) => void;
}

export const ChangePassword: React.FC<ChangePasswordProps> = ({
  profile,
  onProfileUpdated,
  onNotify,
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const strength = useMemo(() => evaluatePasswordStrength(newPassword), [newPassword]);

  const strengthBarColor =
    strength.score <= 1
      ? 'bg-red-500'
      : strength.score === 2
        ? 'bg-amber-500'
        : strength.score === 3
          ? 'bg-sky-500'
          : 'bg-emerald-500';

  const handleCancel = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setError(null);
    setSuccessMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSuccessMsg(null);

    if (!currentPassword) {
      setError('Current password is required.');
      return;
    }
    if (!strength.valid) {
      setError(strength.errorMessage || 'Choose a stronger new password.');
      return;
    }
    if (currentPassword === newPassword) {
      setError('New password must be different from your current password.');
      return;
    }
    if (confirmNewPassword !== newPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await changeAccountPassword({
        currentPassword,
        newPassword,
        confirmNewPassword,
      });
      onProfileUpdated(res.user);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setSuccessMsg(res.message);
      onNotify('success', res.message);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to update password.';
      setError(msg);
      onNotify('error', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls =
    'w-full pl-10 pr-10 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500';

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#13161E] p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800/80 pb-4">
        <div>
          <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            Change Password
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Rotate your password regularly. Changing your password revokes all other active sessions.
          </p>
        </div>
        <Link
          to="/forgot-password"
          className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline whitespace-nowrap shrink-0"
        >
          Forgot Password?
        </Link>
      </div>

      {profile.passwordChangedAt && (
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
          Last password update: {new Date(profile.passwordChangedAt).toLocaleString()}
        </p>
      )}

      {profile.hasLocalPassword === false ? (
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] space-y-3 text-xs">
          <div className="flex items-start gap-2.5 text-slate-700 dark:text-slate-300">
            <KeyRound className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-slate-900 dark:text-white">
                Google OAuth Account
              </p>
              <p className="leading-relaxed text-slate-600 dark:text-slate-400">
                Your account signs in using Google Authentication and does not currently have a local password. You can create a local password via the Forgot Password reset flow.
              </p>
            </div>
          </div>
          <div>
            <Link
              to="/forgot-password"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold transition-colors"
            >
              Set a Local Password via Email Reset
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-5 max-w-xl">
          {error && (
            <div
              role="alert"
              className="p-3.5 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-600 dark:text-red-400 flex items-start gap-2"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div
              role="status"
              className="p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-700 dark:text-emerald-300 flex items-start gap-2"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="cp-current"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Current Password
            </label>
            <div className="relative">
              <Lock className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="cp-current"
                type={showCurrent ? 'text' : 'password'}
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Enter current password"
                className={inputCls}
              />
              <button
                type="button"
                onClick={() => setShowCurrent((prev) => !prev)}
                aria-label={showCurrent ? 'Hide current password' : 'Show current password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="cp-new"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              New Password
            </label>
            <div className="relative">
              <Lock className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="cp-new"
                type={showNew ? 'text' : 'password'}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Minimum 8 characters with complexity"
                className={inputCls}
              />
              <button
                type="button"
                onClick={() => setShowNew((prev) => !prev)}
                aria-label={showNew ? 'Hide new password' : 'Show new password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {newPassword.length > 0 && (
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 dark:text-slate-400">Password strength</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {strength.label}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[0, 1, 2, 3].map((idx) => (
                    <div
                      key={idx}
                      className={`h-1.5 rounded-sm transition-colors ${
                        idx <= strength.score && newPassword.length > 0
                          ? strengthBarColor
                          : 'bg-slate-200 dark:bg-slate-800'
                      }`}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                  {[
                    { ok: strength.checks.minLength, label: '8+ characters' },
                    { ok: strength.checks.uppercase, label: 'Uppercase' },
                    { ok: strength.checks.lowercase, label: 'Lowercase' },
                    { ok: strength.checks.number, label: 'Number' },
                    { ok: strength.checks.special, label: 'Symbol' },
                  ].map((item) => (
                    <span
                      key={item.label}
                      className={`inline-flex items-center gap-1 ${
                        item.ok
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      <Check className={`h-3 w-3 ${item.ok ? 'opacity-100' : 'opacity-30'}`} />
                      <span>{item.label}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="cp-confirm"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Confirm New Password
            </label>
            <div className="relative">
              <Lock className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="cp-confirm"
                type={showConfirm ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmNewPassword}
                onChange={(e) => {
                  setConfirmNewPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Re-enter new password"
                className={inputCls}
              />
              <button
                type="button"
                onClick={() => setShowConfirm((prev) => !prev)}
                aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {confirmNewPassword.length > 0 && confirmNewPassword !== newPassword && (
              <p className="text-xs text-red-600 dark:text-red-400">Passwords do not match.</p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800/80">
            <button
              type="button"
              disabled={submitting}
              onClick={handleCancel}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors disabled:opacity-60 whitespace-nowrap"
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>{submitting ? 'Updating Password...' : 'Update Password'}</span>
            </button>
          </div>
        </form>
      )}
    </section>
  );
};
