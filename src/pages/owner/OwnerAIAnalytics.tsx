import React, { useCallback, useEffect, useState } from 'react';
import { Download, Loader2, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import {
  ChartCard,
  ComparisonBarChart,
  DistributionDonutChart,
  TrendLineChart,
} from '../../components/analytics/Charts';
import { formatFileSize } from '../../components/admin/adminUtils';
import { OwnerLayout } from '../../layouts/OwnerLayout';
import {
  downloadOwnerAnalyticsCsv,
  getOwnerAnalytics,
  getOwnerSystemData,
  type AnalyticsGranularity,
  type AnalyticsRange,
  type OwnerAnalyticsResponse,
  type OwnerSystemData,
} from '../../services/ownerService';

export const OwnerAIAnalytics: React.FC = () => {
  const [range, setRange] = useState<AnalyticsRange>('30d');
  const [granularity, setGranularity] = useState<AnalyticsGranularity>('daily');
  const [analytics, setAnalytics] = useState<OwnerAnalyticsResponse | null>(null);
  const [system, setSystem] = useState<OwnerSystemData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [an, sys] = await Promise.all([
        getOwnerAnalytics({ range, granularity }),
        getOwnerSystemData(),
      ]);
      setAnalytics(an);
      setSystem(sys);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load AI analytics.');
    } finally {
      setLoading(false);
    }
  }, [granularity, range]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadOwnerAnalyticsCsv({ type: 'ai', range, granularity });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <OwnerLayout
      title="AI & Media Generation Analytics"
      subtitle="Provider utilization, job reliability, model distribution, retries, and media storage metrics"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Range"
            value={range}
            onChange={(e) => setRange(e.target.value as AnalyticsRange)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] text-xs"
          >
            <option value="7d">7 Days</option>
            <option value="30d">30 Days</option>
            <option value="90d">90 Days</option>
            <option value="365d">365 Days</option>
            <option value="all">All Time</option>
          </select>

          <select
            aria-label="Granularity"
            value={granularity}
            onChange={(e) => setGranularity(e.target.value as AnalyticsGranularity)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] text-xs"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>

          <button
            type="button"
            disabled={exporting}
            onClick={() => void handleExport()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{exporting ? 'Exporting...' : 'Export AI CSV'}</span>
          </button>

          <button
            type="button"
            onClick={() => void loadData()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      }
    >
      {error && (
        <div className="mb-4 p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {loading && !analytics ? (
        <div className="py-20 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
        </div>
      ) : analytics && system ? (
        <div className="space-y-6">
          {/* Provider Configuration Status (Masked - No Secret Keys) */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-4">
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Active AI Adapters</span>
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              </div>
              <p className="mt-1.5 font-mono text-xs font-semibold text-slate-900 dark:text-white">
                LLM: {system.aiProviders.llmProvider} · Img: {system.aiProviders.imageProvider}
              </p>
              <p className="mt-1 text-[11px] text-slate-500 font-mono">
                Video: {system.aiProviders.videoProvider} · Timeout {system.aiProviders.requestTimeoutSec}s
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-4">
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Env Key Status</span>
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
              </div>
              <p className="mt-1.5 font-mono text-xs font-semibold text-slate-900 dark:text-white">
                Gemini: {system.aiProviders.geminiConfigured ? 'Configured' : 'Missing'} · OpenAI:{' '}
                {system.aiProviders.openaiConfigured ? 'Configured' : 'Missing'}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Secrets stay server-side only
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-4">
              <p className="text-[11px] text-slate-500">Job Attempts & Retries</p>
              <p className="mt-1.5 font-display text-2xl font-bold tabular-nums">
                {analytics.ai.retryStats.totalAttempts} attempts
              </p>
              <p className="mt-1 text-[11px] text-slate-500 tabular-nums">
                {analytics.ai.retryStats.retriedJobs} retried jobs · {analytics.ai.retryStats.avgDurationMs}ms avg
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-4">
              <p className="text-[11px] text-slate-500">Stored Media Footprint</p>
              <p className="mt-1.5 font-display text-2xl font-bold tabular-nums">
                {formatFileSize(analytics.media.totalStorageBytes)}
              </p>
              <p className="mt-1 text-[11px] text-slate-500 tabular-nums">
                {system.storage.assetsCount} assets · {system.storage.exportsCount} exports
              </p>
            </div>
          </div>

          {/* Trends */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <ChartCard
              title="AI Generation Volume by Media Type"
              subtitle="Script, image, video, and audio operations"
              empty={analytics.ai.generationTrend.length === 0}
            >
              <TrendLineChart
                data={analytics.ai.generationTrend.map((pt) => ({
                  label: pt.period,
                  script: pt.script,
                  image: pt.image,
                  video: pt.video,
                  audio: pt.audio,
                }))}
                series={[
                  { key: 'script', label: 'Scripts', color: '#8B5CF6' },
                  { key: 'image', label: 'Images', color: '#F59E0B' },
                  { key: 'video', label: 'Videos', color: '#10B981' },
                  { key: 'audio', label: 'Audio', color: '#06B6D4' },
                ]}
              />
            </ChartCard>

            <ChartCard
              title="Video Export Rendering Trend"
              subtitle="Completed vs failed render jobs"
              empty={analytics.media.exportTrend.length === 0}
            >
              <TrendLineChart
                data={analytics.media.exportTrend.map((pt) => ({
                  label: pt.period,
                  succeeded: pt.succeeded,
                  failed: pt.failed,
                }))}
                series={[
                  { key: 'succeeded', label: 'Succeeded', color: '#10B981' },
                  { key: 'failed', label: 'Failed', color: '#EF4444' },
                ]}
              />
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <ChartCard
              title="Job Status Breakdown"
              subtitle="Succeeded, failed, processing, queued"
              empty={analytics.ai.jobStatusDistribution.length === 0}
            >
              <DistributionDonutChart
                items={analytics.ai.jobStatusDistribution}
                centerLabel="Jobs"
              />
            </ChartCard>

            <ChartCard
              title="Provider Reliability & Latency"
              subtitle="Total succeeded vs failed attempts"
              empty={analytics.ai.providerComparison.length === 0}
            >
              <ComparisonBarChart
                items={analytics.ai.providerComparison.map((p) => ({
                  label: p.provider,
                  value: p.succeeded,
                  secondaryValue: p.failed,
                  hint: `$${p.estimatedCostUsd.toFixed(4)} est`,
                  color: '#3B82F6',
                }))}
                primaryLabel="Succeeded"
                secondaryLabel="Failed"
              />
            </ChartCard>

            <ChartCard
              title="Model Usage Breakdown"
              subtitle="Top AI models invoked across actions"
              empty={analytics.ai.modelComparison.length === 0}
            >
              <ComparisonBarChart
                items={analytics.ai.modelComparison.slice(0, 8).map((m) => ({
                  label: m.model,
                  hint: m.provider,
                  value: m.count,
                  color: '#8B5CF6',
                }))}
                primaryLabel="Invocations"
              />
            </ChartCard>
          </div>
        </div>
      ) : null}
    </OwnerLayout>
  );
};
