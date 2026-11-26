import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';
import { unbanAdminUser } from '../../services/adminService';
import type { UserProfile } from '../../types/studio';

interface UnbanUserModalProps {
  user: UserProfile;
  onClose: () => void;
  onSuccess: (updated: UserProfile, message: string) => void;
}

export const UnbanUserModal: React.FC<UnbanUserModalProps> = ({ user, onClose, onSuccess }) => {
  const [reason, setReason] = useState('Ban lifted after review');
  const [internalNote, setInternalNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await unbanAdminUser(user.id, {
        reason: reason.trim() || undefined,
        internalNote: internalNote.trim() || undefined,
      });
      onSuccess(res.user, res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unban user.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </span>
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Unban User Account
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[260px]">
                {user.email}
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

          {user.banReason && (
            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-xs space-y-1">
              <p className="font-semibold text-slate-700 dark:text-slate-300">Current ban reason</p>
              <p className="text-slate-600 dark:text-slate-400">{user.banReason}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="unban-reason"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Unban Note
            </label>
            <input
              id="unban-reason"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm text-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="unban-internal"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Internal Audit Note (optional)
            </label>
            <input
              id="unban-internal"
              type="text"
              value={internalNote}
              onChange={(e) => setInternalNote(e.target.value)}
              placeholder="Reviewer confirmation reference"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm text-slate-900 dark:text-slate-100"
            />
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
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              <span>Restore Active Access</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
