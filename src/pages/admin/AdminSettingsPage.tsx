import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Crown, KeyRound, Lock, Shield, X } from 'lucide-react';
import { isSuperAdminClient } from '../../components/ProtectedRoute';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { formatRoleName, normalizeRoleClient } from '../../components/admin/adminUtils';
import { useAuth } from '../../context/AuthContext';
import { getAdminDashboardStats } from '../../services/adminService';
import type { AdminDashboardStats } from '../../types/admin';

const PERMISSION_ROWS: Array<{
  capability: string;
  super_admin: string;
  admin: string;
  user: string;
}> = [
  {
    capability: 'Access Owner Console, System Settings & Complete Audit Trail',
    super_admin: 'Full',
    admin: 'Denied',
    user: 'Denied',
  },
  {
    capability: 'Create / Suspend / Demote Admins & Assign Granular Permissions',
    super_admin: 'Full',
    admin: 'Denied',
    user: 'Denied',
  },
  {
    capability: 'Change User Roles & Permanent Account Purge',
    super_admin: 'Full',
    admin: 'Denied',
    user: 'Denied',
  },
  {
    capability: 'Inspect / Create / Edit / Ban / Unban / Soft-Delete Regular Users',
    super_admin: 'Full',
    admin: 'If Permitted',
    user: 'Denied',
  },
  {
    capability: 'Inspect User Projects, Scripts, Scenes, Assets & Retry Failed AI Jobs',
    super_admin: 'Full',
    admin: 'If Permitted',
    user: 'Own Only',
  },
  {
    capability: 'View Credits & Estimated AI Operating Cost Analytics',
    super_admin: 'Full',
    admin: 'If Permitted',
    user: 'Own Only',
  },
];

export const AdminSettingsPage: React.FC = () => {
  const { profile, demoLoginEnabled } = useAuth();
  const actorRole = normalizeRoleClient(profile?.role);
  const isSuperAdmin = isSuperAdminClient(profile?.role);
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);

  useEffect(() => {
    void getAdminDashboardStats().then(setStats).catch(() => {});
  }, []);

  const grantedPermissions = profile?.permissions || [];

  return (
    <AdminLayout
      title="Admin Governance & RBAC"
      subtitle="3-tier role architecture, database-backed Admin permissions, and security enforcement status"
      actions={
        isSuperAdmin ? (
          <Link
            to="/owner/permissions"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold"
          >
            <Crown className="h-3.5 w-3.5" />
            <span>Configure Permissions</span>
          </Link>
        ) : undefined
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-5 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white">
              <Shield className="h-4 w-4 text-amber-500" />
              <span>Your Active Role</span>
            </div>
            <p className="font-display text-xl font-bold text-slate-900 dark:text-white">
              {formatRoleName(actorRole)}
            </p>
            <p className="text-[11px] text-slate-500">
              Enforced server-side on every <code>/api/v1/admin/*</code> and <code>/api/v1/owner/*</code> route.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-5 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white">
              <Lock className="h-4 w-4 text-violet-500" />
              <span>Demo Authentication Guard</span>
            </div>
            <p className="font-display text-xl font-bold text-slate-900 dark:text-white">
              {demoLoginEnabled ? 'Enabled (Non-Prod)' : 'Disabled'}
            </p>
            <p className="text-[11px] text-slate-500">
              Automatically rejected when <code>NODE_ENV=production</code>.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-5 space-y-1.5">
            <p className="text-xs font-semibold text-slate-900 dark:text-white">
              Seeded Demo Accounts
            </p>
            <p className="font-display text-xl font-bold tabular-nums text-slate-900 dark:text-white">
              {stats ? `${stats.demoAccountsTotal} / 27` : '—'}
            </p>
            <p className="text-[11px] text-slate-500 tabular-nums">
              {stats
                ? `${stats.demoSuperAdmins} Super Admin · ${stats.demoAdmins} Admin · ${stats.demoRegularUsers} Users`
                : 'Loading breakdown...'}
            </p>
          </div>
        </div>

        {/* Signed-in Admin's DB-backed Permissions */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-amber-500" />
              <span>Your Active Permissions ({isSuperAdmin ? 'All 20' : grantedPermissions.length})</span>
            </h2>
          </div>
          {grantedPermissions.length === 0 ? (
            <p className="text-xs text-slate-500">
              No operational permissions assigned to this Admin account yet. Contact the Platform Owner.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {grantedPermissions.map((perm) => (
                <span
                  key={perm}
                  className="px-2.5 py-1 rounded-md border border-amber-500/30 bg-amber-500/10 font-mono text-[11px] text-amber-800 dark:text-amber-300"
                >
                  {perm}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              3-Tier Role-Based Access Control Matrix
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0E1118] text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Capability</th>
                  <th className="py-3 px-3 text-center">Super Admin (Owner)</th>
                  <th className="py-3 px-3 text-center">Admin (Worker)</th>
                  <th className="py-3 px-3 text-center">Regular User</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {PERMISSION_ROWS.map((row) => (
                  <tr key={row.capability}>
                    <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">
                      {row.capability}
                    </td>
                    {(['super_admin', 'admin', 'user'] as const).map((col) => {
                      const val = row[col];
                      return (
                        <td key={col} className="py-3 px-3 text-center">
                          {val === 'Full' ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                              <Check className="h-3.5 w-3.5" />
                              Full
                            </span>
                          ) : val === 'Denied' ? (
                            <span className="inline-flex items-center gap-1 text-slate-400">
                              <X className="h-3.5 w-3.5" />
                              Denied
                            </span>
                          ) : (
                            <span className="font-mono text-[11px] text-amber-700 dark:text-amber-300">
                              {val}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};
