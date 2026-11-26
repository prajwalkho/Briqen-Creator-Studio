import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, CheckCircle2, Loader2, ShieldAlert } from 'lucide-react';
import { hasClientPermission } from '../../components/ProtectedRoute';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { UnbanUserModal } from '../../components/admin/UnbanUserModal';
import {
  formatAdminDateTime,
  formatRoleName,
  statusDotClasses,
} from '../../components/admin/adminUtils';
import { useAuth } from '../../context/AuthContext';
import { getAdminBansOverview } from '../../services/adminService';
import type { AdminBanHistoryItem } from '../../types/admin';
import type { UserProfile } from '../../types/studio';

export const AdminBanManagementPage: React.FC = () => {
  const { profile } = useAuth();
  const canUnban = hasClientPermission(profile, 'users.unban');
  const canEdit = hasClientPermission(profile, 'users.edit');
  const [restrictedUsers, setRestrictedUsers] = useState<UserProfile[]>([]);
  const [history, setHistory] = useState<AdminBanHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [unbanTarget, setUnbanTarget] = useState<UserProfile | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminBansOverview();
      setRestrictedUsers(data.restrictedUsers);
      setHistory(data.history);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ban center.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return (
    <AdminLayout
      title="Ban & Moderation Center"
      subtitle="Review currently restricted accounts, temporary ban expirations, and immutable moderation history"
    >
      {error && (
        <div className="mb-4 p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-700 dark:text-emerald-300">
          {notice}
        </div>
      )}

      {loading ? (
        <div className="py-20 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="space-y-3">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-red-500" />
              <span>Currently Restricted Accounts ({restrictedUsers.length})</span>
            </h2>

            {restrictedUsers.length === 0 ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-10 text-center text-xs text-slate-500 dark:text-slate-400">
                No accounts are currently banned or suspended.
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0E1118] text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        <th className="py-3 px-4">User</th>
                        <th className="py-3 px-3">Role</th>
                        <th className="py-3 px-3">Status</th>
                        <th className="py-3 px-3">Reason</th>
                        <th className="py-3 px-3">Expires</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                      {restrictedUsers.map((u) => {
                        const statusMeta = statusDotClasses(u.accountStatus);
                        return (
                          <tr key={u.id}>
                            <td className="py-3 px-4">
                              <Link
                                to={`/admin/users/${u.id}`}
                                className="font-semibold text-slate-900 dark:text-white hover:text-amber-500"
                              >
                                {u.fullName || u.email}
                              </Link>
                              <p className="text-[11px] text-slate-500">{u.email}</p>
                            </td>
                            <td className="py-3 px-3">{formatRoleName(u.role)}</td>
                            <td className="py-3 px-3">
                              <span
                                className={`inline-flex items-center gap-1.5 font-medium ${statusMeta.text}`}
                              >
                                <span className={`h-2 w-2 rounded-full ${statusMeta.dot}`} />
                                <span>{statusMeta.label}</span>
                              </span>
                            </td>
                            <td className="py-3 px-3 max-w-xs truncate text-slate-600 dark:text-slate-300">
                              {u.banReason || '—'}
                            </td>
                            <td className="py-3 px-3 tabular-nums text-slate-500">
                              {u.banExpiresAt ? formatAdminDateTime(u.banExpiresAt) : 'Permanent'}
                            </td>
                            <td className="py-3 px-4 text-right">
                              {u.accountStatus === 'banned' && canUnban ? (
                                <button
                                  type="button"
                                  onClick={() => setUnbanTarget(u)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  <span>Unban</span>
                                </button>
                              ) : canEdit ? (
                                <Link
                                  to={`/admin/users/${u.id}/edit`}
                                  className="text-amber-600 dark:text-amber-400 hover:underline"
                                >
                                  Manage
                                </Link>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Ban & Unban Timeline */}
          <div className="space-y-3">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Ban className="h-4 w-4 text-amber-500" />
              <span>Ban & Unban History ({history.length})</span>
            </h2>

            {history.length === 0 ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-10 text-center text-xs text-slate-500">
                No historical moderation actions recorded yet.
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                {history.map((h) => (
                  <div key={h.id} className="p-4 flex items-start justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`px-1.5 py-0.5 rounded-md border font-mono uppercase text-[10px] ${
                            h.action === 'ban'
                              ? 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400'
                              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          }`}
                        >
                          {h.action}
                        </span>
                        <Link
                          to={`/admin/users/${h.userId}`}
                          className="font-semibold text-slate-900 dark:text-white hover:text-amber-500"
                        >
                          {h.userFullName || h.userEmail || h.userId}
                        </Link>
                        {h.isDemoAccount && (
                          <span className="px-1.5 py-0.5 rounded-md border border-violet-500/30 bg-violet-500/10 text-[10px] font-mono text-violet-700 dark:text-violet-300">
                            Demo
                          </span>
                        )}
                        {h.banType && (
                          <span className="text-slate-500 capitalize">· {h.banType}</span>
                        )}
                      </div>
                      <p className="text-slate-700 dark:text-slate-300">{h.reason}</p>
                      <p className="text-[11px] text-slate-400">
                        Performed by {h.performedByEmail || h.performedBy || 'System'}
                        {h.expiresAt ? ` · Expires ${formatAdminDateTime(h.expiresAt)}` : ''}
                      </p>
                    </div>
                    <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                      {formatAdminDateTime(h.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {unbanTarget && (
        <UnbanUserModal
          user={unbanTarget}
          onClose={() => setUnbanTarget(null)}
          onSuccess={(_updated, msg) => {
            setUnbanTarget(null);
            setNotice(msg);
            void loadData();
          }}
        />
      )}
    </AdminLayout>
  );
};
