import React, { useState } from 'react';
import { AlertCircle, Loader2, Trash2, X } from 'lucide-react';
import { permanentDeleteAdminUser, softDeleteAdminUser } from '../../services/adminService';
import type { AdminCanonicalRole } from '../../types/admin';
import type { UserProfile } from '../../types/studio';

interface DeleteUserConfirmationProps {
  user: UserProfile;
  actorRole: AdminCanonicalRole;
  onClose: () => void;
  onDeleted: (mode: 'soft' | 'permanent', message: string, updated?: UserProfile) => void;
}

export const DeleteUserConfirmation: React.FC<DeleteUserConfirmationProps> = ({
  user,
  actorRole,
  onClose,
  onDeleted,
}) => {
  const [mode, setMode] = useState<'soft' | 'permanent'>('soft');
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canPermanent = actorRole === 'super_admin';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'permanent' && confirmPhrase.trim() !== 'DELETE') {
      setError('Type DELETE in uppercase to confirm permanent removal.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'permanent') {
        const msg = await permanentDeleteAdminUser(user.id, confirmPhrase.trim(), reason.trim() || undefined);
        onDeleted('permanent', msg);
      } else {
        const res = await softDeleteAdminUser(user.id, reason.trim() || undefined);
        onDeleted('soft', res.message, res.user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user.');
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
              <Trash2 className="h-4 w-4" />
            </span>
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Delete User Account
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[320px]">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setMode('soft')}
              className={`px-3 py-2.5 rounded-lg border text-left text-xs transition-colors ${
                mode === 'soft'
                  ? 'border-amber-500 bg-amber-500/10 text-slate-900 dark:text-white font-semibold'
                  : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              Soft Delete (Reversible)
              <span className="block text-[11px] font-normal text-slate-500 dark:text-slate-400 mt-0.5">
                Revokes sessions & marks deleted; can be restored later.
              </span>
            </button>

            <button
              type="button"
              disabled={!canPermanent}
              onClick={() => setMode('permanent')}
              className={`px-3 py-2.5 rounded-lg border text-left text-xs transition-colors ${
                mode === 'permanent'
                  ? 'border-red-500 bg-red-500/10 text-slate-900 dark:text-white font-semibold'
                  : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
              } ${!canPermanent ? 'opacity-45 cursor-not-allowed' : ''}`}
            >
              Permanent Purge
              <span className="block text-[11px] font-normal text-slate-500 dark:text-slate-400 mt-0.5">
                {canPermanent
                  ? 'Irreversibly removes user, projects & private media.'
                  : 'Super Admin privileges required.'}
              </span>
            </button>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="delete-reason"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Reason (logged in audit trail)
            </label>
            <input
              id="delete-reason"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Optional administrative reason"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm text-slate-900 dark:text-slate-100"
            />
          </div>

          {mode === 'permanent' && (
            <div className="space-y-1.5">
              <label
                htmlFor="confirm-delete-phrase"
                className="block text-xs font-medium text-red-600 dark:text-red-400"
              >
                Type DELETE to permanently purge {user.email}
              </label>
              <input
                id="confirm-delete-phrase"
                type="text"
                value={confirmPhrase}
                onChange={(e) => setConfirmPhrase(e.target.value)}
                placeholder="DELETE"
                className="w-full px-3 py-2 rounded-lg border border-red-500/40 bg-slate-50 dark:bg-[#0B0D12] font-mono text-sm text-slate-900 dark:text-slate-100"
              />
            </div>
          )}

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
              <span>{mode === 'permanent' ? 'Permanently Delete' : 'Soft Delete User'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
