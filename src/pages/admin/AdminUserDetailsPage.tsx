import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Download,
  Edit3,
  KeyRound,
  Loader2,
  MailCheck,
  RotateCcw,
  Shield,
  Trash2,
} from 'lucide-react';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { BanUserModal } from '../../components/admin/BanUserModal';
import { DeleteUserConfirmation } from '../../components/admin/DeleteUserConfirmation';
import { RoleManagementModal } from '../../components/admin/RoleManagementModal';
import { UnbanUserModal } from '../../components/admin/UnbanUserModal';
import { UserActivityTimeline } from '../../components/admin/UserActivityTimeline';
import { UserAssetGallery } from '../../components/admin/UserAssetGallery';
import { UserGenerationHistory } from '../../components/admin/UserGenerationHistory';
import { UserProfileCard } from '../../components/admin/UserProfileCard';
import { UserProjectTable } from '../../components/admin/UserProjectTable';
import { hasClientPermission, isSuperAdminClient } from '../../components/ProtectedRoute';
import { formatAdminDateTime, normalizeRoleClient } from '../../components/admin/adminUtils';
import { useAuth } from '../../context/AuthContext';
import {
  exportAdminUserData,
  getAdminUserActivity,
  getAdminUserAssets,
  getAdminUserBanHistory,
  getAdminUserDetail,
  getAdminUserGenerations,
  getAdminUserProjects,
  getAdminUserScenes,
  getAdminUserScripts,
  getAdminUserSessions,
  restoreAdminUser,
  revokeAdminUserSession,
  triggerAdminPasswordReset,
  triggerAdminVerification,
} from '../../services/adminService';
import type {
  AdminActivityLogItem,
  AdminAssetItem,
  AdminBanHistoryItem,
  AdminProjectItem,
  AdminSceneItem,
  AdminScriptItem,
  AdminSessionItem,
  AdminUserDetailResponse,
  AdminUserGenerationsResponse,
} from '../../types/admin';

type DetailTab =
  | 'overview'
  | 'projects'
  | 'scripts'
  | 'scenes'
  | 'generations'
  | 'assets'
  | 'sessions'
  | 'activity'
  | 'bans';

