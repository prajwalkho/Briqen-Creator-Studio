import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Download, Loader2, Search, UserPlus } from 'lucide-react';
import { hasClientPermission } from '../../components/ProtectedRoute';
import { AddUserModal } from '../../components/admin/AddUserModal';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { BanUserModal } from '../../components/admin/BanUserModal';
import { DeleteUserConfirmation } from '../../components/admin/DeleteUserConfirmation';
import { RoleManagementModal } from '../../components/admin/RoleManagementModal';
import { UnbanUserModal } from '../../components/admin/UnbanUserModal';
import { UserDataTable } from '../../components/admin/UserDataTable';
import { normalizeRoleClient } from '../../components/admin/adminUtils';
import { useAuth } from '../../context/AuthContext';
import {
  downloadAdminOperationalReportCsv,
  listAdminUsers,
  restoreAdminUser,
} from '../../services/adminService';
import type { AdminUserListItem, PaginationInfo } from '../../types/admin';
import type { UserProfile } from '../../types/studio';

export const AdminUsersPage: React.FC = () => {
  const { profile } = useAuth();
  const actorRole = normalizeRoleClient(profile?.role);
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all');
  const [roleFilter, setRoleFilter] = useState(searchParams.get('role') || 'all');
  const [sort, setSort] = useState(searchParams.get('sort') || 'newest');
  const [page, setPage] = useState(Number(searchParams.get('page') || 1));

  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [banTarget, setBanTarget] = useState<AdminUserListItem | null>(null);
  const [unbanTarget, setUnbanTarget] = useState<AdminUserListItem | null>(null);
  const [roleTarget, setRoleTarget] = useState<AdminUserListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUserListItem | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listAdminUsers({
        search: search.trim() || undefined,
        status: statusFilter,
        role: roleFilter,
        sort,
        page,
        limit: 20,
      });
      setUsers(data.items);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load user directory.');
    } finally {
      setLoading(false);
    }
  }, [page, roleFilter, search, sort, statusFilter]);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (search.trim()) next.set('search', search.trim());
    if (statusFilter !== 'all') next.set('status', statusFilter);
    if (roleFilter !== 'all') next.set('role', roleFilter);
    if (sort !== 'newest') next.set('sort', sort);
    if (page > 1) next.set('page', String(page));
    setSearchParams(next, { replace: true });
  }, [page, roleFilter, search, setSearchParams, sort, statusFilter]);

  const handleUserPatched = (updated: UserProfile, message: string) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u))
    );
    setToast(message);
  };

  const handleRestore = async (target: AdminUserListItem) => {
    try {
      const res = await restoreAdminUser(target.id);
      handleUserPatched(res.user, res.message);
      void fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore account.');
    }
  };

  return (
    <AdminLayout
      title="User Management"
      subtitle="Search, filter, inspect, edit, verify, ban, or manage roles across all accounts"
      actions={
        actorRole !== 'moderator' ? (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold transition-colors"
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span>Add User</span>
          </button>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {toast && (
          <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
            <span>{toast}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="text-[11px] font-medium underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {error && (
          <div className="p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Filter Bar */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-4 flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by full name, username, or email..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-xs text-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="flex flex-wrap gap-2.5">
            <select
              aria-label="Filter by account status or cohort"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-xs"
            >
              <option value="all">All Statuses</option>
              <option value="demo">Demo Accounts Only</option>
              <option value="real">Real Users Only</option>
              <option value="active">Active</option>
              <option value="banned">Banned</option>
              <option value="suspended">Suspended</option>
              <option value="deleted">Soft Deleted</option>
              <option value="verified">Email Verified</option>
              <option value="unverified">Email Unverified</option>
            </select>

            <select
              aria-label="Filter by role"
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-xs"
            >
              <option value="all">All Roles</option>
              <option value="super_admin">Super Admin</option>
              <option value="admin">Admin</option>
              <option value="moderator">Moderator</option>
              <option value="user">Regular User</option>
            </select>

            <select
              aria-label="Sort users"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-xs"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="last_login">Last Login</option>
              <option value="name">Name (A-Z)</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="py-16 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
          </div>
        ) : (
          <UserDataTable
            users={users}
            actorRole={actorRole}
            actorUserId={profile?.id}
            onOpenBan={(u) => setBanTarget(u)}
            onOpenUnban={(u) => setUnbanTarget(u)}
            onOpenRole={(u) => setRoleTarget(u)}
            onOpenDelete={(u) => setDeleteTarget(u)}
            onRestoreUser={(u) => void handleRestore(u)}
          />
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span className="tabular-nums">
            Showing page {pagination.page} of {pagination.totalPages} ({pagination.total} accounts)
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Previous</span>
            </button>
            <button
              type="button"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <span>Next</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {showAdd && (
        <AddUserModal
          actorRole={actorRole}
          onClose={() => setShowAdd(false)}
          onCreated={(_u, message) => {
            setShowAdd(false);
            setToast(message);
            void fetchUsers();
          }}
        />
      )}

      {banTarget && (
        <BanUserModal
          user={banTarget}
          onClose={() => setBanTarget(null)}
          onSuccess={(updated, message) => {
            setBanTarget(null);
            handleUserPatched(updated, message);
          }}
        />
      )}

      {unbanTarget && (
        <UnbanUserModal
          user={unbanTarget}
          onClose={() => setUnbanTarget(null)}
          onSuccess={(updated, message) => {
            setUnbanTarget(null);
            handleUserPatched(updated, message);
          }}
        />
      )}

      {roleTarget && (
        <RoleManagementModal
          user={roleTarget}
          actorRole={actorRole}
          onClose={() => setRoleTarget(null)}
          onSuccess={(updated, message) => {
            setRoleTarget(null);
            handleUserPatched(updated, message);
          }}
        />
      )}

      {deleteTarget && (
        <DeleteUserConfirmation
          user={deleteTarget}
          actorRole={actorRole}
          onClose={() => setDeleteTarget(null)}
          onDeleted={(mode, message, updated) => {
            setDeleteTarget(null);
            setToast(message);
            if (mode === 'permanent') {
              setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
            } else if (updated) {
              handleUserPatched(updated, message);
            }
            void fetchUsers();
          }}
        />
      )}
    </AdminLayout>
  );
};
