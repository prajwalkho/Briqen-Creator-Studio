import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Coins, Film, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { formatAdminDateTime } from '../../components/admin/adminUtils';
import { ChartCard, ComparisonBarChart } from '../../components/analytics/Charts';
import { StudioLayout } from '../../layouts/StudioLayout';
import {
  getMyActivityLog,
  getMyUsageSummary,
  type MyUsageSummary,
} from '../../services/userService';

export const MyUsagePage: React.FC = () => {
  const [usage, setUsage] = useState<MyUsageSummary | null>(null);
  const [activities, setActivities] = useState<
    Array<{
      id: string;
      activityType: string;
      description: string;
      relatedProjectId: string | null;
      createdAt: string;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUsage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [u, act] = await Promise.all([getMyUsageSummary(), getMyActivityLog(25)]);
      setUsage(u);
      setActivities(act);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load usage telemetry.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsage();
  }, [loadUsage]);

  return (
    <StudioLayout
      title="My AI Usage & Credits"
      primaryAction={
        <button
          type="button"
          onClick={() => void loadUsage()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      }
    >
      {error && (
        <div className="mb-5 p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {loading && !usage ? (
        <div className="py-20 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
        </div>
      ) : usage ? (
        <div className="space-y-6">
          {/* Credits & Workspace KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-4">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Available Balance</span>
                <Coins className="h-4 w-4 text-amber-500" />
              </div>
              <p className="mt-1.5 font-display text-2xl font-bold tabular-nums">
                {usage.creditsBalance.toLocaleString()} cr
              </p>
              <p className="mt-1 text-[11px] text-slate-500 tabular-nums">
                {usage.creditsReserved} reserved · {usage.creditsRefunded} refunded
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-4">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Credits Settled</span>
                <Sparkles className="h-4 w-4 text-emerald-500" />
              </div>
              <p className="mt-1.5 font-display text-2xl font-bold tabular-nums">
                {usage.creditsSettled.toLocaleString()} cr
              </p>
              <p className="mt-1 text-[11px] text-slate-500 tabular-nums">
                Across {usage.counts.generations} AI generation jobs
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-4">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Creative Projects</span>
                <Film className="h-4 w-4 text-sky-500" />
              </div>
              <p className="mt-1.5 font-display text-2xl font-bold tabular-nums">
                {usage.counts.projects} Projects
              </p>
              <p className="mt-1 text-[11px] text-slate-500 tabular-nums">
                {usage.counts.scripts} scripts · {usage.counts.scenes} scenes
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-4">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Outputs Created</span>
                <Activity className="h-4 w-4 text-violet-500" />
              </div>
              <p className="mt-1.5 font-display text-2xl font-bold tabular-nums">
                {usage.counts.assets} Assets
              </p>
              <p className="mt-1 text-[11px] text-slate-500 tabular-nums">
                {usage.counts.exports} rendered exports
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <ChartCard
              title="Generations by Media Type"
              subtitle="Personal AI usage breakdown"
              empty={usage.mediaBreakdown.length === 0}
            >
              <ComparisonBarChart
                items={usage.mediaBreakdown.map((m) => ({
                  label: m.mediaType,
                  value: m.count,
                  color: '#F59E0B',
                }))}
                primaryLabel="Generations"
              />
            </ChartCard>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
                <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                  Recent Personal Activity
                </h2>
              </div>
              {activities.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">No recent activity logged.</div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs max-h-72 overflow-y-auto">
                  {activities.map((a) => (
                    <div key={a.id} className="px-5 py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 dark:text-white truncate">
                          {a.description}
                        </p>
                        <p className="text-[11px] font-mono text-slate-500">{a.activityType}</p>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400 tabular-nums shrink-0">
                        {formatAdminDateTime(a.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Generation & Credit History */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                AI Generation & Credit History
              </h2>
            </div>
            {usage.history.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500">
                No AI media generations performed yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0E1118] text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      <th className="py-3 px-4">Type & Provider</th>
                      <th className="py-3 px-3">Project</th>
                      <th className="py-3 px-3">Prompt</th>
                      <th className="py-3 px-3">Job Status</th>
                      <th className="py-3 px-3 text-right">Credits</th>
                      <th className="py-3 px-4 text-right">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {usage.history.map((item) => (
                      <tr key={item.id}>
                        <td className="py-3 px-4">
                          <span className="font-semibold capitalize text-slate-900 dark:text-white">
                            {item.mediaType}
                          </span>
                          <p className="text-[11px] font-mono text-slate-500">
                            {item.provider} · {item.model}
                          </p>
                        </td>
                        <td className="py-3 px-3">
                          <Link
                            to={`/projects/${item.projectId}`}
                            className="text-amber-700 dark:text-amber-400 hover:underline"
                          >
                            {item.projectTitle || item.projectId}
                          </Link>
                        </td>
                        <td className="py-3 px-3 max-w-xs truncate text-slate-600 dark:text-slate-300">
                          {item.prompt}
                        </td>
                        <td className="py-3 px-3 font-mono capitalize">
                          {item.job?.status || item.status}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums">
                          {item.billing
                            ? `${item.billing.actualCredits ?? item.billing.estimatedCredits} (${item.billing.status})`
                            : '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-500">
                          {formatAdminDateTime(item.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </StudioLayout>
  );
};
