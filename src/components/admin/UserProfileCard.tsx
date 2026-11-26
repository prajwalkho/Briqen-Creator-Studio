import React from 'react';
import { Globe, Mail, MapPin, Phone, ShieldCheck, UserCheck } from 'lucide-react';
import type { AdminUserDetailResponse } from '../../types/admin';
import {
  formatAdminDateTime,
  formatRoleName,
  roleBadgeClasses,
  statusDotClasses,
} from './adminUtils';

interface UserProfileCardProps {
  detail: AdminUserDetailResponse;
}

export const UserProfileCard: React.FC<UserProfileCardProps> = ({ detail }) => {
  const { user, preferences, notifications, counts } = detail;
  const displayName = user.fullName || user.displayName || user.email.split('@')[0];
  const statusMeta = statusDotClasses(user.accountStatus);
  const locationParts = [user.city, user.state, user.country].filter(Boolean);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={displayName}
              className="h-16 w-16 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
            />
          ) : (
            <div className="h-16 w-16 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center font-display text-2xl font-bold text-amber-700 dark:text-amber-300 shrink-0">
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}

          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                {displayName}
              </h2>
              <span
                className={`px-2 py-0.5 rounded-md border text-[11px] font-medium ${roleBadgeClasses(
                  user.role
                )}`}
              >
                {formatRoleName(user.role)}
              </span>
              {user.isDemoAccount && (
                <span className="px-2 py-0.5 rounded-md border border-violet-500/30 bg-violet-500/10 text-[11px] font-mono font-medium text-violet-700 dark:text-violet-300">
                  Demo Account
                </span>
              )}
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${statusMeta.text}`}>
                <span className={`h-2 w-2 rounded-full ${statusMeta.dot}`} />
                <span>{statusMeta.label}</span>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                <span>{user.email}</span>
              </span>
              {user.username && <span>@{user.username}</span>}
              {user.phoneNumber && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" />
                  <span>{user.phoneNumber}</span>
                </span>
              )}
              {locationParts.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  <span>{locationParts.join(', ')}</span>
                </span>
              )}
            </div>
          </div>

          <div className="text-left sm:text-right shrink-0">
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Credits Balance</p>
            <p className="font-display text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
              {(user.creditsBalance ?? 0).toLocaleString()}
            </p>
          </div>
        </div>

        {user.bio && (
          <p className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            {user.bio}
          </p>
        )}
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        {[
          { label: 'Projects', value: counts.projects },
          { label: 'Scripts', value: counts.scripts },
          { label: 'Scenes', value: counts.scenes },
          { label: 'AI Actions', value: counts.generationActions },
          { label: 'Media Assets', value: counts.assets },
          { label: 'Exports', value: counts.exports },
          { label: 'Active Sessions', value: counts.activeSessions },
          { label: 'Ban Events', value: counts.banHistoryCount },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] px-4 py-3"
          >
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {item.label}
            </p>
            <p className="mt-1 font-display text-xl font-bold text-slate-900 dark:text-white tabular-nums">
              {item.value}
            </p>
          </div>
        ))}
      </div>

      {/* Metadata & Preferences */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-5 space-y-3">
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-amber-500" />
            <span>Account Security & Lifecycle</span>
          </h3>
          <dl className="grid grid-cols-2 gap-y-2.5 gap-x-4 text-xs">
            <dt className="text-slate-500 dark:text-slate-400">Account ID</dt>
            <dd className="font-mono text-[11px] text-slate-800 dark:text-slate-200 truncate">
              {user.id}
            </dd>
            <dt className="text-slate-500 dark:text-slate-400">Password Sign-In</dt>
            <dd className="text-slate-800 dark:text-slate-200">
              {user.hasLocalPassword ? 'Configured' : 'OAuth Only'}
            </dd>
            <dt className="text-slate-500 dark:text-slate-400">Email Verification</dt>
            <dd className="text-slate-800 dark:text-slate-200">
              {user.isVerified ? 'Verified' : 'Unverified'}
            </dd>
            <dt className="text-slate-500 dark:text-slate-400">Password Updated</dt>
            <dd className="tabular-nums text-slate-800 dark:text-slate-200">
              {formatAdminDateTime(user.passwordChangedAt)}
            </dd>
            <dt className="text-slate-500 dark:text-slate-400">Joined</dt>
            <dd className="tabular-nums text-slate-800 dark:text-slate-200">
              {formatAdminDateTime(user.createdAt)}
            </dd>
            <dt className="text-slate-500 dark:text-slate-400">Last Login</dt>
            <dd className="tabular-nums text-slate-800 dark:text-slate-200">
              {formatAdminDateTime(user.lastLoginAt)}
            </dd>
            {user.bannedAt && (
              <>
                <dt className="text-red-500">Banned At</dt>
                <dd className="tabular-nums text-red-600 dark:text-red-400">
                  {formatAdminDateTime(user.bannedAt)}
                </dd>
              </>
            )}
            {user.banReason && (
              <>
                <dt className="text-red-500">Ban Reason</dt>
                <dd className="text-red-600 dark:text-red-400">{user.banReason}</dd>
              </>
            )}
          </dl>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-5 space-y-3">
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-sky-500" />
            <span>Creator Defaults & Links</span>
          </h3>
          <dl className="grid grid-cols-2 gap-y-2.5 gap-x-4 text-xs">
            <dt className="text-slate-500 dark:text-slate-400">Language & Timezone</dt>
            <dd className="text-slate-800 dark:text-slate-200">
              {preferences.language} · {preferences.timezone}
            </dd>
            <dt className="text-slate-500 dark:text-slate-400">Aspect Ratio</dt>
            <dd className="font-mono text-slate-800 dark:text-slate-200">
              {preferences.defaultAspectRatio}
            </dd>
            <dt className="text-slate-500 dark:text-slate-400">Default Export Quality</dt>
            <dd className="capitalize text-slate-800 dark:text-slate-200">
              {preferences.defaultExportQuality}
            </dd>
            <dt className="text-slate-500 dark:text-slate-400">Theme</dt>
            <dd className="capitalize text-slate-800 dark:text-slate-200">{preferences.theme}</dd>
            <dt className="text-slate-500 dark:text-slate-400">Notifications</dt>
            <dd className="text-slate-800 dark:text-slate-200">
              {[
                notifications.emailNotifications ? 'Email' : null,
                notifications.generationCompleted ? 'AI Done' : null,
                notifications.generationFailed ? 'AI Failed' : null,
                notifications.projectUpdates ? 'Projects' : null,
              ]
                .filter(Boolean)
                .join(' · ') || 'Muted'}
            </dd>
            <dt className="text-slate-500 dark:text-slate-400">External Links</dt>
            <dd className="flex flex-wrap gap-2">
              {[
                { label: 'Website', href: user.website },
                { label: 'LinkedIn', href: user.linkedinUrl },
                { label: 'GitHub', href: user.githubUrl },
              ]
                .filter((l) => l.href)
                .map((l) => (
                  <span
                    key={l.label}
                    className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"
                  >
                    <Globe className="h-3 w-3" />
                    <span className="truncate max-w-[140px]">{l.href}</span>
                  </span>
                ))}
              {!user.website && !user.linkedinUrl && !user.githubUrl && (
                <span className="text-slate-400">None provided</span>
              )}
            </dd>
          </dl>
        </div>
      </div>
    </div>
  );
};
