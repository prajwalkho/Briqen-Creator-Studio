import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  CheckCircle2,
  Coins,
  Database,
  Download,
  Film,
  FlaskConical,
  HardDrive,
  Loader2,
  RefreshCw,
  Shield,
  Sparkles,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  ChartCard,
  ComparisonBarChart,
  DistributionDonutChart,
  TrendLineChart,
} from '../../components/analytics/Charts';
import {
  formatAdminDateTime,
  formatFileSize,
  formatRoleName,
  statusDotClasses,
} from '../../components/admin/adminUtils';
import { OwnerLayout } from '../../layouts/OwnerLayout';
import {
  downloadOwnerAnalyticsCsv,
  getOwnerAnalytics,
  getOwnerOverview,
  type AnalyticsGranularity,
  type AnalyticsRange,
  type OwnerAnalyticsResponse,
  type OwnerOverviewStats,
} from '../../services/ownerService';

export const OwnerDashboard: React.FC = () => {
  const [range, setRange] = useState<AnalyticsRange>('30d');
  const [granularity, setGranularity] = useState<AnalyticsGranularity>('daily');
  const [overview, setOverview] = useState<OwnerOverviewStats | null>(null);
  const [analytics, setAnalytics] = useState<OwnerAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportingType, setExportingType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, an] = await Promise.all([
        getOwnerOverview(),
        getOwnerAnalytics({ range, granularity }),
      ]);
      setOverview(ov);
      setAnalytics(an);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Owner telemetry.');
    } finally {
      setLoading(false);
    }
  }, [granularity, range]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleExport = async (type: 'overview' | 'users' | 'projects' | 'ai' | 'financial') => {
    setExportingType(type);
    try {
      await downloadOwnerAnalyticsCsv({ type, range, granularity });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export CSV.');
    } finally {
      setExportingType(null);
    }
  };

  const userGrowthMerged = (analytics?.users.registrationTrend || []).map((r) => {
    const act = analytics?.users.activityTrend.find((a) => a.period === r.period);
    return {
      label: r.period,
      registrations: r.count,
      activities: act?.count ?? 0,
    };
  });

  return (
    <OwnerLayout
      title="Platform Owner Command Center"
      subtitle="Live SQL analytics across accounts, projects, AI generations, media storage, and credits"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Analytics time range"
            value={range}
            onChange={(e) => setRange(e.target.value as AnalyticsRange)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] text-xs font-medium"
          >
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
            <option value="365d">Last 365 Days</option>
            <option value="all">All Time</option>
          </select>

          <select
            aria-label="Analytics granularity"
            value={granularity}
            onChange={(e) => setGranularity(e.target.value as AnalyticsGranularity)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] text-xs font-medium"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>

          <button
            type="button"
            disabled={exportingType !== null}
            onClick={() => void handleExport('overview')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold disabled:opacity-60"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{exportingType === 'overview' ? 'Exporting...' : 'Export CSV'}</span>
          </button>

          <button
            type="button"
            onClick={() => void loadData()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      }
    >
      {error && (
        <div className="mb-6 p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {loading && !overview ? (
        <div className="py-24 flex items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-amber-500" />
        </div>
      ) : overview && analytics ? (
        <div className="space-y-6">
          {/* Primary KPI Matrix (20+ real metrics) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-4">
              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <span>Total Users</span>
                <Users className="h-3.5 w-3.5 text-amber-500" />
              </div>
              <p className="mt-1.5 font-display text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                {overview.totalUsers}
              </p>
              <p className="mt-1 text-[11px] text-slate-500 tabular-nums">
                {overview.activeUsers} active · {overview.bannedUsers} banned · {overview.deletedUsers} deleted
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-4">
              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <span>Roles & Verification</span>
                <Shield className="h-3.5 w-3.5 text-sky-500" />
              </div>
              <p className="mt-1.5 font-display text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                {overview.totalAdmins} Admins
              </p>
              <p className="mt-1 text-[11px] text-slate-500 tabular-nums">
                {overview.totalSuperAdmins} owners · {overview.verifiedUsers} verified · {overview.unverifiedUsers} unverified
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-4">
              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <span>Demo vs Real</span>
                <FlaskConical className="h-3.5 w-3.5 text-violet-500" />
              </div>
              <p className="mt-1.5 font-display text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                {overview.realUsers} Real
              </p>
              <p className="mt-1 text-[11px] text-slate-500 tabular-nums">
                {overview.demoUsers} demo · {overview.suspendedUsers} suspended
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-4">
              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <span>Projects & Scripts</span>
                <Film className="h-3.5 w-3.5 text-emerald-500" />
              </div>
              <p className="mt-1.5 font-display text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                {overview.totalProjects}
              </p>
              <p className="mt-1 text-[11px] text-slate-500 tabular-nums">
                {overview.totalScripts} scripts · {overview.totalScenes} scenes · {analytics.projects.completionRatePct}% done
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-4">
              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <span>AI Jobs & Exports</span>
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              </div>
              <p className="mt-1.5 font-display text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                {overview.totalGenerations}
              </p>
              <p className="mt-1 text-[11px] text-slate-500 tabular-nums">
                {overview.succeededJobs} ok · {overview.failedJobs} failed · {overview.totalExports} exports
              </p>
            </div>
          </div>

          {/* Secondary Metric Strip: Storage, Media Split, Retention & Credits */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-4">
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Media Breakdown</span>
                <Database className="h-3.5 w-3.5 text-sky-500" />
              </div>
              <p className="mt-1.5 font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
                {overview.imageGenerations} img · {overview.videoGenerations} vid · {overview.audioGenerations} aud
              </p>
              <p className="mt-1 text-[11px] text-slate-500 tabular-nums">
                {overview.activeJobs} active jobs · {overview.completedExports} completed exports
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-4">
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Media Storage</span>
                <HardDrive className="h-3.5 w-3.5 text-violet-500" />
              </div>
              <p className="mt-1.5 font-display text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                {formatFileSize(overview.totalStorageBytes)}
              </p>
              <p className="mt-1 text-[11px] text-slate-500 tabular-nums">
                Across {overview.totalAssets} stored media assets
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-4">
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Active User Retention</span>
                <UserCheck className="h-3.5 w-3.5 text-emerald-500" />
              </div>
              <p className="mt-1.5 font-display text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                {analytics.users.retention.retention7dPct}% (7d) · {analytics.users.retention.retention30dPct}% (30d)
              </p>
              <p className="mt-1 text-[11px] text-slate-500 tabular-nums">
                {analytics.users.retention.activeLast7d} / {analytics.users.retention.totalActiveAccounts} active last 7d
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-4">
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Credits & Est. AI Cost</span>
                <Coins className="h-3.5 w-3.5 text-amber-500" />
              </div>
              <p className="mt-1.5 font-display text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                {overview.totalCreditsSettled.toLocaleString()} cr settled
              </p>
              <p className="mt-1 text-[11px] text-slate-500 tabular-nums">
                Est. AI cost: ${overview.estimatedAiCostUsd.toFixed(4)} · Billing: Not connected
              </p>
            </div>
          </div>

          {/* Primary Trend Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <ChartCard
              title="User Growth & Platform Activity"
              subtitle={`New account registrations vs logged user activities (${range}, ${granularity})`}
              empty={userGrowthMerged.length === 0}
              rightSlot={
                <button
                  type="button"
                  onClick={() => void handleExport('users')}
                  className="text-[11px] font-medium text-amber-600 dark:text-amber-400 hover:underline"
                >
                  Users CSV
                </button>
              }
            >
              <TrendLineChart
                data={userGrowthMerged}
                areaFill
                series={[
                  { key: 'activities', label: 'Activities', color: '#3B82F6' },
                  { key: 'registrations', label: 'Registrations', color: '#F59E0B' },
                ]}
              />
            </ChartCard>

            <ChartCard
              title="AI Generation Activity by Media Type"
              subtitle="Image, video, audio & script generation volume across selected period"
              empty={analytics.ai.generationTrend.length === 0}
              rightSlot={
                <button
                  type="button"
                  onClick={() => void handleExport('ai')}
                  className="text-[11px] font-medium text-amber-600 dark:text-amber-400 hover:underline"
                >
                  AI CSV
                </button>
              }
            >
              <TrendLineChart
                data={analytics.ai.generationTrend.map((pt) => ({
                  label: pt.period,
                  image: pt.image,
                  video: pt.video,
                  audio: pt.audio,
                  script: pt.script,
                }))}
                series={[
                  { key: 'script', label: 'Scripts', color: '#8B5CF6' },
                  { key: 'image', label: 'Images', color: '#F59E0B' },
                  { key: 'video', label: 'Videos', color: '#10B981' },
                  { key: 'audio', label: 'Audio', color: '#06B6D4' },
                ]}
              />
            </ChartCard>
          </div>

          {/* Distribution & Provider Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <ChartCard
              title="Account Role Distribution"
              subtitle="Canonical 3-role platform split"
              empty={analytics.users.roleDistribution.length === 0}
            >
              <DistributionDonutChart
                items={analytics.users.roleDistribution}
                centerLabel="Accounts"
              />
            </ChartCard>

            <ChartCard
              title="Projects by Platform"
              subtitle="Target distribution channels"
              empty={analytics.projects.platformDistribution.length === 0}
              rightSlot={
                <button
                  type="button"
                  onClick={() => void handleExport('projects')}
                  className="text-[11px] font-medium text-amber-600 dark:text-amber-400 hover:underline"
                >
                  Projects CSV
                </button>
              }
            >
              <ComparisonBarChart
                items={analytics.projects.platformDistribution.map((p) => ({
                  label: p.label,
                  value: p.value,
                  color: '#3B82F6',
                }))}
                primaryLabel="Projects"
              />
            </ChartCard>

            <ChartCard
              title="AI Provider Performance"
              subtitle="Succeeded vs failed jobs by provider"
              empty={analytics.ai.providerComparison.length === 0}
            >
              <ComparisonBarChart
                items={analytics.ai.providerComparison.map((p) => ({
                  label: p.provider,
                  value: p.succeeded,
                  secondaryValue: p.failed,
                  hint: `${p.avgDurationMs}ms avg`,
                  color: '#10B981',
                }))}
                primaryLabel="Succeeded"
                secondaryLabel="Failed"
              />
            </ChartCard>
          </div>

          {/* Top Creators + Recent Audit Trail + Recent Registrations */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                  Top Creators by Project Volume
                </h2>
                <Link
                  to="/owner/projects"
                  className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline"
                >
                  All projects
                </Link>
              </div>
              {analytics.projects.topUsersByProjects.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No projects created yet.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                  {analytics.projects.topUsersByProjects.slice(0, 6).map((creator) => (
                    <Link
                      key={creator.userId}
                      to={`/admin/users/${creator.userId}`}
                      className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/30"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 dark:text-white truncate">
                          {creator.fullName || creator.email}
                          {creator.isDemoAccount ? ' · Demo' : ''}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">{creator.email}</p>
                      </div>
                      <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300 shrink-0">
                        {creator.projectCount} projects ({creator.completedCount} done)
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Activity className="h-4 w-4 text-amber-500" />
                  <span>Recent Registrations & Audit Events</span>
                </h2>
                <Link
                  to="/owner/audit-logs"
                  className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline"
                >
                  Full audit log
                </Link>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                {overview.recentAuditLogs.slice(0, 4).map((log) => (
                  <div key={log.id} className="px-5 py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono font-semibold text-slate-900 dark:text-white truncate">
                        {log.action}{' '}
                        <span className="font-sans font-normal text-slate-500">
                          ({log.outcome})
                        </span>
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        by {log.adminEmail || 'System'}
                        {log.targetEmail ? ` → ${log.targetEmail}` : ''}
                      </p>
                    </div>
                    <span className="text-[11px] font-mono text-slate-400 tabular-nums shrink-0">
                      {formatAdminDateTime(log.createdAt)}
                    </span>
                  </div>
                ))}
                {overview.recentUsers.slice(0, 3).map((u) => {
                  const statusMeta = statusDotClasses(u.accountStatus);
                  return (
                    <Link
                      key={u.id}
                      to={`/admin/users/${u.id}`}
                      className="px-5 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/30"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 dark:text-white truncate">
                          {u.fullName || u.email} · {formatRoleName(u.role)}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">{u.email}</p>
                      </div>
                      <span className={`inline-flex items-center gap-1.5 shrink-0 ${statusMeta.text}`}>
                        <CheckCircle2 className="h-3 w-3" />
                        <span>{statusMeta.label}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </OwnerLayout>
  );
};
