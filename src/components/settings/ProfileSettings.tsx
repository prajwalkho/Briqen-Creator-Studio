import React from 'react';
import { Camera, ExternalLink, Globe, Mail, MapPin, Phone, UserCog } from 'lucide-react';
import { UserProfile } from '../../types/studio';
import { SettingsSectionId } from './SettingsSidebar';

interface ProfileSettingsProps {
  profile: UserProfile;
  onNavigateSection: (section: SettingsSectionId) => void;
}

export const ProfileSettings: React.FC<ProfileSettingsProps> = ({
  profile,
  onNavigateSection,
}) => {
  const displayName = profile.fullName || profile.displayName || 'Creator';
  const initials = (displayName || profile.email || 'B').trim().charAt(0).toUpperCase();
  const locationParts = [profile.city, profile.state, profile.country].filter(Boolean);

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#13161E] p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800/80 pb-6">
        <div className="flex items-center gap-4 min-w-0">
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt={displayName}
              referrerPolicy="no-referrer"
              className="h-16 w-16 rounded-xl object-cover shrink-0 border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800"
            />
          ) : (
            <div className="h-16 w-16 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-xl font-display font-bold text-amber-700 dark:text-amber-300 shrink-0">
              {initials}
            </div>
          )}

          <div className="min-w-0 space-y-1">
            <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white truncate">
              {displayName}
            </h3>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              {profile.username && <span className="font-mono">@{profile.username}</span>}
              {profile.username && <span aria-hidden="true">·</span>}
              <span className="capitalize">{profile.role}</span>
              <span aria-hidden="true">·</span>
              <span
                className={
                  profile.isVerified
                    ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                    : 'text-amber-600 dark:text-amber-400 font-medium'
                }
              >
                {profile.isVerified ? 'Email verified' : 'Email verification pending'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onNavigateSection('avatar')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <Camera className="h-3.5 w-3.5" />
            <span>Change Photo</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigateSection('personal')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold transition-colors whitespace-nowrap"
          >
            <UserCog className="h-3.5 w-3.5" />
            <span>Edit Information</span>
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400">About</h4>
        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          {profile.bio || 'No bio added yet. Add a short introduction in Personal Information.'}
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 pt-2 border-t border-slate-100 dark:border-slate-800/70 text-xs">
        <div className="space-y-1">
          <p className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5" />
            <span>Primary Email</span>
          </p>
          <p className="font-mono text-slate-900 dark:text-slate-100 truncate">{profile.email}</p>
          {profile.pendingEmail && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 truncate">
              Pending switch to {profile.pendingEmail}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <p className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5" />
            <span>Phone Number</span>
          </p>
          <p className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {profile.phoneNumber || 'Not provided'}
          </p>
        </div>

        <div className="space-y-1">
          <p className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            <span>Location</span>
          </p>
          <p className="text-slate-900 dark:text-slate-100">
            {locationParts.length > 0 ? locationParts.join(', ') : 'Not specified'}
          </p>
        </div>
      </div>

      {(profile.website || profile.linkedinUrl || profile.githubUrl) && (
        <div className="flex flex-wrap items-center gap-5 pt-3 border-t border-slate-100 dark:border-slate-800/70 text-xs">
          {profile.website && (
            <a
              href={profile.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400 hover:underline"
            >
              <Globe className="h-3.5 w-3.5" />
              <span>Website</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {profile.linkedinUrl && (
            <a
              href={profile.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400 hover:underline"
            >
              <span>LinkedIn</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {profile.githubUrl && (
            <a
              href={profile.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400 hover:underline"
            >
              <span>GitHub</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800/70 text-xs">
        <div>
          <p className="text-slate-500 dark:text-slate-400">Available Credits</p>
          <p className="mt-1 font-mono text-base font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
            {profile.creditsBalance} cr
          </p>
        </div>
        <div>
          <p className="text-slate-500 dark:text-slate-400">Member Since</p>
          <p className="mt-1 font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {profile.createdAt ? new Date(profile.createdAt).toLocaleDateString() : '—'}
          </p>
        </div>
        <div>
          <p className="text-slate-500 dark:text-slate-400">Last Sign-In</p>
          <p className="mt-1 font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {profile.lastLoginAt ? new Date(profile.lastLoginAt).toLocaleString() : 'Active session'}
          </p>
        </div>
      </div>
    </section>
  );
};
