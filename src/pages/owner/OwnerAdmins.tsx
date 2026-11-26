import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  Check,
  Crown,
  KeyRound,
  Loader2,
  Shield,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react';
import {
  formatAdminDateTime,
  formatRoleName,
  normalizeRoleClient,
  roleBadgeClasses,
  statusDotClasses,
} from '../../components/admin/adminUtils';
import { useAuth } from '../../context/AuthContext';
import { OwnerLayout } from '../../layouts/OwnerLayout';
import {
  createOwnerAdmin,
  getOwnerAdminDetail,
  listOwnerAdmins,
  listOwnerPermissions,
  updateOwnerAdmin,
  updateOwnerAdminPermissions,
  type OwnerAdminDetail,
  type OwnerAdminSummary,
  type OwnerPermissionDefinition,
} from '../../services/ownerService';

export const OwnerAdmins: React.FC = () => {
  const { adminId } = useParams<{ adminId?: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [admins, setAdmins] = useState<OwnerAdminSummary[]>([]);
  const [catalog, setCatalog] = useState<OwnerPermissionDefinition[]>([]);
  const [detail, setDetail] = useState<OwnerAdminDetail | null>(null);
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingPerms, setSavingPerms] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Create Admin Modal state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [createPerms, setCreatePerms] = useState<string[]>([
    'users.view',
    'projects.view',
    'scripts.view',
    'scenes.view',
    'generations.view',
    'assets.view',
    'analytics.operational.view',
  ]);
  const [creating, setCreating] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [admList, permCatalog] = await Promise.all([
        listOwnerAdmins(),
        listOwnerPermissions(),
      ]);
      setAdmins(admList);
      setCatalog(permCatalog);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load administrators.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const [d, permCatalog] = await Promise.all([
        getOwnerAdminDetail(id),
        listOwnerPermissions(),
      ]);
      setDetail(d);
      setSelectedPerms(d.permissions);
      setCatalog(permCatalog);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin detail.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (adminId) {
      void loadDetail(adminId);
    } else {
      setDetail(null);
      void loadList();
    }
  }, [adminId, loadDetail, loadList]);

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await createOwnerAdmin({
        fullName: fullName.trim(),
        email: email.trim(),
        password,
        permissions: createPerms,
      });
      setShowCreate(false);
      setFullName('');
      setEmail('');
      setPassword('');
      setNotice(res.message);
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create admin.');
    } finally {
      setCreating(false);
    }
  };

  const handleSavePermissions = async () => {
    if (!detail) return;
    setSavingPerms(true);
    setError(null);
    try {
      const res = await updateOwnerAdminPermissions(detail.admin.id, selectedPerms);
      setNotice(res.message);
      await loadDetail(detail.admin.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update permissions.');
    } finally {
      setSavingPerms(false);
    }
  };

  const handleStatusOrRoleUpdate = async (patch: {
    accountStatus?: 'active' | 'suspended' | 'banned';
    role?: 'user' | 'admin' | 'super_admin';
    banReason?: string;
  }) => {
    if (!detail) return;
    setUpdatingStatus(true);
    setError(null);
    try {
      const res = await updateOwnerAdmin(detail.admin.id, patch);
      setNotice(res.message);
      if (patch.role === 'user') {
        navigate('/owner/admins');
      } else {
        await loadDetail(detail.admin.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update administrator.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const togglePerm = (name: string) => {
    setSelectedPerms((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]
    );
  };

  const toggleCreatePerm = (name: string) => {
    setCreatePerms((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]
    );
  };

  if (adminId) {
    const adminRole = normalizeRoleClient(detail?.admin.role);
    const isSelf = detail?.admin.id === profile?.id;

    return (
      <OwnerLayout
        title={detail ? `Admin Inspection: ${detail.admin.fullName || detail.admin.email}` : 'Admin Detail'}
        subtitle={detail ? `${detail.admin.email} · ${formatRoleName(detail.admin.role)}` : 'Loading profile'}
        actions={
          <Link
            to="/owner/admins"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Admins</span>
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

        {loading || !detail ? (
          <div className="py-20 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary + Lifecycle Actions */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-5 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                    {detail.admin.fullName || detail.admin.email}
                  </h2>
                  <span
                    className={`px-2 py-0.5 rounded-md border text-[11px] font-medium ${roleBadgeClasses(
                      detail.admin.role
                    )}`}
                  >
                    {formatRoleName(detail.admin.role)}
                  </span>
                  <span
                    className={`text-xs font-medium ${
                      statusDotClasses(detail.admin.accountStatus).text
                    }`}
                  >
                    · {statusDotClasses(detail.admin.accountStatus).label}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {detail.admin.email} · Last login: {formatAdminDateTime(detail.admin.lastLoginAt)}
                </p>
              </div>

              {!isSelf && (
                <div className="flex flex-wrap items-center gap-2">
                  {detail.admin.accountStatus === 'active' ? (
                    <button
                      type="button"
                      disabled={updatingStatus}
                      onClick={() =>
                        void handleStatusOrRoleUpdate({
                          accountStatus: 'suspended',
                          banReason: 'Suspended by Platform Owner',
                        })
                      }
                      className="px-3 py-1.5 rounded-lg border border-orange-500/30 text-orange-600 dark:text-orange-400 text-xs font-medium hover:bg-orange-500/10"
                    >
                      Suspend Admin
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={updatingStatus}
                      onClick={() => void handleStatusOrRoleUpdate({ accountStatus: 'active' })}
                      className="px-3 py-1.5 rounded-lg border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-medium hover:bg-emerald-500/10"
                    >
                      Reactivate Admin
                    </button>
                  )}

                  {adminRole === 'admin' && (
                    <button
                      type="button"
                      disabled={updatingStatus}
                      onClick={() => void handleStatusOrRoleUpdate({ role: 'user' })}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-medium hover:bg-red-500/10"
                    >
                      <UserMinus className="h-3.5 w-3.5" />
                      <span>Demote to Regular User</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Admin Operational Telemetry */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-4">
                <p className="text-[11px] text-slate-500">Total Admin Actions</p>
                <p className="mt-1 font-display text-2xl font-bold tabular-nums">
                  {detail.stats.totalActions}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-4">
                <p className="text-[11px] text-slate-500">Users Managed / Created</p>
                <p className="mt-1 font-display text-2xl font-bold tabular-nums">
                  {detail.stats.managedUsersCount} / {detail.stats.createdUsersCount}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-4">
                <p className="text-[11px] text-slate-500">Ban / Unban Ops</p>
                <p className="mt-1 font-display text-2xl font-bold tabular-nums">
                  {detail.stats.banOperations} / {detail.stats.unbanOperations}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-4">
                <p className="text-[11px] text-slate-500">Denied Checks / Sessions</p>
                <p className="mt-1 font-display text-2xl font-bold tabular-nums">
                  {detail.stats.deniedAttempts} / {detail.stats.activeSessions}
                </p>
              </div>
            </div>

            {/* Granular Permission Assignment */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-amber-500" />
                    <span>Assigned Granular Permissions ({selectedPerms.length} / {catalog.length})</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {adminRole === 'super_admin'
                      ? 'Super Admins inherit unrestricted platform access.'
                      : 'Changes take effect immediately across all /api/v1/admin/* endpoints.'}
                  </p>
                </div>
                {adminRole === 'admin' && (
                  <button
                    type="button"
                    disabled={savingPerms}
                    onClick={() => void handleSavePermissions()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold disabled:opacity-60"
                  >
                    {savingPerms ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    <span>Save Permissions</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {catalog.map((perm) => {
                  const active = adminRole === 'super_admin' || selectedPerms.includes(perm.name);
                  return (
                    <label
                      key={perm.name}
                      className={`flex items-start gap-2.5 p-3 rounded-lg border text-xs transition-colors ${
                        active
                          ? 'border-amber-500/40 bg-amber-500/5'
                          : 'border-slate-200 dark:border-slate-800'
                      } ${adminRole === 'super_admin' ? 'opacity-75' : 'cursor-pointer'}`}
                    >
                      <input
                        type="checkbox"
                        disabled={adminRole === 'super_admin'}
                        checked={active}
                        onChange={() => togglePerm(perm.name)}
                        className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-amber-500"
                      />
                      <div className="min-w-0">
                        <p className="font-mono font-semibold text-slate-900 dark:text-white">
                          {perm.name}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {perm.description}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Audit Trail & Sessions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-amber-500" />
                  <h3 className="font-display text-sm font-semibold">Recent Admin Audit Log</h3>
                </div>
                {detail.auditLogs.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    No administrative actions logged yet.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs max-h-96 overflow-y-auto">
                    {detail.auditLogs.map((log) => (
                      <div key={log.id} className="px-5 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-mono font-semibold text-slate-900 dark:text-white truncate">
                            {log.action} ({log.outcome})
                          </p>
                          <p className="text-[11px] text-slate-500 truncate">
                            {log.targetEmail ? `Target: ${log.targetEmail}` : log.entityType}
                          </p>
                        </div>
                        <span className="text-[11px] font-mono text-slate-400 tabular-nums shrink-0">
                          {formatAdminDateTime(log.createdAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
                  <h3 className="font-display text-sm font-semibold">
                    Recent Ban Operations & Active Sessions
                  </h3>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs max-h-96 overflow-y-auto">
                  {detail.sessions.slice(0, 5).map((s) => (
                    <div key={s.id} className="px-5 py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 dark:text-white truncate">
                          {s.userAgent || 'API / Browser Session'}
                        </p>
                        <p className="text-[11px] font-mono text-slate-500">
                          {s.ipAddress || 'unknown IP'} · {s.status}
                        </p>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400 tabular-nums shrink-0">
                        {formatAdminDateTime(s.createdAt)}
                      </span>
                    </div>
                  ))}
                  {detail.banOperations.slice(0, 5).map((b) => (
                    <div key={b.id} className="px-5 py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 dark:text-white truncate">
                          {b.action.toUpperCase()} → {b.targetEmail || b.userId}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">{b.reason}</p>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400 tabular-nums shrink-0">
                        {formatAdminDateTime(b.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </OwnerLayout>
    );
  }

  return (
    <OwnerLayout
      title="Admin Management & Oversight"
      subtitle="Create worker Admins, inspect administrative actions, and revoke or suspend admin access"
      actions={
        <div className="flex items-center gap-2">
          <Link
            to="/owner/permissions"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <KeyRound className="h-3.5 w-3.5 text-amber-500" />
            <span>Permission Matrix</span>
          </Link>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold"
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span>Create Admin</span>
          </button>
        </div>
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

      {loading ? (
        <div className="py-20 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0E1118] text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Administrator</th>
                  <th className="py-3 px-3">Role</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Permissions</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                  <th className="py-3 px-3 text-right">Denied</th>
                  <th className="py-3 px-3 text-right">Sessions</th>
                  <th className="py-3 px-3">Last Action</th>
                  <th className="py-3 px-4 text-right">Manage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {admins.map((adm) => {
                  const statusMeta = statusDotClasses(adm.accountStatus);
                  const isOwner = normalizeRoleClient(adm.role) === 'super_admin';
                  return (
                    <tr key={adm.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0">
                            {isOwner ? <Crown className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                          </span>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 dark:text-white truncate">
                              {adm.fullName || adm.email}
                              {adm.isDemoAccount ? ' · Demo' : ''}
                            </p>
                            <p className="text-[11px] text-slate-500 truncate">{adm.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded-md border text-[11px] font-medium ${roleBadgeClasses(
                            adm.role
                          )}`}
                        >
                          {formatRoleName(adm.role)}
                        </span>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 font-medium ${statusMeta.text}`}>
                          <span className={`h-2 w-2 rounded-full ${statusMeta.dot}`} />
                          <span>{statusMeta.label}</span>
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums">
                        {isOwner ? 'All (20)' : `${adm.permissionCount} / ${catalog.length || 20}`}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums">
                        {adm.totalActionsPerformed}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-amber-600 dark:text-amber-400">
                        {adm.deniedAttempts}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums">
                        {adm.activeSessionCount}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap tabular-nums text-slate-500">
                        {formatAdminDateTime(adm.lastAdminActionAt)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <Link
                          to={`/owner/admins/${adm.id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          Inspect & Edit
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  Create Worker Admin Account
                </h2>
                <p className="text-xs text-slate-500">
                  Defaults to strictly scoped operational permissions (never full Super Admin control).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAdmin} className="p-5 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="block text-xs font-medium">Full Name</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Alex Rivera"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium">Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="alex.admin@company.com"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium">Initial Password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 8 characters with complexity"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm"
                />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold">Initial Granular Permissions ({createPerms.length})</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                  {catalog.map((perm) => (
                    <label
                      key={perm.name}
                      className="flex items-start gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={createPerms.includes(perm.name)}
                        onChange={() => toggleCreatePerm(perm.name)}
                        className="mt-0.5 h-3.5 w-3.5 rounded text-amber-500"
                      />
                      <div className="min-w-0">
                        <span className="font-mono font-semibold block">{perm.name}</span>
                        <span className="text-[11px] text-slate-500">{perm.category}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold disabled:opacity-60"
                >
                  {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  <span>Create Admin</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </OwnerLayout>
  );
};
