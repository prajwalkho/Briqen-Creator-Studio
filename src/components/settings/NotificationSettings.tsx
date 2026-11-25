import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from '../../services/userService';
import { NotificationPreferences } from '../../types/studio';

interface NotificationSettingsProps {
  onNotify: (type: 'success' | 'error', message: string) => void;
}

type ToggleKey =
  | 'emailNotifications'
  | 'projectUpdates'
  | 'generationCompleted'
  | 'generationFailed'
  | 'productAnnouncements'
  | 'marketingEmails';

const NOTIFICATION_ITEMS: Array<{
  key: ToggleKey;
  title: string;
  description: string;
}> = [
  {
    key: 'emailNotifications',
    title: 'Email Notifications',
    description: 'Master toggle for studio account activity and alert emails.',
  },
  {
    key: 'projectUpdates',
    title: 'Project Updates',
    description: 'Notifications when script revisions, scene splits, or exports update.',
  },
  {
    key: 'generationCompleted',
    title: 'AI Generation Completed',
    description: 'Notify when image, video, voiceover, or final FFmpeg renders complete.',
  },
  {
    key: 'generationFailed',
    title: 'AI Generation Failures',
    description: 'Immediate alerts if a provider request or render pipeline encounters an error.',
  },
  {
    key: 'productAnnouncements',
    title: 'Product Announcements',
    description: 'Release notes, new AI model adapters, and platform workflow updates.',
  },
  {
    key: 'marketingEmails',
    title: 'Marketing Emails',
    description: 'Creator playbooks, campaign inspiration, and occasional promotional offers.',
  },
];

export const NotificationSettings: React.FC<NotificationSettingsProps> = ({ onNotify }) => {
  const [savedState, setSavedState] = useState<NotificationPreferences | null>(null);
  const [form, setForm] = useState<Record<ToggleKey, boolean>>({
    emailNotifications: true,
    projectUpdates: true,
    generationCompleted: true,
    generationFailed: true,
    productAnnouncements: true,
    marketingEmails: false,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    void getNotificationPreferences()
      .then((prefs) => {
        setSavedState(prefs);
        setForm({
          emailNotifications: prefs.emailNotifications,
          projectUpdates: prefs.projectUpdates,
          generationCompleted: prefs.generationCompleted,
          generationFailed: prefs.generationFailed,
          productAnnouncements: prefs.productAnnouncements,
          marketingEmails: prefs.marketingEmails,
        });
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load notification settings.');
      })
      .finally(() => setLoading(false));
  }, []);

  const toggle = (key: ToggleKey) => {
    setForm((prev) => ({ ...prev, [key]: !prev[key] }));
    setSuccessMsg(null);
  };

  const handleCancel = () => {
    if (!savedState) return;
    setForm({
      emailNotifications: savedState.emailNotifications,
      projectUpdates: savedState.projectUpdates,
      generationCompleted: savedState.generationCompleted,
      generationFailed: savedState.generationFailed,
      productAnnouncements: savedState.productAnnouncements,
      marketingEmails: savedState.marketingEmails,
    });
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
      const res = await updateNotificationPreferences(form);
      setSavedState(res.notifications);
      setSuccessMsg(res.message);
      onNotify('success', res.message);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save notification settings.';
      setError(msg);
      onNotify('error', msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#13161E] p-6">
        <div className="h-48 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/60" />
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#13161E] p-6 space-y-6">
      <div className="border-b border-slate-200 dark:border-slate-800/80 pb-4">
        <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
          Notification Settings
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Choose which studio events, job completions, and announcements trigger notifications.
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
        <div className="divide-y divide-slate-100 dark:divide-slate-800/70 rounded-lg border border-slate-200 dark:border-slate-800">
          {NOTIFICATION_ITEMS.map((item) => {
            const enabled = form[item.key];
            return (
              <div
                key={item.key}
                className="p-4 flex items-center justify-between gap-4"
              >
                <div className="space-y-0.5">
                  <label
                    htmlFor={`notif-${item.key}`}
                    className="block text-xs font-semibold text-slate-900 dark:text-white cursor-pointer"
                  >
                    {item.title}
                  </label>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {item.description}
                  </p>
                </div>

                <button
                  id={`notif-${item.key}`}
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  onClick={() => toggle(item.key)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 ${
                    enabled ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                      enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            );
          })}
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
            <span>{saving ? 'Saving...' : 'Save Notification Settings'}</span>
          </button>
        </div>
      </form>
    </section>
  );
};
