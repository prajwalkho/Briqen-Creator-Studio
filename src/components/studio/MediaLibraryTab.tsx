import React, { useState } from 'react';
import { Download, Trash2, Upload } from 'lucide-react';
import { apiRequest } from '../../services/api';
import { Asset, Project, Scene } from '../../types/studio';

interface MediaLibraryTabProps {
  project: Project;
  assets: Asset[];
  scenes: Scene[];
  onRefreshAll: () => Promise<void>;
}

export const MediaLibraryTab: React.FC<MediaLibraryTabProps> = ({
  project,
  assets,
  scenes,
  onRefreshAll,
}) => {
  const [filter, setFilter] = useState<'all' | 'image' | 'video' | 'audio_tts' | 'audio_music'>('all');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const filtered = assets.filter((a) => (filter === 'all' ? true : a.assetType === filter));

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    setStatusMsg(null);
    try {
      const form = new FormData();
      form.append('file', file);
      await apiRequest(`/projects/${project.id}/assets/upload`, {
        method: 'POST',
        body: form,
      });
      setStatusMsg(`Uploaded ${file.name}`);
      await onRefreshAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleAssignToScene = async (assetId: string, sceneId: string) => {
    if (!sceneId) return;
    setError(null);
    try {
      await apiRequest(`/assets/${assetId}/select`, {
        method: 'POST',
        body: JSON.stringify({ sceneId }),
      });
      setStatusMsg('Asset assigned to scene.');
      await onRefreshAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to assign asset.');
    }
  };

  const handleDelete = async (assetId: string) => {
    setError(null);
    try {
      await apiRequest(`/assets/${assetId}`, { method: 'DELETE' });
      await onRefreshAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete asset.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-200/70 dark:bg-[#13161E] border border-slate-200 dark:border-slate-800/80">
          {(
            [
              ['all', 'All Assets'],
              ['image', 'Images'],
              ['video', 'Videos'],
              ['audio_tts', 'Voiceovers'],
              ['audio_music', 'Music'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                filter === key
                  ? 'bg-white dark:bg-[#1E2330] text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs cursor-pointer transition-colors whitespace-nowrap">
          <Upload className="h-3.5 w-3.5" />
          <span>{uploading ? 'Uploading...' : 'Upload Media'}</span>
          <input
            type="file"
            accept="image/*,video/*,audio/*"
            onChange={handleUpload}
            className="hidden"
          />
        </label>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-500">
          {error}
        </div>
      )}
      {statusMsg && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-600 dark:text-emerald-400">
          {statusMsg}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#13161E] p-12 text-center text-sm text-slate-500">
          No assets in this category yet. Generate media from Scenes or upload files directly.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((asset) => (
            <div
              key={asset.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#13161E] overflow-hidden flex flex-col"
            >
              <div className="aspect-video bg-slate-950 flex items-center justify-center p-2">
                {asset.assetType === 'video' ? (
                  <video
                    src={asset.signedUrl}
                    controls
                    className="h-full w-full object-contain"
                  />
                ) : asset.assetType === 'audio_tts' || asset.assetType === 'audio_music' ? (
                  <div className="w-full px-4 space-y-2 text-center">
                    <p className="text-xs font-mono text-amber-400">{asset.assetType}</p>
                    <audio src={asset.signedUrl} controls className="w-full h-9" />
                  </div>
                ) : (
                  <img
                    src={asset.signedUrl}
                    alt={asset.fileName}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-contain"
                  />
                )}
              </div>

              <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-xs font-mono text-slate-500 tabular-nums">
                    {asset.provider} · {asset.model} · {Math.round(asset.fileSizeBytes / 1024)} KB
                  </p>
                  <p className="text-sm font-semibold truncate">{asset.fileName}</p>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/70">
                  {asset.assetType !== 'audio_music' && scenes.length > 0 && (
                    <select
                      defaultValue=""
                      onChange={(e) => void handleAssignToScene(asset.id, e.target.value)}
                      className="flex-1 min-w-0 px-2 py-1.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-xs"
                    >
                      <option value="" disabled>
                        Assign to scene...
                      </option>
                      {scenes.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.title}
                        </option>
                      ))}
                    </select>
                  )}

                  <a
                    href={asset.downloadUrl}
                    download
                    className="p-1.5 rounded-md border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-amber-500"
                    title="Download asset"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>

                  <button
                    type="button"
                    onClick={() => void handleDelete(asset.id)}
                    className="p-1.5 rounded-md border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-red-500"
                    title="Delete unused asset"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
