import React, { useEffect, useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Copy,
  Download,
  Film,
  GripVertical,
  Image as ImageIcon,
  Play,
  Square,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../services/api';
import { Asset, ExportRecord, Project, Scene } from '../../types/studio';

interface TimelineExportTabProps {
  project: Project;
  scenes: Scene[];
  assets: Asset[];
  exportsList: ExportRecord[];
  onScenesReordered: (scenes: Scene[]) => void;
  onRefreshAll: () => Promise<void>;
}

const SortableTimelineRow: React.FC<{
  scene: Scene;
  index: number;
  asset: Asset | null;
  onUpdateDuration: (id: string, sec: number) => void;
  onUpdateTransition: (id: string, transition: Scene['transition']) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}> = ({
  scene,
  index,
  asset,
  onUpdateDuration,
  onUpdateTransition,
  onDuplicate,
  onDelete,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: scene.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#13161E] p-3.5 flex flex-wrap sm:flex-nowrap items-center gap-4"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1.5 text-slate-400 hover:text-slate-200 shrink-0"
        aria-label={`Drag ${scene.title}`}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="h-12 w-20 rounded-lg bg-slate-950 border border-slate-800 overflow-hidden shrink-0 flex items-center justify-center">
        {asset ? (
          asset.assetType === 'video' ? (
            <video src={asset.signedUrl} muted className="h-full w-full object-cover" />
          ) : (
            <img
              src={asset.signedUrl}
              alt={scene.title}
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
            />
          )
        ) : (
          <ImageIcon className="h-4 w-4 text-slate-500" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-mono text-slate-500 tabular-nums">
          Track {String(index + 1).padStart(2, '0')} · {asset ? asset.assetType : 'Missing Asset'}
        </p>
        <p className="text-sm font-semibold truncate">{scene.title}</p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <label className="text-[11px] text-slate-500">Duration</label>
        <input
          type="number"
          min={1}
          max={60}
          value={scene.durationSec}
          onChange={(e) => onUpdateDuration(scene.id, Math.max(1, Number(e.target.value) || 5))}
          className="w-16 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-xs font-mono tabular-nums text-right"
        />
        <span className="text-[11px] text-slate-500">s</span>
      </div>

      <select
        value={scene.transition}
        onChange={(e) => onUpdateTransition(scene.id, e.target.value as Scene['transition'])}
        className="px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-xs shrink-0"
      >
        <option value="fade">Fade</option>
        <option value="dissolve">Dissolve</option>
        <option value="wipeleft">Wipe Left</option>
        <option value="none">Cut (None)</option>
      </select>

      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => onDuplicate(scene.id)}
          className="p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"
          title="Duplicate scene"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(scene.id)}
          className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-500/10"
          title="Remove scene"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};

export const TimelineExportTab: React.FC<TimelineExportTabProps> = ({
  project,
  scenes,
  assets,
  exportsList,
  onScenesReordered,
  onRefreshAll,
}) => {
  const { preferences } = useAuth();
  const sensors = useSensors(useSensor(PointerSensor));
  const [selectedMusicId, setSelectedMusicId] = useState<string>(
    project.selectedMusicAssetId || ''
  );
  const [exportTitle, setExportTitle] = useState(`${project.title} Draft`);
  const [exportQuality, setExportQuality] = useState<'standard' | 'low'>(
    preferences?.defaultExportQuality || 'standard'
  );
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewIdx, setPreviewIdx] = useState(0);

  useEffect(() => {
    if (preferences?.defaultExportQuality) {
      setExportQuality(preferences.defaultExportQuality);
    }
  }, [preferences?.defaultExportQuality]);

  const musicAssets = assets.filter((a) => a.assetType === 'audio_music');
  const totalDuration = scenes.reduce((sum, s) => sum + (s.durationSec || 5), 0);
  const missingCount = scenes.filter((s) => !s.selectedAssetId).length;

  const hasActiveExport = exportsList.some((e) =>
    ['queued', 'processing'].includes(e.status)
  );

  useEffect(() => {
    if (!hasActiveExport) return;
    const timer = setInterval(() => {
      void onRefreshAll();
    }, 2000);
    return () => clearInterval(timer);
  }, [hasActiveExport, onRefreshAll]);

  useEffect(() => {
    if (!previewPlaying || scenes.length === 0) return;
    const currentScene = scenes[previewIdx] || scenes[0];
    const durMs = Math.max(1500, (currentScene?.durationSec || 4) * 1000);
    const timer = setTimeout(() => {
      if (previewIdx + 1 < scenes.length) {
        setPreviewIdx((i) => i + 1);
      } else {
        setPreviewPlaying(false);
        setPreviewIdx(0);
      }
    }, durMs);
    return () => clearTimeout(timer);
  }, [previewPlaying, previewIdx, scenes]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIdx = scenes.findIndex((s) => s.id === active.id);
    const newIdx = scenes.findIndex((s) => s.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;

    const reordered = arrayMove(scenes, oldIdx, newIdx).map((s, idx) => ({
      ...s,
      sceneOrder: idx,
    }));
    onScenesReordered(reordered);

    try {
      await apiRequest(`/projects/${project.id}/scenes/reorder`, {
        method: 'PUT',
        body: JSON.stringify({
          orderedSceneIds: reordered.map((s) => s.id),
        }),
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to persist scene order.');
      await onRefreshAll();
    }
  };

  const handleUpdateDuration = async (sceneId: string, sec: number) => {
    onScenesReordered(
      scenes.map((s) => (s.id === sceneId ? { ...s, durationSec: sec } : s))
    );
    try {
      await apiRequest(`/scenes/${sceneId}`, {
        method: 'PATCH',
        body: JSON.stringify({ durationSec: sec }),
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update scene duration.');
    }
  };

  const handleUpdateTransition = async (sceneId: string, transition: Scene['transition']) => {
    onScenesReordered(
      scenes.map((s) => (s.id === sceneId ? { ...s, transition } : s))
    );
    try {
      await apiRequest(`/scenes/${sceneId}`, {
        method: 'PATCH',
        body: JSON.stringify({ transition }),
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update transition.');
    }
  };

  const handleDuplicate = async (sceneId: string) => {
    await apiRequest(`/scenes/${sceneId}/duplicate`, { method: 'POST' });
    await onRefreshAll();
  };

  const handleDelete = async (sceneId: string) => {
    await apiRequest(`/scenes/${sceneId}`, { method: 'DELETE' });
    await onRefreshAll();
  };

  const handleExportVideo = async () => {
    setError(null);
    setExporting(true);
    try {
      await apiRequest(`/projects/${project.id}/exports`, {
        method: 'POST',
        body: JSON.stringify({
          title: exportTitle,
          musicAssetId: selectedMusicId || null,
          quality: exportQuality,
        }),
      });
      await onRefreshAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not queue export.');
    } finally {
      setExporting(false);
    }
  };

  const previewScene = scenes[previewIdx] || scenes[0] || null;
  const previewAsset = previewScene
    ? assets.find((a) => a.id === previewScene.selectedAssetId) || null
    : null;
  const latestSucceededExport = exportsList.find((e) => e.status === 'succeeded' && e.previewUrl);

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3.5 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-500">
          {error}
        </div>
      )}

      <div className="grid lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold">
                Drag-and-Drop Scene Timeline
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Drag handles to reorder scenes · Total runtime:{' '}
                <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  {totalDuration}s
                </span>
              </p>
            </div>
            <button
              type="button"
              disabled={scenes.length === 0}
              onClick={() => {
                setPreviewIdx(0);
                setPreviewPlaying((p) => !p);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              {previewPlaying ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              <span>{previewPlaying ? 'Stop Sequence' : 'Preview Sequence'}</span>
            </button>
          </div>

          {scenes.length === 0 ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#13161E] p-10 text-center text-sm text-slate-500">
              Add scenes in Script Studio or Scenes tab before editing the timeline.
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(e) => void handleDragEnd(e)}
            >
              <SortableContext
                items={scenes.map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2.5">
                  {scenes.map((scene, idx) => (
                    <SortableTimelineRow
                      key={scene.id}
                      scene={scene}
                      index={idx}
                      asset={assets.find((a) => a.id === scene.selectedAssetId) || null}
                      onUpdateDuration={(id, sec) => void handleUpdateDuration(id, sec)}
                      onUpdateTransition={(id, t) => void handleUpdateTransition(id, t)}
                      onDuplicate={(id) => void handleDuplicate(id)}
                      onDelete={(id) => void handleDelete(id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        <div className="lg:col-span-5 space-y-5">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#13161E] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold">Sequence Monitor</h3>
              {previewScene && (
                <span className="text-xs font-mono text-slate-500 tabular-nums">
                  Scene {previewIdx + 1}/{scenes.length} · {previewScene.durationSec}s
                </span>
              )}
            </div>

            <div className="aspect-video rounded-lg bg-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center relative">
              {previewAsset ? (
                previewAsset.assetType === 'video' ? (
                  <video
                    key={previewAsset.signedUrl}
                    src={previewAsset.signedUrl}
                    autoPlay={previewPlaying}
                    controls={!previewPlaying}
                    muted
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <img
                    src={previewAsset.signedUrl}
                    alt={previewScene?.title || 'Preview'}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-contain"
                  />
                )
              ) : (
                <p className="text-xs text-slate-500">No visual asset selected</p>
              )}

              {previewScene?.narration && (
                <div className="absolute bottom-2 left-3 right-3 px-3 py-1.5 rounded bg-black/75 text-white text-xs text-center line-clamp-2">
                  {previewScene.narration}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#13161E] p-5 space-y-4">
            <h3 className="font-display text-base font-semibold">FFmpeg Draft Video Export</h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Export Title
                </label>
                <input
                  type="text"
                  value={exportTitle}
                  onChange={(e) => setExportTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Export Quality Preset
                </label>
                <select
                  value={exportQuality}
                  onChange={(e) => setExportQuality(e.target.value as 'standard' | 'low')}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm"
                >
                  <option value="standard">Standard HD (720p)</option>
                  <option value="low">Quick Draft (360p)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Background Music Track (Optional)
                </label>
                <select
                  value={selectedMusicId}
                  onChange={(e) => setSelectedMusicId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm"
                >
                  <option value="">No background music</option>
                  {musicAssets.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.fileName} ({m.model})
                    </option>
                  ))}
                </select>
              </div>

              {missingCount > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {missingCount} scene(s) still need a selected image or video before FFmpeg export can run.
                </p>
              )}

              <button
                type="button"
                disabled={exporting || scenes.length === 0 || missingCount > 0}
                onClick={handleExportVideo}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors disabled:opacity-50"
              >
                <Film className="h-4 w-4" />
                <span>{exporting ? 'Queuing FFmpeg Render...' : 'Render Draft MP4 Video'}</span>
              </button>
            </div>

            {latestSucceededExport && (
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    Latest Rendered MP4
                  </span>
                  <a
                    href={latestSucceededExport.downloadUrl || '#'}
                    download
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 text-xs font-semibold"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Download MP4</span>
                  </a>
                </div>
                <video
                  key={latestSucceededExport.previewUrl}
                  src={latestSucceededExport.previewUrl || undefined}
                  controls
                  className="w-full rounded-lg border border-slate-800 bg-black aspect-video"
                />
              </div>
            )}

            {exportsList.length > 0 && (
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <p className="text-xs font-semibold text-slate-500">Export Jobs</p>
                {exportsList.slice(0, 5).map((exp) => (
                  <div
                    key={exp.id}
                    className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{exp.title}</span>
                      <span className="font-mono capitalize text-[11px] tabular-nums shrink-0 text-slate-500 dark:text-slate-400">
                        {exp.resolution} · {exp.status} · {exp.job?.progressPct ?? 0}%
                      </span>
                    </div>
                    {exp.job && exp.status !== 'succeeded' && (
                      <div className="space-y-1">
                        <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                          <div
                            className="h-full bg-amber-500 transition-all"
                            style={{ width: `${exp.job.progressPct}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-slate-500">
                          {exp.job.errorMessage || exp.job.currentStep}
                        </p>
                      </div>
                    )}
                    {exp.downloadUrl && (
                      <a
                        href={exp.downloadUrl}
                        download
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:underline"
                      >
                        <Download className="h-3 w-3" />
                        <span>Download ({Math.round((exp.fileSizeBytes || 0) / 1024)} KB)</span>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
