import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, FolderKanban, Loader2, Search, Trash2, X } from 'lucide-react';
import { formatAdminDateTime } from '../../components/admin/adminUtils';
import { OwnerLayout } from '../../layouts/OwnerLayout';
import { deleteOwnerProject, listOwnerProjects } from '../../services/ownerService';
import type { PaginationInfo } from '../../types/admin';

interface OwnerProjectRow {
  id: string;
  userId: string;
  userEmail: string;
  userFullName: string | null;
  isDemoAccount: boolean;
  title: string;
  brandName: string;
  platform: string;
  aspectRatio: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export const OwnerProjects: React.FC = () => {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [platform, setPlatform] = useState('');
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<OwnerProjectRow[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OwnerProjectRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listOwnerProjects({
        search: search.trim() || undefined,
        status: status || undefined,
        platform: platform || undefined,
        page,
        limit: 25,
      });
      setItems(data.items);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load platform projects.');
    } finally {
      setLoading(false);
    }
  }, [page, platform, search, status]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      const msg = await deleteOwnerProject(deleteTarget.id);
      setNotice(msg);
      setDeleteTarget(null);
      await loadProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <OwnerLayout
      title="Platform Projects Directory"
      subtitle="Inspect and moderate every creator project across the entire PostgreSQL database"
    >
      <div className="space-y-4">
        {notice && (
          <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)} className="underline text-[11px]">
              Dismiss
            </button>
          </div>
        )}
        {error && (
          <div className="p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by project title, brand, or owner email..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-xs"
            />
          </div>

          <select
            aria-label="Filter by project status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-xs"
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>

          <select
            aria-label="Filter by platform"
            value={platform}
            onChange={(e) => {
              setPlatform(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-xs"
          >
            <option value="">All Platforms</option>
            <option value="YouTube">YouTube</option>
            <option value="TikTok">TikTok</option>
            <option value="Instagram Reels">Instagram Reels</option>
            <option value="LinkedIn">LinkedIn</option>
            <option value="X / Twitter">X / Twitter</option>
          </select>
        </div>

        {loading ? (
          <div className="py-16 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-12 text-center text-xs text-slate-500">
            <FolderKanban className="h-6 w-6 mx-auto mb-2 text-slate-400" />
            No projects match the active filters.
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0E1118] text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-4">Project</th>
                    <th className="py-3 px-3">Owner</th>
                    <th className="py-3 px-3">Platform</th>
                    <th className="py-3 px-3">Aspect</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Updated</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {items.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-900 dark:text-white">{p.title}</p>
                        <p className="text-[11px] text-slate-500">{p.brandName || 'Untitled brand'}</p>
                      </td>
                      <td className="py-3 px-3">
                        <Link
                          to={`/admin/users/${p.userId}`}
                          className="font-medium text-amber-700 dark:text-amber-400 hover:underline block"
                        >
                          {p.userFullName || p.userEmail}
                        </Link>
                        <span className="text-[11px] text-slate-500">
                          {p.userEmail}
                          {p.isDemoAccount ? ' · Demo' : ''}
                        </span>
                      </td>
                      <td className="py-3 px-3">{p.platform}</td>
                      <td className="py-3 px-3 font-mono">{p.aspectRatio}</td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 font-mono text-[11px] capitalize">
                          {p.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums text-slate-500">
                        {formatAdminDateTime(p.updatedAt)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(p)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Delete</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-slate-500">
          <span className="tabular-nums">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} projects)
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Previous</span>
            </button>
            <button
              type="button"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 disabled:opacity-40"
            >
              <span>Next</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Delete Platform Project
              </h2>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Permanently remove project <strong className="text-slate-900 dark:text-white">{deleteTarget.title}</strong> owned by <span className="font-mono">{deleteTarget.userEmail}</span>? This cascades scripts, scenes, and project exports and is logged in the immutable audit trail.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void confirmDelete()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold disabled:opacity-60"
              >
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                <span>Delete Project</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </OwnerLayout>
  );
};
