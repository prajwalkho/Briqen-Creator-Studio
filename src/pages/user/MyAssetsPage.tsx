import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Download,
  Film,
  HardDrive,
  Image as ImageIcon,
  Loader2,
  Music,
  RefreshCw,
  Video,
} from 'lucide-react';
import { formatAdminDateTime, formatFileSize } from '../../components/admin/adminUtils';
import { StudioLayout } from '../../layouts/StudioLayout';
import { getMyAssetsBundle, type MyAssetsBundle } from '../../services/userService';

export const MyAssetsPage: React.FC = () => {
  const [assetType, setAssetType] = useState<'all' | 'image' | 'video' | 'audio'>('all');
  const [bundle, setBundle] = useState<MyAssetsBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getMyAssetsBundle(assetType);
      setBundle(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load your media assets.');
    } finally {
      setLoading(false);
    }
  }, [assetType]);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  return (
    <StudioLayout
      title="My Media Assets & Exports"
      primaryAction={
        <button
          type="button"
          onClick={() => void loadAssets()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      }
    >
      {error && (
        <div className="mb-5 p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {loading && !bundle ? (
        <div className="py-20 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
        </div>
      ) : bundle ? (
        <div className="space-y-6">
          {/* Storage Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-4">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Generated Assets</span>
                <ImageIcon className="h-4 w-4 text-amber-500" />
              </div>
              <p className="mt-1.5 font-display text-2xl font-bold tabular-nums">
                {bundle.summary.assetCount}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-4">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Rendered Video Exports</span>
                <Film className="h-4 w-4 text-sky-500" />
              </div>
              <p className="mt-1.5 font-display text-2xl font-bold tabular-nums">
                {bundle.summary.exportCount}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-4">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Total Storage Used</span>
                <HardDrive className="h-4 w-4 text-emerald-500" />
              </div>
              <p className="mt-1.5 font-display text-2xl font-bold tabular-nums">
                {formatFileSize(bundle.summary.totalStorageBytes)}
              </p>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              {(['all', 'image', 'video', 'audio'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setAssetType(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                    assetType === t
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Assets Grid */}
          <div className="space-y-3">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Media Assets ({bundle.assets.length})
            </h2>
            {bundle.assets.length === 0 ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-10 text-center text-xs text-slate-500">
                No generated media assets in this category yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {bundle.assets.map((asset) => (
                  <div
                    key={asset.id}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] overflow-hidden flex flex-col"
                  >
                    <div className="h-40 bg-slate-100 dark:bg-[#0B0D12] flex items-center justify-center overflow-hidden border-b border-slate-200 dark:border-slate-800">
                      {asset.assetType === 'image' ? (
                        <img
                          src={asset.signedUrl}
                          alt={asset.fileName}
                          className="w-full h-full object-cover"
                        />
                      ) : asset.assetType === 'video' ? (
                        <video
                          src={asset.signedUrl}
                          controls
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-2 p-4 text-slate-500 w-full">
                          <Music className="h-6 w-6 text-amber-500" />
                          <audio src={asset.signedUrl} controls className="w-full h-8" />
                        </div>
                      )}
                    </div>
                    <div className="p-4 flex-1 flex flex-col justify-between gap-3 text-xs">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900 dark:text-white truncate">
                            {asset.fileName}
                          </span>
                          <span className="font-mono text-[10px] uppercase px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                            {asset.assetType}
                          </span>
                        </div>
                        {asset.projectTitle && (
                          <Link
                            to={`/projects/${asset.projectId}`}
                            className="text-[11px] text-amber-700 dark:text-amber-400 hover:underline block truncate"
                          >
                            Project: {asset.projectTitle}
                          </Link>
                        )}
                        <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                          {asset.provider} · {formatFileSize(asset.fileSizeBytes)} ·{' '}
                          {formatAdminDateTime(asset.createdAt)}
                        </p>
                      </div>
                      <a
                        href={asset.downloadUrl}
                        download={asset.fileName}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Download Asset</span>
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Exports Table */}
          <div className="space-y-3">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Rendered Exports ({bundle.exports.length})
            </h2>
            {bundle.exports.length === 0 ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-10 text-center text-xs text-slate-500">
                No exported videos yet. Trigger Quick Export or Final Render inside any project workspace.
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0E1118] text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        <th className="py-3 px-4">Export Title</th>
                        <th className="py-3 px-3">Project</th>
                        <th className="py-3 px-3">Format / Res</th>
                        <th className="py-3 px-3">Size</th>
                        <th className="py-3 px-3">Status</th>
                        <th className="py-3 px-3">Created</th>
                        <th className="py-3 px-4 text-right">Download</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                      {bundle.exports.map((exp) => (
                        <tr key={exp.id}>
                          <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                            <Video className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                            <span>{exp.title}</span>
                          </td>
                          <td className="py-3 px-3">
                            <Link
                              to={`/projects/${exp.projectId}`}
                              className="text-amber-700 dark:text-amber-400 hover:underline"
                            >
                              {exp.projectTitle || exp.projectId}
                            </Link>
                          </td>
                          <td className="py-3 px-3 font-mono">
                            {exp.format} · {exp.resolution}
                          </td>
                          <td className="py-3 px-3 font-mono tabular-nums">
                            {formatFileSize(exp.fileSizeBytes)}
                          </td>
                          <td className="py-3 px-3 capitalize font-mono">{exp.status}</td>
                          <td className="py-3 px-3 font-mono tabular-nums text-slate-500">
                            {formatAdminDateTime(exp.createdAt)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {exp.downloadUrl ? (
                              <a
                                href={exp.downloadUrl}
                                download
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                <Download className="h-3.5 w-3.5" />
                                <span>Download</span>
                              </a>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </StudioLayout>
  );
};
