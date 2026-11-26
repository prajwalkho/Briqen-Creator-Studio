import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Search } from 'lucide-react';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { UserActivityTimeline } from '../../components/admin/UserActivityTimeline';
import { listAdminActivities } from '../../services/adminService';
import type { AdminActivityLogItem, PaginationInfo } from '../../types/admin';

export const AdminActivityLogsPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [activityType, setActivityType] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<AdminActivityLogItem[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 30,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listAdminActivities({
        search: search.trim() || undefined,
        activityType: activityType || undefined,
        page,
        limit: 30,
      });
      setItems(res.items);
      setPagination(res.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load activity feed.');
    } finally {
      setLoading(false);
    }
  }, [activityType, page, search]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return (
    <AdminLayout
      title="User Activity Feed"
      subtitle="Platform-wide timeline of authentication, project creation, scripts, AI jobs, and exports"
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search activity description or user email..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-xs"
            />
          </div>

          <select
            aria-label="Filter by activity type"
            value={activityType}
            onChange={(e) => {
              setActivityType(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-xs"
          >
            <option value="">All Activity Types</option>
            <option value="login">Login</option>
            <option value="logout">Logout</option>
            <option value="register">Registration</option>
            <option value="project_create">Project Created</option>
            <option value="script_create">Script Created</option>
            <option value="script_generate">AI Script Generated</option>
            <option value="ai_generation">AI Media Generated</option>
            <option value="export_create">Video Export</option>
            <option value="avatar_upload">Avatar Upload</option>
            <option value="password_change">Password Change</option>
            <option value="account_ban">Account Ban</option>
            <option value="account_unban">Account Unban</option>
            <option value="role_change">Role Change</option>
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
        ) : (
          <UserActivityTimeline activities={items} showUserInfo />
        )}

        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span className="tabular-nums">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} events)
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
