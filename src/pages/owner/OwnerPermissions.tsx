import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Save } from 'lucide-react';
import { normalizeRoleClient } from '../../components/admin/adminUtils';
import { OwnerLayout } from '../../layouts/OwnerLayout';
import {
  listOwnerAdmins,
  listOwnerPermissions,
  updateOwnerAdminPermissions,
  type OwnerAdminSummary,
  type OwnerPermissionDefinition,
} from '../../services/ownerService';

export const OwnerPermissions: React.FC = () => {
  const [catalog, setCatalog] = useState<OwnerPermissionDefinition[]>([]);
  const [admins, setAdmins] = useState<OwnerAdminSummary[]>([]);
  const [draftMap, setDraftMap] = useState<Record<string, string[]>>({});
  const [dirtyIds, setDirtyIds] = useState<Record<string, boolean>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadMatrix = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [perms, adminRows] = await Promise.all([
        listOwnerPermissions(),
        listOwnerAdmins(),
      ]);
      setCatalog(perms);
      const workerAdmins = adminRows.filter((a) => normalizeRoleClient(a.role) === 'admin');
      setAdmins(workerAdmins);
      const nextMap: Record<string, string[]> = {};
      for (const a of workerAdmins) {
        nextMap[a.id] = a.permissions || [];
      }
      setDraftMap(nextMap);
      setDirtyIds({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load permission matrix.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMatrix();
  }, [loadMatrix]);

  const groupedCatalog = useMemo(() => {
    const groups = new Map<string, OwnerPermissionDefinition[]>();
    for (const item of catalog) {
      const list = groups.get(item.category) || [];
      list.push(item);
      groups.set(item.category, list);
    }
    return Array.from(groups.entries());
  }, [catalog]);

  const toggleCell = (adminId: string, permName: string) => {
    setDraftMap((prev) => {
      const current = prev[adminId] || [];
      const next = current.includes(permName)
        ? current.filter((p) => p !== permName)
        : [...current, permName];
      return { ...prev, [adminId]: next };
    });
    setDirtyIds((prev) => ({ ...prev, [adminId]: true }));
  };

  const handleSaveAdmin = async (admin: OwnerAdminSummary) => {
    setSavingId(admin.id);
    setError(null);
    try {
      const res = await updateOwnerAdminPermissions(admin.id, draftMap[admin.id] || []);
      setDraftMap((prev) => ({ ...prev, [admin.id]: res.permissions }));
      setDirtyIds((prev) => ({ ...prev, [admin.id]: false }));
      setNotice(`Saved ${res.permissions.length} permissions for ${admin.fullName || admin.email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save permissions.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <OwnerLayout
      title="Admin Permission Matrix"
      subtitle="Configure database-backed granular capabilities for each worker Admin account"
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
      ) : admins.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-12 text-center text-xs text-slate-500">
          No worker Admin accounts exist yet. Super Admins always hold all 20 capabilities.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0E1118]">
                  <th className="py-3 px-4 min-w-[260px] text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Permission Capability
                  </th>
                  {admins.map((adm) => (
                    <th key={adm.id} className="py-3 px-3 min-w-[145px] text-center align-top">
                      <div className="space-y-1.5">
                        <p className="font-semibold text-slate-900 dark:text-white truncate">
                          {adm.fullName || adm.email.split('@')[0]}
                        </p>
                        <p className="text-[10px] font-mono text-slate-500 truncate">{adm.email}</p>
                        <button
                          type="button"
                          disabled={!dirtyIds[adm.id] || savingId === adm.id}
                          onClick={() => void handleSaveAdmin(adm)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                            dirtyIds[adm.id]
                              ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                              : 'border border-slate-200 dark:border-slate-800 text-slate-400 cursor-default'
                          }`}
                        >
                          {savingId === adm.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : dirtyIds[adm.id] ? (
                            <Save className="h-3 w-3" />
                          ) : (
                            <Check className="h-3 w-3" />
                          )}
                          <span>{dirtyIds[adm.id] ? 'Save' : 'Synced'}</span>
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {groupedCatalog.map(([category, perms]) => (
                  <React.Fragment key={category}>
                    <tr className="bg-slate-50/80 dark:bg-[#0B0D12]">
                      <td
                        colSpan={admins.length + 1}
                        className="py-2 px-4 text-[11px] font-mono font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400"
                      >
                        {category}
                      </td>
                    </tr>
                    {perms.map((perm) => (
                      <tr key={perm.name} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                        <td className="py-2.5 px-4">
                          <p className="font-mono font-semibold text-slate-900 dark:text-white">
                            {perm.name}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {perm.description}
                          </p>
                        </td>
                        {admins.map((adm) => {
                          const checked = (draftMap[adm.id] || []).includes(perm.name);
                          return (
                            <td key={adm.id} className="py-2.5 px-3 text-center">
                              <input
                                type="checkbox"
                                aria-label={`${perm.name} for ${adm.email}`}
                                checked={checked}
                                onChange={() => toggleCell(adm.id, perm.name)}
                                className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-amber-500 cursor-pointer"
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </OwnerLayout>
  );
};
