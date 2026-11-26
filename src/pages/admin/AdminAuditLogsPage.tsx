import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Crown, Loader2 } from 'lucide-react';
import { isSuperAdminClient } from '../../components/ProtectedRoute';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { formatAdminDateTime } from '../../components/admin/adminUtils';
import { useAuth } from '../../context/AuthContext';
import { listAdminAuditLogs } from '../../services/adminService';
import type { AdminAuditLogItem, PaginationInfo } from '../../types/admin';

export const AdminAuditLogsPage: React.FC = () => {
  const { profile } = useAuth();
  const isSuperAdmin = isSuperAdminClient(profile?.role);

  const [actionFilter, setActionFilter] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [items, setItems] = useState<AdminAuditLogItem[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 30,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listAdminAuditLogs({
        action: actionFilter.trim() || undefined,
        outcome: outcomeFilter || undefined,
        page,
        limit: 30,
      });
      setItems(res.items);
      setPagination(res.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit logs.');
    } finally {
      setLoading(false);
    }
  }, [actionFilter, outcomeFilter, page]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  return (
    <AdminLayout
      title="Admin Audit Logs"
      subtitle={
        isSuperAdmin
          ? 'Append-only compliance record of administrative mutations and privilege checks'
          : 'Your personal administrative action trail (other admins’ trails are restricted to Platform Owner)'
      }
      actions={
        isSuperAdmin ? (
          <Link
            to="/owner/audit-logs"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold"
          >
            <Crown className="h-3.5 w-3.5" />
            <span>Owner Audit & CSV</span>
          </Link>
        ) : undefined
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-4 flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
            placeholder="Filter by action key (e.g. user.ban, user.role_change)..."
            className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-xs"
          />

          <select
            aria-label="Filter by outcome"
            value={outcomeFilter}
            onChange={(e) => {
              setOutcomeFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-xs"
          >
            <option value="">All Outcomes</option>
            <option value="success">Success</option>
            <option value="denied">Denied</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-16 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-10 text-center text-xs text-slate-500">
            No administrative audit events match the active filters.
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
            {items.map((log) => {
              const isExpanded = expandedId === log.id;
              return (
                <div key={log.id} className="p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-1.5 py-0.5 rounded-md border font-mono text-[10px] uppercase ${
                          log.outcome === 'success'
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : log.outcome === 'denied'
                            ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                            : 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400'
                        }`}
                      >
                        {log.outcome}
                      </span>
                      <span className="font-mono font-semibold text-slate-900 dark:text-white">
                        {log.action}
                      </span>
                      <span className="text-slate-500">
                        by {log.adminEmail || log.adminId || 'System'}
                      </span>
                      {log.targetEmail && (
                        <span className="text-slate-500">→ {log.targetEmail}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      {log.ipAddress && (
                        <span className="font-mono text-[11px] text-slate-400">
                          {log.ipAddress}
                        </span>
                      )}
                      <span className="text-[11px] text-slate-400 tabular-nums">
                        {formatAdminDateTime(log.createdAt)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setExpandedId((prev) => (prev === log.id ? null : log.id))}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-800 text-[11px] hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                        <span>Payload</span>
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                          Previous Values
                        </p>
                        <pre className="font-mono text-[11px] text-slate-600 dark:text-slate-300 overflow-x-auto">
                          {JSON.stringify(log.previousValues ?? {}, null, 2)}
                        </pre>
                      </div>
                      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                          New Values / Context
                        </p>
                        <pre className="font-mono text-[11px] text-slate-600 dark:text-slate-300 overflow-x-auto">
                          {JSON.stringify(log.newValues ?? {}, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span className="tabular-nums">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} audit entries)
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Previous</span>
            </button>
            <button
              type="button"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 disabled:opacity-40"
            >
              <span>Next</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};
