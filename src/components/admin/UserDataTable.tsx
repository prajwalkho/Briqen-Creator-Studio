import React from 'react';
import { Link } from 'react-router-dom';
import {
  Ban,
  CheckCircle2,
  Edit3,
  Eye,
  RotateCcw,
  Shield,
  Trash2,
} from 'lucide-react';
import type { AdminCanonicalRole, AdminUserListItem } from '../../types/admin';
import {
  formatAdminDate,
  formatRoleName,
  normalizeRoleClient,
  roleBadgeClasses,
  statusDotClasses,
} from './adminUtils';

interface UserDataTableProps {
  users: AdminUserListItem[];
  actorRole: AdminCanonicalRole;
  actorUserId?: string;
  canEditUsers?: boolean;
  canBanUsers?: boolean;
  canUnbanUsers?: boolean;
  canDeleteUsers?: boolean;
  onOpenBan: (user: AdminUserListItem) => void;
  onOpenUnban: (user: AdminUserListItem) => void;
  onOpenRole: (user: AdminUserListItem) => void;
  onOpenDelete: (user: AdminUserListItem) => void;
  onRestoreUser: (user: AdminUserListItem) => void;
}

export const UserDataTable: React.FC<UserDataTableProps> = ({
  users,
  actorRole,
  actorUserId,
  canEditUsers = true,
  canBanUsers = true,
  canUnbanUsers = true,
  canDeleteUsers = true,
  onOpenBan,
  onOpenUnban,
  onOpenRole,
  onOpenDelete,
  onRestoreUser,
}) => {
  const isSuperAdmin = actorRole === 'super_admin';

  const canModifyTarget = (target: AdminUserListItem): boolean => {
    const targetRole = normalizeRoleClient(target.role);
    if (actorRole === 'admin' && (targetRole === 'admin' || targetRole === 'super_admin')) {
      return false;
    }
    return true;
  };

  const canBanTarget = (target: AdminUserListItem): boolean => {
    if (target.id === actorUserId) return false;
    const targetRole = normalizeRoleClient(target.role);
    if (actorRole === 'admin' && (targetRole === 'admin' || targetRole === 'super_admin')) {
      return false;
    }
    return target.accountStatus !== 'deleted';
  };

  if (users.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-12 text-center">
        <p className="font-display text-sm font-semibold text-slate-900 dark:text-white">
          No matching accounts found
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Adjust your search query, role filter, or account status filter to view users.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0E1118] text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <th className="py-3 px-4">User</th>
              <th className="py-3 px-3">Role</th>
              <th className="py-3 px-3">Status</th>
              <th className="py-3 px-3">Verified</th>
              <th className="py-3 px-3 text-right">Projects</th>
              <th className="py-3 px-3 text-right">Scripts</th>
              <th className="py-3 px-3 text-right">Generations</th>
              <th className="py-3 px-3">Last Login</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
            {users.map((user) => {
              const statusMeta = statusDotClasses(user.accountStatus);
              const modifiable = canModifyTarget(user);
              const bannable = canBanTarget(user);
              const isBanned = user.accountStatus === 'banned';
              const isDeleted = user.accountStatus === 'deleted';
              const displayName = user.fullName || user.displayName || user.email.split('@')[0];

              return (
                <tr
                  key={user.id}
                  className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors"
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3 min-w-[220px]">
                      {user.avatarUrl ? (
                        <img
                          src={user.avatarUrl}
                          alt={displayName}
                          className="h-9 w-9 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                        />
                      ) : (
                        <div className="h-9 w-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center font-display text-xs font-bold text-amber-700 dark:text-amber-300 shrink-0">
                          {displayName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Link
                            to={`/admin/users/${user.id}`}
                            className="font-semibold text-slate-900 dark:text-white hover:text-amber-600 dark:hover:text-amber-400 truncate max-w-[170px]"
                          >
                            {displayName}
                          </Link>
                          {user.isDemoAccount && (
                            <span className="px-1.5 py-0.5 rounded-md border border-violet-500/30 bg-violet-500/10 text-[10px] font-mono font-medium text-violet-700 dark:text-violet-300">
                              Demo
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[220px]">
                          {user.email}
                          {user.username ? ` · @${user.username}` : ''}
                        </p>
                      </div>
                    </div>
                  </td>

                  <td className="py-3 px-3 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-medium ${roleBadgeClasses(
                        user.role
                      )}`}
                    >
                      {formatRoleName(user.role)}
                    </span>
                  </td>

                  <td className="py-3 px-3 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1.5 font-medium ${statusMeta.text}`}>
                      <span className={`h-2 w-2 rounded-full ${statusMeta.dot}`} />
                      <span>{statusMeta.label}</span>
                    </span>
                  </td>

                  <td className="py-3 px-3 whitespace-nowrap">
                    {user.isVerified ? (
                      <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                        Verified
                      </span>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500">Unverified</span>
                    )}
                  </td>

                  <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                    {user.projectCount}
                  </td>

                  <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                    {user.scriptCount}
                  </td>

                  <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                    {user.generationCount}
                  </td>

                  <td className="py-3 px-3 whitespace-nowrap tabular-nums text-slate-500 dark:text-slate-400">
                    {formatAdminDate(user.lastLoginAt)}
                  </td>

                  <td className="py-3 px-4 whitespace-nowrap text-right">
                    <div className="inline-flex items-center justify-end gap-1">
                      <Link
                        to={`/admin/users/${user.id}`}
                        title="Inspect user details"
                        className="p-1.5 rounded-md border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Link>

                      {modifiable && canEditUsers && !isDeleted && (
                        <Link
                          to={`/admin/users/${user.id}/edit`}
                          title="Edit account"
                          className="p-1.5 rounded-md border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </Link>
                      )}

                      {isSuperAdmin && user.id !== actorUserId && !isDeleted && (
                        <button
                          type="button"
                          onClick={() => onOpenRole(user)}
                          title="Manage role"
                          className="p-1.5 rounded-md border border-slate-200 dark:border-slate-800 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                        >
                          <Shield className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {bannable && canBanUsers && !isBanned && (
                        <button
                          type="button"
                          onClick={() => onOpenBan(user)}
                          title="Ban account"
                          className="p-1.5 rounded-md border border-slate-200 dark:border-slate-800 text-red-600 dark:text-red-400 hover:bg-red-500/10"
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {bannable && canUnbanUsers && isBanned && (
                        <button
                          type="button"
                          onClick={() => onOpenUnban(user)}
                          title="Unban account"
                          className="p-1.5 rounded-md border border-slate-200 dark:border-slate-800 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {modifiable && canDeleteUsers && isDeleted && (
                        <button
                          type="button"
                          onClick={() => onRestoreUser(user)}
                          title="Restore deleted account"
                          className="p-1.5 rounded-md border border-slate-200 dark:border-slate-800 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {modifiable && canDeleteUsers && user.id !== actorUserId && (
                        <button
                          type="button"
                          onClick={() => onOpenDelete(user)}
                          title="Delete account"
                          className="p-1.5 rounded-md border border-slate-200 dark:border-slate-800 text-red-600 dark:text-red-400 hover:bg-red-500/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
