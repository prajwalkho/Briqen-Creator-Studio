import React, { useCallback, useEffect, useState } from 'react';
import { Coins, DollarSign, Download, Info, Loader2, RefreshCw } from 'lucide-react';
import { ChartCard, ComparisonBarChart, TrendLineChart } from '../../components/analytics/Charts';
import { OwnerLayout } from '../../layouts/OwnerLayout';
import {
  downloadOwnerAnalyticsCsv,
  getOwnerAnalytics,
  type AnalyticsGranularity,
  type AnalyticsRange,
  type OwnerAnalyticsResponse,
} from '../../services/ownerService';

export const OwnerFinancialAnalytics: React.FC = () => {
  const [range, setRange] = useState<AnalyticsRange>('30d');
  const [granularity, setGranularity] = useState<AnalyticsGranularity>('daily');
  const [analytics, setAnalytics] = useState<OwnerAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getOwnerAnalytics({ range, granularity });
      setAnalytics(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load financial analytics.');
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
      await downloadOwnerAnalyticsCsv({ type: 'financial', range, granularity });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export financial CSV.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <OwnerLayout
      title="Credits & Financial Telemetry"
      subtitle="PostgreSQL credit ledger metrics and estimated AI provider operating costs"
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
            <span>{exporting ? 'Exporting...' : 'Export CSV'}</span>
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
      ) : analytics ? (
        <div className="space-y-6">
          {/* Honest Billing Disclosure */}
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3 text-xs text-amber-900 dark:text-amber-200">
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="font-semibold">
                Payment Gateway / Subscription Invoicing: {analytics.financial.billingImplemented ? 'Active' : 'Not Connected'}
              </p>
              <p className="mt-0.5 leading-relaxed">{analytics.financial.note}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-4">
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Confirmed Revenue</span>
                <DollarSign className="h-3.5 w-3.5 text-slate-400" />
              </div>
              <p className="mt-1.5 font-display text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                {analytics.financial.confirmedRevenueUsd === null
                  ? 'N/A'
                  : `$${analytics.financial.confirmedRevenueUsd.toFixed(2)}`}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">No external gateway configured</p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-4">
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>User Credit Balance</span>
                <Coins className="h-3.5 w-3.5 text-amber-500" />
              </div>
              <p className="mt-1.5 font-display text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                {analytics.financial.creditsSummary.totalBalance.toLocaleString()} cr
              </p>
              <p className="mt-1 text-[11px] text-slate-500">Available across accounts</p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-4">
              <p className="text-[11px] text-slate-500">Credits Settled</p>
              <p className="mt-1.5 font-display text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                {analytics.financial.creditsSummary.totalSettled.toLocaleString()} cr
              </p>
              <p className="mt-1 text-[11px] text-slate-500">Completed generation spend</p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-4">
              <p className="text-[11px] text-slate-500">Credits Refunded</p>
              <p className="mt-1.5 font-display text-xl font-bold tabular-nums text-sky-600 dark:text-sky-400">
                {analytics.financial.creditsSummary.totalRefunded.toLocaleString()} cr
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                {analytics.financial.creditsSummary.totalReserved.toLocaleString()} currently reserved
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-4">
              <p className="text-[11px] text-slate-500">Est. AI Provider Cost</p>
              <p className="mt-1.5 font-display text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                ${analytics.financial.creditsSummary.estimatedAiCostUsd.toFixed(4)}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">From attempt usage metadata</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <ChartCard
              title="Credit Settlement & Refund Flow"
              subtitle="Settled, reserved, and refunded credits over time"
              empty={analytics.financial.creditTrend.length === 0}
            >
              <TrendLineChart
                data={analytics.financial.creditTrend.map((pt) => ({
                  label: pt.period,
                  settled: pt.settledCredits,
                  reserved: pt.reservedCredits,
                  refunded: pt.refundedCredits,
                }))}
                series={[
                  { key: 'settled', label: 'Settled Credits', color: '#10B981' },
                  { key: 'reserved', label: 'Reserved Credits', color: '#F59E0B' },
                  { key: 'refunded', label: 'Refunded Credits', color: '#3B82F6' },
                ]}
              />
            </ChartCard>

            <ChartCard
              title="Settled Credits & Est. Cost by Provider"
              subtitle="Database billing_transactions grouped by AI provider"
              empty={analytics.ai.estimatedCostByProvider.length === 0}
            >
              <ComparisonBarChart
                items={analytics.ai.estimatedCostByProvider.map((p) => ({
                  label: p.provider,
                  value: p.settledCredits,
                  secondaryValue: p.refundedCredits,
                  hint: `$${p.estimatedCostUsd.toFixed(4)} est. cost`,
                  color: '#F59E0B',
                }))}
                primaryLabel="Settled Credits"
                secondaryLabel="Refunded Credits"
              />
            </ChartCard>
          </div>
        </div>
      ) : null}
    </OwnerLayout>
  );
};