export const AdminUserDetailsPage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const actorRole = normalizeRoleClient(profile?.role);

  const [tab, setTab] = useState<DetailTab>('overview');
  const [detail, setDetail] = useState<AdminUserDetailResponse | null>(null);
  const [projects, setProjects] = useState<AdminProjectItem[] | null>(null);
  const [scripts, setScripts] = useState<AdminScriptItem[] | null>(null);
  const [scenes, setScenes] = useState<AdminSceneItem[] | null>(null);
  const [generations, setGenerations] = useState<AdminUserGenerationsResponse | null>(null);
  const [assets, setAssets] = useState<AdminAssetItem[] | null>(null);
  const [sessions, setSessions] = useState<AdminSessionItem[] | null>(null);
  const [activity, setActivity] = useState<AdminActivityLogItem[] | null>(null);
  const [banHistory, setBanHistory] = useState<AdminBanHistoryItem[] | null>(null);

  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [showBan, setShowBan] = useState(false);
  const [showUnban, setShowUnban] = useState(false);
  const [showRole, setShowRole] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminUserDetail(userId);
      setDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load user details.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    if (!userId || tab === 'overview') return;
    let active = true;
    const loadTab = async () => {
      setTabLoading(true);
      try {
        if (tab === 'projects' && !projects) {
          const data = await getAdminUserProjects(userId);
          if (active) setProjects(data);
        } else if (tab === 'scripts' && !scripts) {
          const data = await getAdminUserScripts(userId);
          if (active) setScripts(data);
        } else if (tab === 'scenes' && !scenes) {
          const data = await getAdminUserScenes(userId);
          if (active) setScenes(data);
        } else if (tab === 'generations' && !generations) {
          const data = await getAdminUserGenerations(userId);
          if (active) setGenerations(data);
        } else if (tab === 'assets' && !assets) {
          const data = await getAdminUserAssets(userId);
          if (active) setAssets(data);
        } else if (tab === 'sessions' && !sessions) {
          const data = await getAdminUserSessions(userId);
          if (active) setSessions(data);
        } else if (tab === 'activity' && !activity) {
          const data = await getAdminUserActivity(userId);
          if (active) setActivity(data);
        } else if (tab === 'bans' && !banHistory) {
          const data = await getAdminUserBanHistory(userId);
          if (active) setBanHistory(data);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load user workspace data.');
        }
      } finally {
        if (active) setTabLoading(false);
      }
    };
    void loadTab();
    return () => {
      active = false;
    };
  }, [activity, assets, banHistory, generations, projects, scenes, scripts, sessions, tab, userId]);

  const user = detail?.user;
  const targetRole = normalizeRoleClient(user?.role);
  const isSuperAdmin = isSuperAdminClient(profile?.role);
  const targetManageable =
    Boolean(user) &&
    !(actorRole === 'admin' && (targetRole === 'admin' || targetRole === 'super_admin'));

  const canEdit = targetManageable && hasClientPermission(profile, 'users.edit');
  const canDelete = targetManageable && hasClientPermission(profile, 'users.delete');
  const canBan =
    targetManageable &&
    user?.id !== profile?.id &&
    user?.accountStatus !== 'deleted' &&
    hasClientPermission(profile, 'users.ban');
  const canUnban =
    targetManageable &&
    user?.id !== profile?.id &&
    user?.accountStatus !== 'deleted' &&
    hasClientPermission(profile, 'users.unban');
  const canExport = hasClientPermission(profile, 'reports.export');

  const handleExportJson = async () => {
    if (!user) return;
    try {
      const data = await exportAdminUserData(user.id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `briqen-user-${user.id}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setNotice('User inspection snapshot downloaded.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.');
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    if (!user) return;
    try {
      const msg = await revokeAdminUserSession(user.id, sessionId);
      setNotice(msg);
      const updated = await getAdminUserSessions(user.id);
      setSessions(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke session.');
    }
  };

  return (
    <AdminLayout
      title={user ? user.fullName || user.email : 'User Inspection'}
      subtitle={user ? `${user.email} · Complete account & creative telemetry` : 'Loading account'}
      actions={
        <Link
          to="/admin/users"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Users</span>
        </Link>
      }
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

      {loading || !detail || !user ? (
        <div className="py-20 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Action Toolbar */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-3.5 flex flex-wrap items-center gap-2">
            {canEdit && user.accountStatus !== 'deleted' && (
              <Link
                to={`/admin/users/${user.id}/edit`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold"
              >
                <Edit3 className="h-3.5 w-3.5" />
                <span>Edit Profile</span>
              </Link>
            )}

            {isSuperAdmin && user.id !== profile?.id && user.accountStatus !== 'deleted' && (
              <button
                type="button"
                onClick={() => setShowRole(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Shield className="h-3.5 w-3.5 text-amber-500" />
                <span>Change Role</span>
              </button>
            )}

            {canBan && user.accountStatus !== 'banned' && (
              <button
                type="button"
                onClick={() => setShowBan(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-medium hover:bg-red-500/10"
              >
                <Ban className="h-3.5 w-3.5" />
                <span>Ban User</span>
              </button>
            )}

            {canUnban && user.accountStatus === 'banned' && (
              <button
                type="button"
                onClick={() => setShowUnban(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-medium hover:bg-emerald-500/10"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Unban User</span>
              </button>
            )}

            {canEdit && !user.isVerified && user.accountStatus !== 'deleted' && (
              <button
                type="button"
                onClick={() =>
                  void triggerAdminVerification(user.id)
                    .then((m) => setNotice(m))
                    .catch((e) => setError(e instanceof Error ? e.message : 'Failed'))
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <MailCheck className="h-3.5 w-3.5 text-sky-500" />
                <span>Send Verification</span>
              </button>
            )}

            {canEdit && user.accountStatus !== 'deleted' && (
              <button
                type="button"
                onClick={() =>
                  void triggerAdminPasswordReset(user.id)
                    .then((m) => setNotice(m))
                    .catch((e) => setError(e instanceof Error ? e.message : 'Failed'))
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <KeyRound className="h-3.5 w-3.5 text-orange-500" />
                <span>Trigger Password Reset</span>
              </button>
            )}

            {canExport && (
              <button
                type="button"
                onClick={() => void handleExportJson()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export JSON</span>
              </button>
            )}

            {canDelete && user.accountStatus === 'deleted' && (
              <button
                type="button"
                onClick={() =>
                  void restoreAdminUser(user.id)
                    .then((res) => {
                      setNotice(res.message);
                      void loadDetail();
                    })
                    .catch((e) => setError(e instanceof Error ? e.message : 'Restore failed'))
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-medium hover:bg-emerald-500/10"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Restore Account</span>
              </button>
            )}

            {canDelete && user.id !== profile?.id && (
              <button
                type="button"
                onClick={() => setShowDelete(true)}
                className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-medium hover:bg-red-500/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete Account</span>
              </button>
            )}
          </div>

          {/* Inspection Tabs */}
          <div className="flex flex-wrap gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-2">
            {(
              [
                ['overview', 'Overview', true],
                ['projects', `Projects (${detail.counts.projects})`, hasClientPermission(profile, 'projects.view')],
                ['scripts', `Scripts (${detail.counts.scripts})`, hasClientPermission(profile, 'scripts.view')],
                ['scenes', `Scenes (${detail.counts.scenes})`, hasClientPermission(profile, 'scenes.view')],
                ['generations', `AI Jobs & Exports (${detail.counts.generationActions})`, hasClientPermission(profile, 'generations.view')],
                ['assets', `Media Assets (${detail.counts.assets})`, hasClientPermission(profile, 'assets.view')],
                ['sessions', `Sessions (${detail.counts.activeSessions})`, hasClientPermission(profile, 'users.view')],
                ['activity', 'Activity', hasClientPermission(profile, 'analytics.operational.view')],
                ['bans', `Ban History (${detail.counts.banHistoryCount})`, hasClientPermission(profile, 'users.view')],
              ] as Array<[DetailTab, string, boolean]>
            )
              .filter(([, , allowed]) => allowed)
              .map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  tab === key
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'overview' && <UserProfileCard detail={detail} />}

          {tab !== 'overview' && tabLoading ? (
            <div className="py-12 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
            </div>
          ) : (
            <>
              {tab === 'projects' && projects && <UserProjectTable projects={projects} />}

              {tab === 'scripts' && scripts && (
                <div className="space-y-3">
                  {scripts.length === 0 ? (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-10 text-center text-xs text-slate-500">
                      No script revisions created.
                    </div>
                  ) : (
                    scripts.map((s) => (
                      <div
                        key={s.id}
                        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-4 space-y-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="px-1.5 py-0.5 rounded-md border border-amber-500/30 bg-amber-500/10 font-mono text-[11px] text-amber-700 dark:text-amber-300">
                              v{s.versionNumber}
                            </span>
                            <span className="text-xs font-semibold text-slate-900 dark:text-white">
                              {s.title}
                            </span>
                            <span className="text-[11px] text-slate-500">
                              {s.projectTitle} · {s.platform} · {s.aiModelUsed}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-400 tabular-nums">
                            {formatAdminDateTime(s.createdAt)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap line-clamp-4">
                          {s.content}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}

              {tab === 'scenes' && scenes && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] overflow-hidden">
                  {scenes.length === 0 ? (
                    <div className="p-10 text-center text-xs text-slate-500">
                      No storyboard scenes found.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                      {scenes.map((sc) => (
                        <div key={sc.id} className="p-4 space-y-1.5">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-semibold text-slate-900 dark:text-white">
                              Scene {sc.sceneOrder}: {sc.title} · {sc.projectTitle}
                            </span>
                            <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                              {sc.durationSec}s · {sc.generationStatus}
                            </span>
                          </div>
                          <p className="text-slate-600 dark:text-slate-300">{sc.narration}</p>
                          <p className="text-[11px] text-slate-400">
                            Prompt: {sc.imagePrompt || sc.videoPrompt || sc.visualDescription}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {tab === 'generations' && generations && (
                <UserGenerationHistory data={generations} />
              )}

              {tab === 'assets' && assets && <UserAssetGallery assets={assets} />}

              {tab === 'sessions' && sessions && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] overflow-hidden">
                  {sessions.length === 0 ? (
                    <div className="p-10 text-center text-xs text-slate-500">
                      No refresh session tokens recorded.
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0E1118] text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          <th className="py-2.5 px-4">Device / User Agent</th>
                          <th className="py-2.5 px-3">IP Address</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3">Expires</th>
                          <th className="py-2.5 px-4 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                        {sessions.map((s) => (
                          <tr key={s.id}>
                            <td className="py-2.5 px-4 max-w-xs truncate">
                              {s.userAgent || 'Browser / API Session'}
                            </td>
                            <td className="py-2.5 px-3 font-mono">{s.ipAddress || '—'}</td>
                            <td className="py-2.5 px-3 capitalize">{s.status}</td>
                            <td className="py-2.5 px-3 tabular-nums">
                              {formatAdminDateTime(s.expiresAt)}
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              {s.status === 'active' && canEdit ? (
                                <button
                                  type="button"
                                  onClick={() => void handleRevokeSession(s.id)}
                                  className="px-2.5 py-1 rounded-md border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10"
                                >
                                  Revoke
                                </button>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {tab === 'activity' && activity && <UserActivityTimeline activities={activity} />}

              {tab === 'bans' && banHistory && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                  {banHistory.length === 0 ? (
                    <div className="p-10 text-center text-slate-500">
                      Clean moderation record — no bans recorded.
                    </div>
                  ) : (
                    banHistory.map((item) => (
                      <div key={item.id} className="p-4 flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="px-1.5 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 font-mono uppercase text-[10px]">
                              {item.action}
                            </span>
                            {item.banType && (
                              <span className="text-slate-500 capitalize">({item.banType})</span>
                            )}
                          </div>
                          <p className="font-medium text-slate-900 dark:text-white">{item.reason}</p>
                          {item.internalNote && (
                            <p className="text-[11px] text-slate-500">Note: {item.internalNote}</p>
                          )}
                          <p className="text-[11px] text-slate-400">
                            By {item.performedByEmail || item.performedBy || 'System'}
                            {item.expiresAt
                              ? ` · Expires ${formatAdminDateTime(item.expiresAt)}`
                              : ''}
                          </p>
                        </div>
                        <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                          {formatAdminDateTime(item.createdAt)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {showBan && user && (
        <BanUserModal
          user={user}
          onClose={() => setShowBan(false)}
          onSuccess={(_updated, msg) => {
            setShowBan(false);
            setNotice(msg);
            setBanHistory(null);
            void loadDetail();
          }}
        />
      )}

      {showUnban && user && (
        <UnbanUserModal
          user={user}
          onClose={() => setShowUnban(false)}
          onSuccess={(_updated, msg) => {
            setShowUnban(false);
            setNotice(msg);
            setBanHistory(null);
            void loadDetail();
          }}
        />
      )}

      {showRole && user && (
        <RoleManagementModal
          user={user}
          actorRole={actorRole}
          onClose={() => setShowRole(false)}
          onSuccess={(_updated, msg) => {
            setShowRole(false);
            setNotice(msg);
            void loadDetail();
          }}
        />
      )}

      {showDelete && user && (
        <DeleteUserConfirmation
          user={user}
          actorRole={actorRole}
          onClose={() => setShowDelete(false)}
          onDeleted={(mode, msg) => {
            setShowDelete(false);
            if (mode === 'permanent') {
              navigate('/admin/users', { replace: true });
            } else {
              setNotice(msg);
              void loadDetail();
            }
          }}
        />
      )}
    </AdminLayout>
  );
};
