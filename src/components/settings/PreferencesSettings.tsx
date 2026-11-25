import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Monitor, Moon, Sun } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getPreferences } from '../../services/userService';
import { UserPreferences } from '../../types/studio';

interface PreferencesSettingsProps {
  onNotify: (type: 'success' | 'error', message: string) => void;
}

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English (en)' },
  { value: 'es', label: 'Spanish (es)' },
  { value: 'fr', label: 'French (fr)' },
  { value: 'de', label: 'German (de)' },
  { value: 'pt', label: 'Portuguese (pt)' },
  { value: 'ja', label: 'Japanese (ja)' },
  { value: 'hi', label: 'Hindi (hi)' },
];

const FALLBACK_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Kolkata',
  'Australia/Sydney',
];

export const PreferencesSettings: React.FC<PreferencesSettingsProps> = ({ onNotify }) => {
  const { preferences, updatePreferences } = useAuth();

  const [initial, setInitial] = useState<Pick<
    UserPreferences,
    'theme' | 'language' | 'timezone' | 'defaultAspectRatio' | 'defaultExportQuality'
  > | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(preferences?.theme || 'dark');
  const [language, setLanguage] = useState(preferences?.language || 'en');
  const [timezone, setTimezone] = useState(preferences?.timezone || 'UTC');
  const [defaultAspectRatio, setDefaultAspectRatio] = useState<'16:9' | '9:16' | '1:1' | '4:3'>(
    preferences?.defaultAspectRatio || '16:9'
  );
  const [defaultExportQuality, setDefaultExportQuality] = useState<'standard' | 'low'>(
    preferences?.defaultExportQuality || 'standard'
  );

  const [loading, setLoading] = useState(!preferences);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const timezoneOptions = useMemo(() => {
    let zones: string[] = FALLBACK_TIMEZONES;
    try {
      const intlWithZones = Intl as unknown as {
        supportedValuesOf?: (key: string) => string[];
      };
      if (typeof intlWithZones.supportedValuesOf === 'function') {
        zones = intlWithZones.supportedValuesOf('timeZone');
      }
    } catch {
      zones = FALLBACK_TIMEZONES;
    }
    const set = new Set<string>(['UTC', ...zones]);
    if (timezone) set.add(timezone);
    return Array.from(set);
  }, [timezone]);

  useEffect(() => {
    const syncFrom = (p: UserPreferences) => {
      const snapshot = {
        theme: p.theme,
        language: p.language,
        timezone: p.timezone,
        defaultAspectRatio: p.defaultAspectRatio,
        defaultExportQuality: p.defaultExportQuality,
      };
      setInitial(snapshot);
      setTheme(p.theme);
      setLanguage(p.language);
      setTimezone(p.timezone);
      setDefaultAspectRatio(p.defaultAspectRatio);
      setDefaultExportQuality(p.defaultExportQuality);
    };

    if (preferences) {
      syncFrom(preferences);
      setLoading(false);
      return;
    }

    setLoading(true);
    void getPreferences()
      .then((loaded) => syncFrom(loaded))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load preferences.');
      })
      .finally(() => setLoading(false));
  }, [preferences]);

  const handleUseBrowserTimezone = () => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) setTimezone(tz);
    } catch {
      // ignore
    }
  };

  const handleCancel = () => {
    if (!initial) return;
    setTheme(initial.theme);
    setLanguage(initial.language);
    setTimezone(initial.timezone);
    setDefaultAspectRatio(initial.defaultAspectRatio);
    setDefaultExportQuality(initial.defaultExportQuality);
    setError(null);
    setSuccessMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setError(null);
    setSuccessMsg(null);
    setSaving(true);
    try {
      const updated = await updatePreferences({
        theme,
        language,
        timezone,
        defaultAspectRatio,
        defaultExportQuality,
      });
      setInitial({
        theme: updated.theme,
        language: updated.language,
        timezone: updated.timezone,
        defaultAspectRatio: updated.defaultAspectRatio,
        defaultExportQuality: updated.defaultExportQuality,
      });
      setSuccessMsg('Workspace preferences saved and applied.');
      onNotify('success', 'Workspace preferences saved.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save preferences.';
      setError(msg);
      onNotify('error', msg);
    } finally {
      setSaving(false);
    }
  };

  const selectCls =
    'w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500';

  if (loading) {
    return (
      <section className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#13161E] p-6">
        <div className="h-44 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/60" />
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#13161E] p-6 space-y-6">
      <div className="border-b border-slate-200 dark:border-slate-800/80 pb-4">
        <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
          Workspace Preferences
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Configure appearance, regional settings, and default parameters for new video projects and FFmpeg exports.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="p-3.5 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-600 dark:text-red-400 flex items-start gap-2"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div
          role="status"
          className="p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-700 dark:text-emerald-300 flex items-start gap-2"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <span className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Appearance Theme
          </span>
          <div className="grid sm:grid-cols-3 gap-3">
            {[
              { id: 'light' as const, label: 'Light', desc: 'Bright daylight workspace', icon: Sun },
              { id: 'dark' as const, label: 'Dark', desc: 'Cinema studio dark room', icon: Moon },
              {
                id: 'system' as const,
                label: 'System',
                desc: 'Match OS preference',
                icon: Monitor,
              },
            ].map((opt) => {
              const Icon = opt.icon;
              const selected = theme === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTheme(opt.id)}
                  aria-pressed={selected}
                  className={`p-3.5 rounded-lg border text-left transition-colors flex items-start gap-3 ${
                    selected
                      ? 'border-amber-500 bg-amber-500/10 text-slate-900 dark:text-white'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 mt-0.5 ${
                      selected ? 'text-amber-500' : 'text-slate-400'
                    }`}
                  />
                  <div>
                    <p className="text-xs font-semibold">{opt.label}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {opt.desc}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label
              htmlFor="pref-language"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Language
            </label>
            <select
              id="pref-language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className={selectCls}
            >
              {LANGUAGE_OPTIONS.map((lang) => (
                <option key={lang.value} value={lang.value}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="pref-timezone"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Time Zone
              </label>
              <button
                type="button"
                onClick={handleUseBrowserTimezone}
                className="text-[11px] font-medium text-amber-600 dark:text-amber-400 hover:underline"
              >
                Detect browser zone
              </button>
            </div>
            <select
              id="pref-timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className={selectCls}
            >
              {timezoneOptions.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800/70">
          <div className="space-y-1.5">
            <label
              htmlFor="pref-aspect"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Default Video Aspect Ratio
            </label>
            <select
              id="pref-aspect"
              value={defaultAspectRatio}
              onChange={(e) =>
                setDefaultAspectRatio(e.target.value as '16:9' | '9:16' | '1:1' | '4:3')
              }
              className={selectCls}
            >
              <option value="16:9">16:9 Widescreen (YouTube / Web)</option>
              <option value="9:16">9:16 Vertical (Reels / TikTok / Shorts)</option>
              <option value="1:1">1:1 Square (Social Feeds)</option>
              <option value="4:3">4:3 Classic Presentation</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="pref-export-quality"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Default Video Export Quality
            </label>
            <select
              id="pref-export-quality"
              value={defaultExportQuality}
              onChange={(e) => setDefaultExportQuality(e.target.value as 'standard' | 'low')}
              className={selectCls}
            >
              <option value="standard">Standard HD (1080p / 720p)</option>
              <option value="low">Low-Res Fast Draft (360p Quick Preview)</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800/80">
          <button
            type="button"
            disabled={saving}
            onClick={handleCancel}
            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors disabled:opacity-60 whitespace-nowrap"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>{saving ? 'Saving...' : 'Save Preferences'}</span>
          </button>
        </div>
      </form>
    </section>
  );
};
