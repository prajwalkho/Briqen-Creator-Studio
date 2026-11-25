import React from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { StudioLayout } from '../../layouts/StudioLayout';
import { SettingsSectionId, SettingsSidebar } from './SettingsSidebar';

export interface SettingsToast {
  id: number;
  type: 'success' | 'error';
  message: string;
}

interface SettingsLayoutProps {
  activeSection: SettingsSectionId;
  onSelectSection: (section: SettingsSectionId) => void;
  toast: SettingsToast | null;
  onDismissToast: () => void;
  children: React.ReactNode;
}

export const SettingsLayout: React.FC<SettingsLayoutProps> = ({
  activeSection,
  onSelectSection,
  toast,
  onDismissToast,
  children,
}) => {
  return (
    <StudioLayout title="Account Settings">
      <div className="space-y-6">
        <div className="border-b border-slate-200 dark:border-slate-800/80 pb-5">
          <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
            Profile, Security &amp; Workspace Preferences
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Manage your Briqen Creator Studio identity, password hygiene, active sessions, notifications, and personal data.
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-8 items-start">
          <SettingsSidebar activeSection={activeSection} onSelectSection={onSelectSection} />
          <div className="flex-1 min-w-0 w-full space-y-6">{children}</div>
        </div>
      </div>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-5 right-5 z-50 max-w-md rounded-xl border px-4 py-3 shadow-lg flex items-start gap-3 text-xs ${
            toast.type === 'success'
              ? 'border-emerald-500/30 bg-white dark:bg-[#13161E] text-emerald-700 dark:text-emerald-300'
              : 'border-red-500/30 bg-white dark:bg-[#13161E] text-red-700 dark:text-red-300'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-500" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-500" />
          )}
          <span className="flex-1 leading-relaxed font-medium text-slate-800 dark:text-slate-100">
            {toast.message}
          </span>
          <button
            type="button"
            onClick={onDismissToast}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-0.5"
            aria-label="Dismiss notification"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </StudioLayout>
  );
};
