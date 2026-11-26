import React from 'react';
import {
  Activity,
  Ban,
  Film,
  FileText,
  KeyRound,
  LogIn,
  LogOut,
  Sparkles,
  Upload,
  UserCog,
} from 'lucide-react';
import type { AdminActivityLogItem } from '../../types/admin';
import { formatAdminDateTime } from './adminUtils';

interface UserActivityTimelineProps {
  activities: AdminActivityLogItem[];
  showUserInfo?: boolean;
}

function getActivityIcon(activityType: string) {
  switch (activityType) {
    case 'login':
      return <LogIn className="h-3.5 w-3.5 text-emerald-500" />;
    case 'logout':
      return <LogOut className="h-3.5 w-3.5 text-slate-400" />;
    case 'project_create':
    case 'project_update':
    case 'project_delete':
      return <Film className="h-3.5 w-3.5 text-sky-500" />;
    case 'script_create':
    case 'script_generate':
    case 'script_improve':
      return <FileText className="h-3.5 w-3.5 text-amber-500" />;
    case 'ai_generation':
    case 'export_create':
      return <Sparkles className="h-3.5 w-3.5 text-violet-500" />;
    case 'avatar_upload':
      return <Upload className="h-3.5 w-3.5 text-indigo-500" />;
    case 'password_change':
      return <KeyRound className="h-3.5 w-3.5 text-orange-500" />;
    case 'account_ban':
    case 'account_unban':
      return <Ban className="h-3.5 w-3.5 text-red-500" />;
    case 'profile_update':
    case 'role_change':
      return <UserCog className="h-3.5 w-3.5 text-amber-500" />;
    default:
      return <Activity className="h-3.5 w-3.5 text-slate-500" />;
  }
}

export const UserActivityTimeline: React.FC<UserActivityTimelineProps> = ({
  activities,
  showUserInfo = false,
}) => {
  if (activities.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-10 text-center">
        <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
          No activity records recorded yet.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] divide-y divide-slate-100 dark:divide-slate-800/80">
      {activities.map((item) => (
        <div key={item.id} className="px-4 py-3.5 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] shrink-0">
              {getActivityIcon(item.activityType)}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-slate-900 dark:text-white">
                  {item.description}
                </span>
                <span className="px-1.5 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 font-mono text-[10px] text-slate-600 dark:text-slate-300">
                  {item.activityType}
                </span>
                {showUserInfo && item.isDemoAccount && (
                  <span className="px-1.5 py-0.5 rounded-md border border-violet-500/30 bg-violet-500/10 font-mono text-[10px] text-violet-700 dark:text-violet-300">
                    Demo
                  </span>
                )}
              </div>
              {showUserInfo && (item.userEmail || item.userFullName) && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {item.userFullName || item.userEmail} · {item.userEmail}
                </p>
              )}
            </div>
          </div>

          <span className="text-[11px] text-slate-400 dark:text-slate-500 whitespace-nowrap tabular-nums">
            {formatAdminDateTime(item.createdAt)}
          </span>
        </div>
      ))}
    </div>
  );
};
