import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Crown,
  Database,
  Download,
  Film,
  FlaskConical,
  KeyRound,
  Loader2,
  RefreshCw,
  RotateCw,
  Shield,
  Sparkles,
  Users,
} from 'lucide-react';
import { hasClientPermission, isSuperAdminClient } from '../../components/ProtectedRoute';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { UserActivityTimeline } from '../../components/admin/UserActivityTimeline';
import {
  formatAdminDateTime,
  formatRoleName,
  roleBadgeClasses,
  statusDotClasses,
} from '../../components/admin/adminUtils';
import { useAuth } from '../../context/AuthContext';
import {
  downloadAdminOperationalReportCsv,
  getAdminDashboardStats,
  getAdminRegistrationTrends,
  listAdminProjects,
  retryAdminGenerationJob,
  updateAdminProject,
} from '../../services/adminService';
import type { AdminDashboardStats } from '../../types/admin';

export const AdminDashboardPage: React.FC = () => {
  const { profile } = useAuth();
  const isSuperAdmin = isSuperAdminClient(profile?.role);
  const canViewAnalytics = hasClientPermission(profile, 'analytics.operational.view');
  const canViewProjects = hasClientPermission(profile, 'projects.view');
  const canManageProjects = hasClientPermission(profile, 'projects.manage');
  const canRetryJobs = hasClientPermission(profile, 'generations.retry');
  const canExportReports = hasClientPermission(profile, 'reports.export');

  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [trends, setTrends] = useState<Array<{ day: string; count: number }>>([]);
  const [opProjects, setOpProjects] = useState<
    Array<{
      id: string;
      userId: string;
      userEmail: string;
      userFullName: string | null;
      title: string;
      platform: string;
      aspectRatio: string;
      status: string;
      createdAt: string;
      updatedAt: string;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);
  const [updatingProjectId, setUpdatingProjectId] = useState<string | null>(null);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!canViewAnalytics) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [s, t, proj] = await Promise.all([
        getAdminDashboardStats(),
        getAdminRegistrationTrends(14),
        canViewProjects ? listAdminProjects({ page: 1, limit: 6 }) : Promise.resolve(null),
      ]);
      setStats(s);
      setTrends(t);
      if (proj) setOpProjects(proj.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin overview.');
    } finally {
      setLoading(false);
    }
  }, [canViewAnalytics, canViewProjects]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleRetryJob = async (jobId: string) => {
    setRetryingJobId(jobId);
    setError(null);
    try {
      const msg = await retryAdminGenerationJob(jobId);
      setNotice(msg);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retry generation job.');
    } finally {
      setRetryingJobId(null);
    }
  };

  const handleProjectStatus = async (
    projectId: string,
    status: 'draft' | 'processing' | 'completed' | 'failed'
  ) => {
    setUpdatingProjectId(projectId);
    setError(null);
    try {
      const msg = await updateAdminProject(projectId, { status });
      setNotice(msg);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update project status.');
    } finally {
      setUpdatingProjectId(null);
    }
  };

  const handleExportCsv = async () => {
    setExportingCsv(true);
    setError(null);
    try {
      await downloadAdminOperationalReportCsv();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export operational CSV.');
    } finally {
      setExportingCsv(false);
    }
  };

  const maxTrend = Math.max(1, ...trends.map((d) => d.count));
  const grantedPermissions = profile?.permissions || [];

  return (
    <AdminLayout
      title="Admin Operations Overview"
      subtitle="Scoped operational telemetry, user governance, failed job triage, and project support"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {isSuperAdmin && (
            <Link
              to="/owner"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold"
            >
              <Crown className="h-3.5 w-3.5" />
              <span>Owner Console</span>
            </Link>
          )}
          {canExportReports && (
            <button
              type="button"
              disabled={exportingCsv}
              onClick={() => void handleExportCsv()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{exportingCsv ? 'Exporting...' : 'Operational CSV'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => void loadData()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      }
    >
      {/* Active Worker Permission Notice Card */}
      <div className="mb-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white">
            <KeyRound className="h-4 w-4 text-amber-500" />
            <span>
              {isSuperAdmin
                ? 'Platform Owner Scope (All 20 Capabilities)'
                : `Worker Admin Scope (${grantedPermissions.length} Granted Permissions)`}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {isSuperAdmin
              ? 'You can manage Admins, permissions, billing telemetry, and system settings from the Owner Console.'
              : 'Worker Admins operate strictly on regular user accounts. Admin/Owner governance and system settings remain Owner-exclusive.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 max-w-xl">
          {(isSuperAdmin ? ['super_admin:unrestricted'] : grantedPermissions.slice(0, 8)).map((p) => (
            <span
              key={p}
              className="px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] font-mono text-[10px] text-slate-700 dark:text-slate-300"
            >
              {p}
            </span>
          ))}
          {!isSuperAdmin && grantedPermissions.length > 8 && (
            <Link
              to="/admin/settings"
              className="px-2 py-0.5 rounded-md border border-amber-500/30 bg-amber-500/10 font-mono text-[10px] text-amber-700 dark:text-amber-300"
            >
              +{grantedPermissions.length - 8} more
            </Link>
          )}
        </div>
      </div>

      {notice && (
        <div className="mb-5 p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="underline text-[11px]">
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {!canViewAnalytics ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 text-xs text-amber-900 dark:text-amber-200">
          Operational dashboard telemetry requires the <code className="font-mono">analytics.operational.view</code> permission. Use the navigation sidebar to access your granted tools.
        </div>
      ) : loading && !stats ? (
        <div className="py-20 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
        </div>
      ) : stats ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-4">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Total Accounts</span>
                <Users className="h-4 w-4 text-amber-500" />
              </div>
              <p className="mt-2 font-display text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                {stats.totalUsers}
              </p>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                {stats.activeUsers} active · {stats.bannedUsers} banned · {stats.deletedUsers} deleted
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-4">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Demo vs Real Users</span>
                <FlaskConical className="h-4 w-4 text-violet-500" />
              </div>
              <p className="mt-2 font-display text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                {stats.demoAccountsTotal} Demo
              </p>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                {stats.realUsersTotal} standard accounts ·{' '}
                {stats.demoModeEnabled ? 'Demo login ON' : 'Demo login OFF'}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-4">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Projects & Scripts</span>
                <Film className="h-4 w-4 text-sky-500" />
              </div>
              <p className="mt-2 font-display text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                {stats.totalProjects} Projects
              </p>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                {stats.totalScripts} script revisions · {stats.totalScenes} scenes
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-4">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>AI Jobs & Exports</span>
                <Sparkles className="h-4 w-4 text-emerald-500" />
              </div>
              <p className="mt-2 font-display text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                {stats.totalImageGenerations +
                  stats.totalVideoGenerations +
                  stats.totalAudioGenerations}{' '}
                Jobs
              </p>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                {stats.totalAssets} assets · {stats.totalExports} exports · {stats.failedJobs} failed
              </p>
            </div>
          </div>

          {/* Role Distribution (3 canonical roles) + Seeded Demo Cohort + Media */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Shield className="h-4 w-4 text-amber-500" />
                  <span>Role Distribution</span>
                </h2>
                {hasClientPermission(profile, 'users.view') && (
                  <Link
                    to="/admin/users"
                    className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline"
                  >
                    View directory
                  </Link>
                )}
              </div>
              <div className="space-y-2.5 text-xs">
                {(
                  [
                    ['super_admin', 'Super Admin', stats.roleBreakdown.super_admin],
                    ['admin', 'Admin', stats.roleBreakdown.admin],
                    ['user', 'Regular User', stats.roleBreakdown.user],
                  ] as const
                ).map(([roleKey, label, count]) => (
                  <div
                    key={roleKey}
                    className="flex items-center justify-between px-3 py-2 rounded-lg border border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-[#0B0D12]"
                  >
                    <span
                      className={`px-2 py-0.5 rounded-md border text-[11px] font-medium ${roleBadgeClasses(
                        roleKey
                      )}`}
                    >
                      {label}
                    </span>
                    <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Database className="h-4 w-4 text-violet-500" />
                  <span>Seeded Demo Cohort</span>
                </h2>
                {hasClientPermission(profile, 'users.view') && (
                  <Link
                    to="/admin/users?status=demo"
                    className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline"
                  >
                    Filter demo users
                  </Link>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="p-3 rounded-lg border border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-[#0B0D12]">
                  <p className="text-[11px] text-slate-500">Super Admins</p>
                  <p className="font-display text-lg font-bold tabular-nums mt-0.5">
                    {stats.demoSuperAdmins} / 2
                  </p>
                </div>
                <div className="p-3 rounded-lg border border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-[#0B0D12]">
                  <p className="text-[11px] text-slate-500">Admins</p>
                  <p className="font-display text-lg font-bold tabular-nums mt-0.5">
                    {stats.demoAdmins} / 5
                  </p>
                </div>
                <div className="p-3 rounded-lg border border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-[#0B0D12]">
                  <p className="text-[11px] text-slate-500">Regular Users</p>
                  <p className="font-display text-lg font-bold tabular-nums mt-0.5">
                    {stats.demoRegularUsers} / 20
                  </p>
                </div>
                <div className="p-3 rounded-lg border border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-[#0B0D12]">
                  <p className="text-[11px] text-slate-500">Verified Accounts</p>
                  <p className="font-display text-lg font-bold tabular-nums mt-0.5">
                    {stats.verifiedUsers} / {stats.totalUsers}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-5 space-y-3">
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Media & Registration Activity
              </h2>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2.5 rounded-lg border border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-[#0B0D12]">
                  <p className="text-[11px] text-slate-500">Images</p>
                  <p className="font-mono font-bold tabular-nums text-sm mt-0.5">
                    {stats.totalImageGenerations}
                  </p>
                </div>
                <div className="p-2.5 rounded-lg border border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-[#0B0D12]">
                  <p className="text-[11px] text-slate-500">Videos</p>
                  <p className="font-mono font-bold tabular-nums text-sm mt-0.5">
                    {stats.totalVideoGenerations}
                  </p>
                </div>
                <div className="p-2.5 rounded-lg border border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-[#0B0D12]">
                  <p className="text-[11px] text-slate-500">Audio</p>
                  <p className="font-mono font-bold tabular-nums text-sm mt-0.5">
                    {stats.totalAudioGenerations}
                  </p>
                </div>
              </div>

              <div className="pt-1">
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
                  Recent Signups (14 days)
                </p>
                {trends.length === 0 ? (
                  <p className="text-xs text-slate-400">No registration buckets yet.</p>
                ) : (
                  <div className="flex items-end gap-1.5 h-16">
                    {trends.slice(-14).map((bucket) => (
                      <div
                        key={bucket.day}
                        title={`${bucket.day}: ${bucket.count} accounts`}
                        className="flex-1 bg-amber-500/80 dark:bg-amber-400/80 rounded-t-sm min-h-[4px]"
                        style={{
                          height: `${Math.max(8, Math.round((bucket.count / maxTrend) * 100))}%`,
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Recent Registrations & Failed Jobs (with Retry button) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                  Recent Registrations
                </h2>
                {hasClientPermission(profile, 'users.view') && (
                  <Link
                    to="/admin/users"
                    className="text-xs text-amber-600 dark:text-amber-400 hover:underline"
                  >
                    All users
                  </Link>
                )}
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                {stats.recentRegistrations.slice(0, 6).map((u) => {
                  const statusMeta = statusDotClasses(u.accountStatus);
                  return (
                    <Link
                      key={u.id}
                      to={`/admin/users/${u.id}`}
                      className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900 dark:text-white truncate">
                            {u.fullName || u.email}
                          </span>
                          {u.isDemoAccount && (
                            <span className="px-1.5 py-0.5 rounded-md border border-violet-500/30 bg-violet-500/10 text-[10px] font-mono text-violet-700 dark:text-violet-300">
                              Demo
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 truncate">
                          {u.email} · {formatRoleName(u.role)}
                        </p>
                      </div>
                      <span className={`inline-flex items-center gap-1.5 shrink-0 ${statusMeta.text}`}>
                        <span className={`h-2 w-2 rounded-full ${statusMeta.dot}`} />
                        <span>{statusMeta.label}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                  <span>Failed Jobs & Recent Bans</span>
                </h2>
                {hasClientPermission(profile, 'users.view') && (
                  <Link
                    to="/admin/bans"
                    className="text-xs text-amber-600 dark:text-amber-400 hover:underline"
                  >
                    Ban center
                  </Link>
                )}
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                {stats.recentBans.length === 0 && stats.recentFailedJobs.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 dark:text-slate-400 flex flex-col items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    <span>No active moderation bans or failed background jobs.</span>
                  </div>
                ) : (
                  <>
                    {stats.recentBans.slice(0, 3).map((b) => (
                      <div key={b.id} className="px-5 py-3 flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <Ban className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 dark:text-white truncate">
                              {b.targetName || b.targetEmail || b.userId} ({b.action})
                            </p>
                            <p className="text-[11px] text-slate-500 truncate">{b.reason}</p>
                          </div>
                        </div>
                        <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                          {formatAdminDateTime(b.createdAt)}
                        </span>
                      </div>
                    ))}
                    {stats.recentFailedJobs.slice(0, 4).map((j) => (
                      <div key={j.id} className="px-5 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 dark:text-white truncate">
                            Job failed · {j.provider} ({j.mediaType || 'media'})
                          </p>
                          <p className="text-[11px] text-red-500 truncate">
                            {j.userEmail || j.userId} · {j.errorMessage || 'Worker error'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {canRetryJobs && (
                            <button
                              type="button"
                              disabled={retryingJobId === j.id}
                              onClick={() => void handleRetryJob(j.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-amber-500/30 bg-amber-500/10 text-[11px] font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
                            >
                              <RotateCw
                                className={`h-3 w-3 ${retryingJobId === j.id ? 'animate-spin' : ''}`}
                              />
                              <span>Retry</span>
                            </button>
                          )}
                          <span className="text-[11px] text-slate-400 tabular-nums">
                            {formatAdminDateTime(j.createdAt)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Operational Projects Section (scoped to Regular Users for Worker Admins) */}
          {canViewProjects && opProjects.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                  Recent User Projects (Operational Queue)
                </h2>
                <span className="text-[11px] text-slate-500">
                  {canManageProjects ? 'Status moderation enabled' : 'Read-only inspection'}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0E1118] text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      <th className="py-2.5 px-4">Project</th>
                      <th className="py-2.5 px-3">Creator</th>
                      <th className="py-2.5 px-3">Platform</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-4 text-right">Updated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {opProjects.map((p) => (
                      <tr key={p.id}>
                        <td className="py-2.5 px-4 font-semibold text-slate-900 dark:text-white">
                          {p.title}
                        </td>
                        <td className="py-2.5 px-3">
                          <Link
                            to={`/admin/users/${p.userId}`}
                            className="text-amber-700 dark:text-amber-400 hover:underline"
                          >
                            {p.userFullName || p.userEmail}
                          </Link>
                        </td>
                        <td className="py-2.5 px-3">
                          {p.platform} · <span className="font-mono">{p.aspectRatio}</span>
                        </td>
                        <td className="py-2.5 px-3">
                          {canManageProjects ? (
                            <select
                              aria-label={`Status for ${p.title}`}
                              disabled={updatingProjectId === p.id}
                              value={p.status}
                              onChange={(e) =>
                                void handleProjectStatus(
                                  p.id,
                                  e.target.value as 'draft' | 'processing' | 'completed' | 'failed'
                                )
                              }
                              className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0D12] text-xs"
                            >
                              <option value="draft">draft</option>
                              <option value="processing">processing</option>
                              <option value="completed">completed</option>
                              <option value="failed">failed</option>
                            </select>
                          ) : (
                            <span className="font-mono capitalize">{p.status}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-500">
                          {formatAdminDateTime(p.updatedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Recent Activity Feed */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Recent Platform Activity
              </h2>
              <Link
                to="/admin/activities"
                className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline"
              >
                Full activity log
              </Link>
            </div>
            <UserActivityTimeline activities={stats.recentActivities.slice(0, 8)} showUserInfo />
          </div>
        </div>
      ) : null}
    </AdminLayout>
  );
};
