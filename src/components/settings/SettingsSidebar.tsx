import React from 'react';
import {
  Bell,
  Camera,
  KeyRound,
  ShieldCheck,
  Sliders,
  Trash2,
  User as UserIcon,
  UserCog,
} from 'lucide-react';

export type SettingsSectionId =
  | 'profile'
  | 'personal'
  | 'avatar'
  | 'password'
  | 'security'
  | 'preferences'
  | 'notifications'
  | 'account';

export interface SettingsNavItem {
  id: SettingsSectionId;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  {
    id: 'profile',
    label: 'My Profile',
    description: 'Overview and public identity',
    icon: UserIcon,
  },
  {
    id: 'personal',
    label: 'Personal Information',
    description: 'Name, contact, location, links',
    icon: UserCog,
  },
  {
    id: 'avatar',
    label: 'Profile Picture',
    description: 'Upload, crop preview, or remove',
    icon: Camera,
  },
  {
    id: 'password',
    label: 'Change Password',
    description: 'Password strength and rotation',
    icon: KeyRound,
  },
  {
    id: 'security',
    label: 'Account Security',
    description: 'Sessions, OAuth, and login hygiene',
    icon: ShieldCheck,
  },
  {
    id: 'preferences',
    label: 'Preferences',
    description: 'Theme, locale, and video defaults',
    icon: Sliders,
  },
  {
    id: 'notifications',
    label: 'Notification Settings',
    description: 'Email and job alert toggles',
    icon: Bell,
  },
  {
    id: 'account',
    label: 'Account Management',
    description: 'Credits, export data, and deletion',
    icon: Trash2,
  },
];

interface SettingsSidebarProps {
  activeSection: SettingsSectionId;
  onSelectSection: (section: SettingsSectionId) => void;
}

export const SettingsSidebar: React.FC<SettingsSidebarProps> = ({
  activeSection,
  onSelectSection,
}) => {
  return (
    <aside className="w-full lg:w-[260px] shrink-0" aria-label="Account settings sections">
      <nav className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
        {SETTINGS_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectSection(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-left transition-colors whitespace-nowrap lg:whitespace-normal shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 ${
                active
                  ? 'bg-amber-500/12 text-amber-700 dark:text-amber-400 border border-amber-500/25'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100 border border-transparent'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold leading-tight">{item.label}</p>
                <p className="hidden lg:block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                  {item.description}
                </p>
              </div>
            </button>
          );
        })}
      </nav>
    </aside>
  );
};
