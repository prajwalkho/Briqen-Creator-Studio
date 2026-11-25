import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  Download,
  Loader2,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../services/api';
import {
  cancelAccountDeletionRequest,
  exportPersonalAccountData,
  submitAccountDeletionRequest,
} from '../../services/userService';
import { BillingTransaction, UserProfile } from '../../types/studio';

interface AccountManagementProps {
  profile: UserProfile;
  onProfileUpdated: (user: UserProfile) => void;
  onNotify: (type: 'success' | 'error', message: string) => void;
}

export const AccountManagement: React.FC<AccountManagementProps> = ({
  profile,
  onProfileUpdated,
  onNotify,
}) => {
  const { clearAuthState } = useAuth();
  const navigate = useNavigate();

  const [transactions, setTransactions] = useState<BillingTransaction[]>([]);
  const [credits, setCredits] = useState<number>(profile.creditsBalance);
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [ledgerError, setLedgerError] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);
  const [cancellingDeletion, setCancellingDeletion] = useState(false);

  const [showDeletePanel, setShowDeletePanel] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [reason, setReason] = useState('');
  const [confirmPolicy, setConfirmPolicy] = useState(false);
  const [submittingDelete, setSubmittingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    setLedgerLoading(true);
    void apiRequest<{
      data: { creditsBalance: number; transactions: BillingTransaction[] };
    }>('/billing/ledger')
      .then((res) => {
        setCredits(res.data.creditsBalance);
        setTransactions(res.data.transactions);
      })
      .catch((err: unknown) => {
        setLedgerError(err instanceof Error ? err.message : 'Failed to load usage ledger.');
      })
      .finally(() => setLedgerLoading(false));
  }, []);

  const handleExportData = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const payload = await exportPersonalAccountData();
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `briqen-account-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onNotify('success', 'Personal account data exported as JSON.');
    } catch (err: unknown) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to export personal data.');
    } finally {
      setExporting(false);
    }
  };

  const handleCancelPendingDeletion = async () => {
    if (cancellingDeletion) return;
    setCancellingDeletion(true);
    try {
      const res = await cancelAccountDeletionRequest();
      onProfileUpdated(res.user);
      onNotify('success', res.message);
    } catch (err: unknown) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to cancel deletion request.');
    } finally {
      setCancellingDeletion(false);
    }
  };

  const handleDeletionSubmit = async (finalizeDeletion: boolean) => {
    if (submittingDelete) return;
    setDeleteError(null);

    if (!confirmPolicy) {
      setDeleteError('Please acknowledge the data deletion and retention policy.');
      return;
    }
    if (confirmPhrase.trim() !== 'DELETE') {
      setDeleteError('Type DELETE in all caps to confirm.');
      return;
    }
    if (profile.hasLocalPassword !== false && !password) {
      setDeleteError('Enter your current password to verify account ownership.');
      return;
    }
    if (profile.hasLocalPassword === false && confirmEmail.trim().toLowerCase() !== profile.email.toLowerCase()) {
      setDeleteError('Enter your exact account email address to verify account ownership.');
      return;
    }

    setSubmittingDelete(true);
    try {
      const res = await submitAccountDeletionRequest({
        password: profile.hasLocalPassword !== false ? password : undefined,
        confirmEmail: profile.hasLocalPassword === false ? confirmEmail.trim() : undefined,
        confirmPhrase: confirmPhrase.trim(),
        confirmDeletion: true,
        reason: reason.trim() || undefined,
        finalizeDeletion,
      });

      onNotify('success', res.message);
      if (res.deactivated) {
        await clearAuthState();
        navigate('/login', { replace: true });
        return;
      }

      onProfileUpdated(res.user);
      setShowDeletePanel(false);
      setPassword('');
      setConfirmEmail('');
      setConfirmPhrase('');
      setReason('');
      setConfirmPolicy(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not submit deletion request.';
      setDeleteError(msg);
      onNotify('error', msg);
    } finally {
      setSubmittingDelete(false);
    }
  };

  const inputCls =
    'w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-500';

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#13161E] p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800/80 pb-4">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Account Data &amp; Summary
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Review account creation records and download a portable copy of your studio data.
            </p>
          </div>
          <button
            type="button"
            disabled={exporting}
            onClick={() => void handleExportData()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            {exporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            <span>{exporting ? 'Preparing Export...' : 'Export Personal Data (JSON)'}</span>
          </button>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 text-xs">
          <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] space-y-1">
            <p className="text-slate-500 dark:text-slate-400">Account Created</p>
            <p className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
              {profile.createdAt ? new Date(profile.createdAt).toLocaleString() : '—'}
            </p>
          </div>
          <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] space-y-1">
            <p className="text-slate-500 dark:text-slate-400">Account Identifier</p>
            <p className="font-mono text-slate-900 dark:text-slate-100 truncate">{profile.id}</p>
          </div>
          <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] space-y-1">
            <p className="text-slate-500 dark:text-slate-400">Available Credits</p>
            <p className="font-mono font-bold text-amber-600 dark:text-amber-400 tabular-nums">
              {credits} cr
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#13161E] p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800/80 pb-4">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Usage &amp; Credit Ledger
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
              Idempotent generation billing ledger ensuring retries incur zero duplicate charges.
            </p>
          </div>
        </div>

        {ledgerError && (
          <div className="p-3.5 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-500">
            {ledgerError}
          </div>
        )}

        {ledgerLoading ? (
          <div className="h-28 animate-pulse bg-slate-100 dark:bg-slate-800/40 rounded-lg" />
        ) : transactions.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">
            No generation actions recorded yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 pr-4 font-medium">Timestamp</th>
                  <th className="py-2.5 pr-4 font-medium">Action ID</th>
                  <th className="py-2.5 pr-4 font-medium">Provider</th>
                  <th className="py-2.5 pr-4 font-medium">Model</th>
                  <th className="py-2.5 pr-4 font-medium">Media</th>
                  <th className="py-2.5 pr-4 font-medium text-right">Credits</th>
                  <th className="py-2.5 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="py-3 pr-4 font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {new Date(tx.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3 pr-4 font-mono text-slate-700 dark:text-slate-300">
                      {tx.actionId.slice(0, 8)}...
                    </td>
                    <td className="py-3 pr-4 capitalize">{tx.provider}</td>
                    <td className="py-3 pr-4 font-mono">{tx.model}</td>
                    <td className="py-3 pr-4">{tx.mediaType}</td>
                    <td className="py-3 pr-4 text-right font-mono font-semibold tabular-nums">
                      {tx.actualCredits ?? tx.estimatedCredits}
                    </td>
                    <td className="py-3 text-right capitalize font-medium">
                      <span
                        className={
                          tx.status === 'settled'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : tx.status === 'refunded'
                              ? 'text-slate-500'
                              : 'text-amber-600 dark:text-amber-400'
                        }
                      >
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-red-500/30 bg-white dark:bg-[#13161E] p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-red-500/20 pb-4">
          <div className="space-y-1">
            <h3 className="font-display text-base font-semibold text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              <span>Account Deletion &amp; Deactivation</span>
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Deleting your account permanently removes your profile, projects, scripts, scenes, avatars, and generated media after the 14-day grace period.
            </p>
          </div>
          {!showDeletePanel && (
            <button
              type="button"
              onClick={() => setShowDeletePanel(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-red-500/40 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors whitespace-nowrap shrink-0"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete Account</span>
            </button>
          )}
        </div>

        {profile.deletionRequestedAt && (
          <div className="p-4 rounded-lg border border-amber-500/35 bg-amber-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="space-y-1 text-amber-800 dark:text-amber-200">
              <p className="font-semibold">
                Account deletion scheduled for{' '}
                {profile.deletionScheduledFor
                  ? new Date(profile.deletionScheduledFor).toLocaleDateString()
                  : '14 days from request'}
              </p>
              <p>
                Your workspace remains accessible until the scheduled date unless you deactivate immediately.
              </p>
            </div>
            <button
              type="button"
              disabled={cancellingDeletion}
              onClick={() => void handleCancelPendingDeletion()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold whitespace-nowrap shrink-0"
            >
              {cancellingDeletion && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>Cancel Deletion Request</span>
            </button>
          </div>
        )}

        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] p-4 text-xs space-y-2 text-slate-600 dark:text-slate-400">
          <p className="font-semibold text-slate-800 dark:text-slate-200">
            Data Retention &amp; Audit Policy
          </p>
          <p>
            <strong>Removed:</strong> Personal profile fields, uploaded avatar images, projects, script revisions, scenes, generated media assets, and active session tokens.
          </p>
          <p>
            <strong>Retained for Legal &amp; Operational Audit:</strong> Billing credit ledger entries and account deletion timestamps are retained in anonymized/audit form during the 14-day recovery window and as required for accounting compliance.
          </p>
        </div>

        {showDeletePanel && (
          <div className="rounded-xl border border-red-500/35 bg-red-500/5 p-5 space-y-4">
            {deleteError && (
              <div
                role="alert"
                className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-600 dark:text-red-400 flex items-start gap-2"
              >
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="del-reason"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Reason for leaving (Optional)
              </label>
              <textarea
                id="del-reason"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Share optional feedback before closing your account"
                className={inputCls}
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {profile.hasLocalPassword !== false ? (
                <div className="space-y-1.5">
                  <label
                    htmlFor="del-password"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Confirm Current Password
                  </label>
                  <input
                    id="del-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter current password"
                    className={inputCls}
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label
                    htmlFor="del-email"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Confirm Account Email ({profile.email})
                  </label>
                  <input
                    id="del-email"
                    type="email"
                    value={confirmEmail}
                    onChange={(e) => setConfirmEmail(e.target.value)}
                    placeholder={profile.email}
                    className={inputCls}
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label
                  htmlFor="del-phrase"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Type <span className="font-mono font-bold">DELETE</span> to confirm
                </label>
                <input
                  id="del-phrase"
                  type="text"
                  value={confirmPhrase}
                  onChange={(e) => setConfirmPhrase(e.target.value)}
                  placeholder="DELETE"
                  className={inputCls}
                />
              </div>
            </div>

            <label className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmPolicy}
                onChange={(e) => setConfirmPolicy(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 dark:border-slate-700 text-red-600 focus:ring-red-500"
              />
              <span>
                I understand that exporting my data is recommended first, and deactivating or finalizing deletion revokes all sessions and access tokens immediately.
              </span>
            </label>

            <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={submittingDelete}
                onClick={() => {
                  setShowDeletePanel(false);
                  setDeleteError(null);
                }}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingDelete}
                onClick={() => void handleDeletionSubmit(false)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-amber-500/40 bg-amber-500/15 text-xs font-semibold text-amber-800 dark:text-amber-300 hover:bg-amber-500/25"
              >
                {submittingDelete && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>Schedule Deletion (14 Days)</span>
              </button>
              <button
                type="button"
                disabled={submittingDelete}
                onClick={() => void handleDeletionSubmit(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold"
              >
                {submittingDelete && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>Deactivate Account Now</span>
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
