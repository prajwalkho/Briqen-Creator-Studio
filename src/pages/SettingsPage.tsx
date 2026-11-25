import React, { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { StudioLayout } from '../layouts/StudioLayout';
import { apiRequest } from '../services/api';
import { BillingTransaction } from '../types/studio';

export const SettingsPage: React.FC = () => {
  const { profile, theme, toggleTheme, refreshProfile } = useAuth();
  const [transactions, setTransactions] = useState<BillingTransaction[]>([]);
  const [credits, setCredits] = useState<number>(profile?.creditsBalance ?? 0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadLedger = async () => {
      setLoading(true);
      try {
        const res = await apiRequest<{
          data: { creditsBalance: number; transactions: BillingTransaction[] };
        }>('/billing/ledger');
        setCredits(res.data.creditsBalance);
        setTransactions(res.data.transactions);
        await refreshProfile();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load usage ledger.');
      } finally {
        setLoading(false);
      }
    };
    void loadLedger();
  }, [refreshProfile]);

  return (
    <StudioLayout title="Settings & Billing">
      <div className="space-y-8 max-w-5xl">
        <section className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#13161E] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="space-y-1">
            <h2 className="font-display text-base font-semibold">Workspace Appearance</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Switch between dark cinema studio mode and crisp daylight mode.
            </p>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
            <span>{theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}</span>
          </button>
        </section>

        <section className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#13161E] p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800/80 pb-5">
            <div>
              <h2 className="font-display text-base font-semibold">Usage &amp; Credit Ledger</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                Idempotent action ledger ensuring retries reuse the original action ID with zero duplicate charges.
              </p>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-xs text-slate-500 dark:text-slate-400">Available Credits</p>
              <p className="font-mono text-2xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                {credits} cr
              </p>
            </div>
          </div>

          {error && (
            <div className="p-3.5 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-500">
              {error}
            </div>
          )}

          {loading ? (
            <div className="h-32 animate-pulse bg-slate-100 dark:bg-slate-800/40 rounded-lg" />
          ) : transactions.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
              No generation actions recorded yet. Credits are deducted once per unique generation action.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 pr-4 font-medium">Timestamp</th>
                    <th className="py-2.5 pr-4 font-medium">Action ID</th>
                    <th className="py-2.5 pr-4 font-medium">Provider</th>
                    <th className="py-2.5 pr-4 font-medium">Model</th>
                    <th className="py-2.5 pr-4 font-medium">Media</th>
                    <th className="py-2.5 pr-4 font-medium text-right">Credits</th>
                    <th className="py-2.5 font-medium text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                      <td className="py-3 pr-4 font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {new Date(tx.createdAt).toLocaleString()}
                      </td>
                      <td className="py-3 pr-4 font-mono text-slate-700 dark:text-slate-300">
                        {tx.actionId.slice(0, 8)}...
                      </td>
                      <td className="py-3 pr-4 capitalize">{tx.provider}</td>
                      <td className="py-3 pr-4 font-mono">{tx.model}</td>
                      <td className="py-3 pr-4">{tx.mediaType}</td>
                      <td className="py-3 pr-4 text-right font-mono font-semibold tabular-nums">
                        {tx.actualCredits ?? tx.estimatedCredits}
                      </td>
                      <td className="py-3 text-right capitalize font-medium">
                        <span
                          className={
                            tx.status === 'settled'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : tx.status === 'refunded'
                                ? 'text-slate-500'
                                : 'text-amber-600 dark:text-amber-400'
                          }
                        >
                          {tx.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </StudioLayout>
  );
};
