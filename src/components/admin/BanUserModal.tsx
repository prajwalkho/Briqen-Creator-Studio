import React, { useState } from 'react';
import { AlertCircle, Ban, Loader2, X } from 'lucide-react';
import { banAdminUser } from '../../services/adminService';
import type { UserProfile } from '../../types/studio';

interface BanUserModalProps {
  user: UserProfile;
  onClose: () => void;
  onSuccess: (updated: UserProfile, message: string) => void;
}

export const BanUserModal: React.FC<BanUserModalProps> = ({ user, onClose, onSuccess }) => {
  const [banType, setBanType] = useState<'temporary' | 'permanent'>('temporary');
  const [durationHours, setDurationHours] = useState<number>(24);
  const [reason, setReason] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 3) {
      setError('Please enter a ban reason (at least 3 characters).');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await banAdminUser(user.id, {
        banType,
        durationHours: banType === 'temporary' ? durationHours : undefined,
        reason: reason.trim(),
        internalNote: internalNote.trim() || undefined,
      });
      onSuccess(res.user, res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to ban user account.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/15 text-red-600 dark:text-red-400">
              <Ban className="h-4 w-4" />
            </span>
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Ban User Account
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[320px]">
                {user.fullName || user.email} · {user.email}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-600 dark:text-red-400 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Restriction Duration
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setBanType('temporary')}
                className={`px-3 py-2.5 rounded-lg border text-left text-xs transition-colors ${
                  banType === 'temporary'
                    ? 'border-amber-500 bg-amber-500/10 text-slate-900 dark:text-white font-semibold'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                Temporary Ban
                <span className="block text-[11px] font-normal text-slate-500 dark:text-slate-400 mt-0.5">
                  Auto-lifts on expiration
                </span>
              </button>
              <button
                type="button"
                onClick={() => setBanType('permanent')}
                className={`px-3 py-2.5 rounded-lg border text-left text-xs transition-colors ${
                  banType === 'permanent'
                    ? 'border-red-500 bg-red-500/10 text-slate-900 dark:text-white font-semibold'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                Permanent Ban
                <span className="block text-[11px] font-normal text-slate-500 dark:text-slate-400 mt-0.5">
                  Requires manual unban
                </span>
              </button>
            </div>
          </div>

          {banType === 'temporary' && (
            <div className="space-y-1.5">
              <label
                htmlFor="ban-duration-hours"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Duration
              </label>
              <select
                id="ban-duration-hours"
                value={durationHours}
                onChange={(e) => setDurationHours(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm text-slate-900 dark:text-slate-100"
              >
                <option value={1}>1 hour</option>
                <option value={6}>6 hours</option>
                <option value={24}>24 hours (1 day)</option>
                <option value={72}>72 hours (3 days)</option>
                <option value={168}>7 days</option>
                <option value={720}>30 days</option>
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="ban-reason"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Public Ban Reason (shown on blocked login)
            </label>
            <textarea
              id="ban-reason"
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain policy violation or suspension reason..."
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm text-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="ban-internal-note"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Internal Moderation Note (admin-only, optional)
            </label>
            <input
              id="ban-internal-note"
              type="text"
              value={internalNote}
              onChange={(e) => setInternalNote(e.target.value)}
              placeholder="Ticket reference or reviewer context"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm text-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-xs text-slate-600 dark:text-slate-400">
            Banning immediately revokes active JWT access and refresh sessions and blocks sign-in.
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-colors disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              <span>Confirm Ban</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
