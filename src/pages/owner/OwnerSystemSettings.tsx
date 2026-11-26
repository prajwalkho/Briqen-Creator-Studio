import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Database,
  HardDrive,
  KeyRound,
  Loader2,
  Save,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import { formatFileSize } from '../../components/admin/adminUtils';
import { OwnerLayout } from '../../layouts/OwnerLayout';
import {
  getOwnerSystemData,
  updateOwnerSystemSettings,
  type OwnerSystemData,
} from '../../services/ownerService';

export const OwnerSystemSettings: React.FC = () => {
  const [data, setData] = useState<OwnerSystemData | null>(null);
  const [general, setGeneral] = useState<OwnerSystemData['settings']['general'] | null>(null);
  const [aiDefaults, setAiDefaults] = useState<OwnerSystemData['settings']['aiDefaults'] | null>(null);
  const [security, setSecurity] = useState<OwnerSystemData['settings']['security'] | null>(null);
  const [featureFlags, setFeatureFlags] = useState<OwnerSystemData['settings']['featureFlags'] | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadSystem = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getOwnerSystemData();
      setData(res);
      setGeneral(res.settings.general);
      setAiDefaults(res.settings.aiDefaults);
      setSecurity(res.settings.security);
      setFeatureFlags(res.settings.featureFlags);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load system settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSystem();
  }, [loadSystem]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!general || !aiDefaults || !security || !featureFlags) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await updateOwnerSystemSettings({
        general,
        aiDefaults,
        security,
        featureFlags,
      });
      setNotice(res.message);
      await loadSystem();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update platform settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <OwnerLayout
      title="Platform Settings & System Health"
      subtitle="PostgreSQL-persisted global configuration, feature flags, AI adapter status, and storage telemetry"
    >
      {error && (
        <div className="mb-4 p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="underline text-[11px]">
            Dismiss
          </button>
        </div>
      )}

      {loading || !data || !general || !aiDefaults || !security || !featureFlags ? (
        <div className="py-20 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Health & Infrastructure Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-4 space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Cloud SQL PostgreSQL</span>
                <Database className="h-4 w-4 text-emerald-500" />
              </div>
              <p className="font-display text-lg font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span>{data.health.databaseConnected ? 'Connected' : 'Degraded'}</span>
              </p>
              <p className="text-[11px] font-mono text-slate-500">
                Jobs: {Object.entries(data.health.jobsByStatus).map(([k, v]) => `${k}:${v}`).join(' · ') || 'None'}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-4 space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Media & Export Storage</span>
                <HardDrive className="h-4 w-4 text-sky-500" />
              </div>
              <p className="font-display text-lg font-bold tabular-nums text-slate-900 dark:text-white">
                {formatFileSize(data.storage.totalBytes)}
              </p>
              <p className="text-[11px] text-slate-500 tabular-nums">
                {data.storage.assetsCount} assets ({formatFileSize(data.storage.assetsBytes)}) ·{' '}
                {data.storage.exportsCount} exports ({formatFileSize(data.storage.exportsBytes)})
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-4 space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Owner Recovery Guard</span>
                <KeyRound className="h-4 w-4 text-amber-500" />
              </div>
              <p className="font-display text-lg font-bold text-slate-900 dark:text-white">
                {data.health.ownerRecoveryConfigured ? 'Key Configured' : 'Not Configured'}
              </p>
              <p className="text-[11px] text-slate-500">
                Controlled by server env <code>OWNER_RECOVERY_KEY</code>
              </p>
            </div>
          </div>

          {/* Editable Settings Form */}
          <form onSubmit={handleSave} className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* General */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-5 space-y-4">
                <h2 className="font-display text-sm font-semibold flex items-center gap-2">
                  <Settings className="h-4 w-4 text-amber-500" />
                  <span>General Platform Controls</span>
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                  <div className="space-y-1">
                    <label className="block font-medium">Platform Name</label>
                    <input
                      type="text"
                      value={general.platformName}
                      onChange={(e) => setGeneral({ ...general, platformName: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block font-medium">Support Email</label>
                    <input
                      type="email"
                      value={general.supportEmail}
                      onChange={(e) => setGeneral({ ...general, supportEmail: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block font-medium">Default Starting Credits</label>
                    <input
                      type="number"
                      min={0}
                      max={1000000}
                      value={general.defaultStartingCredits}
                      onChange={(e) =>
                        setGeneral({ ...general, defaultStartingCredits: Number(e.target.value) || 0 })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] font-mono tabular-nums"
                    />
                  </div>
                </div>
                <div className="space-y-2 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={general.registrationEnabled}
                      onChange={(e) =>
                        setGeneral({ ...general, registrationEnabled: e.target.checked })
                      }
                      className="h-4 w-4 rounded text-amber-500"
                    />
                    <span>Allow new user self-registration</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={general.requireEmailVerification}
                      onChange={(e) =>
                        setGeneral({ ...general, requireEmailVerification: e.target.checked })
                      }
                      className="h-4 w-4 rounded text-amber-500"
                    />
                    <span>Require email verification for new creators</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-orange-600 dark:text-orange-400">
                    <input
                      type="checkbox"
                      checked={general.maintenanceMode}
                      onChange={(e) => setGeneral({ ...general, maintenanceMode: e.target.checked })}
                      className="h-4 w-4 rounded text-amber-500"
                    />
                    <span>Maintenance mode flag</span>
                  </label>
                </div>
              </div>

              {/* AI Defaults & Security */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-5 space-y-4">
                <h2 className="font-display text-sm font-semibold flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-sky-500" />
                  <span>AI Defaults & Security Limits</span>
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                  <div className="space-y-1">
                    <label className="block font-medium">Script Model Tier</label>
                    <select
                      value={aiDefaults.scriptModelTier}
                      onChange={(e) =>
                        setAiDefaults({
                          ...aiDefaults,
                          scriptModelTier: e.target.value as 'fast' | 'balanced' | 'quality',
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12]"
                    >
                      <option value="fast">Fast</option>
                      <option value="balanced">Balanced</option>
                      <option value="quality">Quality</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block font-medium">Default Aspect Ratio</label>
                    <select
                      value={aiDefaults.defaultAspectRatio}
                      onChange={(e) =>
                        setAiDefaults({
                          ...aiDefaults,
                          defaultAspectRatio: e.target.value as '16:9' | '9:16' | '1:1' | '4:3',
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12]"
                    >
                      <option value="16:9">16:9</option>
                      <option value="9:16">9:16</option>
                      <option value="1:1">1:1</option>
                      <option value="4:3">4:3</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block font-medium">Max Scenes / Storyboard</label>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={aiDefaults.maxScenesPerStoryboard}
                      onChange={(e) =>
                        setAiDefaults({
                          ...aiDefaults,
                          maxScenesPerStoryboard: Number(e.target.value) || 1,
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] font-mono tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block font-medium">Audit Retention (Days)</label>
                    <input
                      type="number"
                      min={30}
                      max={3650}
                      value={security.auditRetentionDays}
                      onChange={(e) =>
                        setSecurity({ ...security, auditRetentionDays: Number(e.target.value) || 30 })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] font-mono tabular-nums"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {(
                    [
                      ['quickDraftExport', 'Quick Draft Export'],
                      ['projectTemplates', 'Project Templates Gallery'],
                      ['aiImageGeneration', 'AI Image Generation'],
                      ['aiVideoGeneration', 'AI Video Generation'],
                      ['aiAudioGeneration', 'AI Voiceover / Audio'],
                    ] as const
                  ).map(([flagKey, label]) => (
                    <label key={flagKey} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={featureFlags[flagKey]}
                        onChange={(e) =>
                          setFeatureFlags({ ...featureFlags, [flagKey]: e.target.checked })
                        }
                        className="h-4 w-4 rounded text-amber-500"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                <span>Save Platform Settings</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </OwnerLayout>
  );
};
