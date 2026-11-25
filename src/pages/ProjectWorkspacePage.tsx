import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  Film,
  FolderOpen,
  Layers,
  Loader2,
  ScrollText,
  X,
  Zap,
} from 'lucide-react';
import { StudioLayout } from '../layouts/StudioLayout';
import { apiRequest } from '../services/api';
import {
  Asset,
  ExportRecord,
  GenerationJob,
  Project,
  Scene,
  ScriptRevision,
} from '../types/studio';
import { ScriptStudioTab } from '../components/studio/ScriptStudioTab';
import { ScenesTab } from '../components/studio/ScenesTab';
import { TimelineExportTab } from '../components/studio/TimelineExportTab';
import { MediaLibraryTab } from '../components/studio/MediaLibraryTab';

type WorkspaceTab = 'script' | 'scenes' | 'timeline' | 'library';

export const ProjectWorkspacePage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('script');

  const [project, setProject] = useState<Project | null>(null);
  const [revisions, setRevisions] = useState<ScriptRevision[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [exportsList, setExportsList] = useState<ExportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [quickExportId, setQuickExportId] = useState<string | null>(null);
  const [quickExportRecord, setQuickExportRecord] = useState<ExportRecord | null>(null);
  const [quickExportBusy, setQuickExportBusy] = useState(false);
  const [quickExportError, setQuickExportError] = useState<string | null>(null);
  const [quickExportOpen, setQuickExportOpen] = useState(false);

  const loadWorkspace = useCallback(async () => {
    if (!projectId) return;
    try {
      const [projRes, revRes, sceneRes, assetRes, jobRes, expRes] = await Promise.all([
        apiRequest<{ data: Project }>(`/projects/${projectId}`),
        apiRequest<{ data: ScriptRevision[] }>(`/projects/${projectId}/scripts`),
        apiRequest<{ data: Scene[] }>(`/projects/${projectId}/scenes`),
        apiRequest<{ data: Asset[] }>(`/projects/${projectId}/assets`),
        apiRequest<{ data: GenerationJob[] }>(`/projects/${projectId}/jobs`),
        apiRequest<{ data: ExportRecord[] }>(`/projects/${projectId}/exports`),
      ]);
      setProject(projRes.data);
      setRevisions(revRes.data);
      setScenes(sceneRes.data);
      setAssets(assetRes.data);
      setJobs(jobRes.data);
      setExportsList(expRes.data);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load project workspace.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const isQuickExportRunning =
    quickExportBusy ||
    Boolean(quickExportRecord && ['queued', 'processing'].includes(quickExportRecord.status));

  useEffect(() => {
    if (!quickExportId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const pollExport = async () => {
      try {
        const res = await apiRequest<{ data: ExportRecord }>(`/exports/${quickExportId}`);
        if (cancelled) return;
        setQuickExportRecord(res.data);
        if (res.data.status === 'queued' || res.data.status === 'processing') {
          timer = setTimeout(() => void pollExport(), 1200);
        } else {
          await loadWorkspace();
        }
      } catch (err: unknown) {
        if (cancelled) return;
        setQuickExportError(
          err instanceof Error ? err.message : 'Failed to check quick export status.'
        );
      }
    };

    void pollExport();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [quickExportId, loadWorkspace]);

  const missingAssetScenes = scenes.filter((s) => !s.selectedAssetId);
  const canQuickExport = Boolean(project && scenes.length > 0 && missingAssetScenes.length === 0);
  const quickDraftResolution = project?.aspectRatio === '9:16' ? '360x640' : '640x360';
  const totalRuntimeSec = scenes.reduce((sum, s) => sum + (s.durationSec || 5), 0);

  const handleTriggerQuickExport = async () => {
    if (!project) return;
    setQuickExportOpen(true);

    if (isQuickExportRunning) {
      return;
    }

    if (scenes.length === 0) {
      setQuickExportError('Add at least one scene before running a quick export.');
      return;
    }

    if (missingAssetScenes.length > 0) {
      setQuickExportError(
        `${missingAssetScenes.length} scene(s) still need a selected image or video (${missingAssetScenes
          .slice(0, 2)
          .map((s) => s.title)
          .join(', ')}${missingAssetScenes.length > 2 ? ', ...' : ''}).`
      );
      return;
    }

    setQuickExportError(null);
    setQuickExportBusy(true);
    setQuickExportRecord(null);

    try {
      const res = await apiRequest<{
        data: { export_id: string; resolution?: string; status: string };
      }>(`/projects/${project.id}/exports`, {
        method: 'POST',
        body: JSON.stringify({
          title: `${project.title} Quick Draft (360p)`,
          quality: 'low',
          musicAssetId: project.selectedMusicAssetId || null,
        }),
      });
      setQuickExportId(res.data.export_id);
    } catch (err: unknown) {
      setQuickExportError(err instanceof Error ? err.message : 'Failed to start quick export.');
    } finally {
      setQuickExportBusy(false);
    }
  };

  const tabs: Array<{ id: WorkspaceTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'script', label: 'Script Studio', icon: ScrollText },
    { id: 'scenes', label: 'Scenes & Generation', icon: Layers },
    { id: 'timeline', label: 'Timeline & Export', icon: Film },
    { id: 'library', label: 'Media Library', icon: FolderOpen },
  ];

  const activeProgressPct = quickExportRecord?.job?.progressPct ?? (quickExportBusy ? 5 : 0);

  return (
    <StudioLayout
      title={project ? project.title : 'Project Workspace'}
      primaryAction={
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>All Projects</span>
        </Link>
      }
    >
      {loading ? (
        <div className="space-y-4">
          <div className="h-12 w-full rounded-xl bg-white dark:bg-[#13161E] animate-pulse" />
          <div className="h-96 w-full rounded-xl bg-white dark:bg-[#13161E] animate-pulse" />
        </div>
      ) : error || !project ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-500">
          {error || 'Project not found.'}
        </div>
      ) : (
        <div className="space-y-6 pb-24">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800/80">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>{project.brandName || 'Campaign'}</span>
              <span aria-hidden="true">·</span>
              <span>{project.platform}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{project.aspectRatio}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{scenes.length} scenes</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{assets.length} assets</span>
            </div>

            <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-200/70 dark:bg-[#13161E] border border-slate-200 dark:border-slate-800/80">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-white dark:bg-[#1E2330] text-slate-900 dark:text-slate-100 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {activeTab === 'script' && (
            <ScriptStudioTab
              project={project}
              revisions={revisions}
              onRevisionsChange={(nextRevs) => {
                setRevisions(nextRevs);
                if (nextRevs[0]?.id) {
                  setProject((prev) =>
                    prev ? { ...prev, activeScriptRevisionId: nextRevs[0].id } : prev
                  );
                }
              }}
              onScenesExtracted={(extracted) => {
                setScenes(extracted);
                setActiveTab('scenes');
              }}
            />
          )}

          {activeTab === 'scenes' && (
            <ScenesTab
              project={project}
              scenes={scenes}
              assets={assets}
              jobs={jobs}
              onRefreshAll={loadWorkspace}
            />
          )}

          {activeTab === 'timeline' && (
            <TimelineExportTab
              project={project}
              scenes={scenes}
              assets={assets}
              exportsList={exportsList}
              onScenesReordered={setScenes}
              onRefreshAll={loadWorkspace}
            />
          )}

          {activeTab === 'library' && (
            <MediaLibraryTab
              project={project}
              assets={assets}
              scenes={scenes}
              onRefreshAll={loadWorkspace}
            />
          )}

          <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3">
            {quickExportOpen && (
              <div
                role="dialog"
                aria-label="Quick Export Draft"
                className="w-[calc(100vw-3rem)] sm:w-96 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] shadow-2xl p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      Quick Draft Export
                    </h3>
                    <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                      {quickExportRecord?.resolution || quickDraftResolution} MP4 · {scenes.length} scenes · {totalRuntimeSec}s
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setQuickExportOpen(false)}
                    aria-label="Close Quick Export status"
                    className="p-1 rounded-md text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {quickExportError && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400 space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>{quickExportError}</span>
                    </div>
                    {!canQuickExport && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab(scenes.length === 0 ? 'script' : 'scenes');
                          setQuickExportOpen(false);
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-semibold text-[11px] whitespace-nowrap"
                      >
                        {scenes.length === 0 ? 'Go to Script Studio' : 'Go to Scenes & Generation'}
                      </button>
                    )}
                  </div>
                )}

                {isQuickExportRunning && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 dark:text-slate-300 truncate">
                        {quickExportRecord?.job?.currentStep || 'Queuing 360p quick draft...'}
                      </span>
                      <span className="font-mono font-semibold text-amber-600 dark:text-amber-400 tabular-nums shrink-0">
                        {activeProgressPct}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-sm bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-amber-500 transition-all duration-300"
                        style={{ width: `${activeProgressPct}%` }}
                      />
                    </div>
                  </div>
                )}

                {quickExportRecord?.status === 'failed' && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400 space-y-2">
                    <p>{quickExportRecord.job?.errorMessage || 'Quick draft render failed.'}</p>
                    <button
                      type="button"
                      onClick={() => void handleTriggerQuickExport()}
                      className="px-2.5 py-1 rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-[11px]"
                    >
                      Retry Quick Export
                    </button>
                  </div>
                )}

                {quickExportRecord?.status === 'succeeded' && quickExportRecord.previewUrl && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs text-emerald-600 dark:text-emerald-400">
                      <span className="inline-flex items-center gap-1.5 font-semibold">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>360p Draft Ready</span>
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                        {Math.max(1, Math.round((quickExportRecord.fileSizeBytes || 0) / 1024))} KB
                      </span>
                    </div>

                    <video
                      key={quickExportRecord.previewUrl}
                      src={quickExportRecord.previewUrl}
                      controls
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-black aspect-video"
                    />

                    <div className="flex items-center gap-2">
                      <a
                        href={quickExportRecord.downloadUrl || '#'}
                        download
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 text-xs font-semibold hover:opacity-90 whitespace-nowrap"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Download 360p MP4</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => void handleTriggerQuickExport()}
                        className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                      >
                        Re-render
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-2">
              {!quickExportOpen && quickExportRecord && (
                <button
                  type="button"
                  onClick={() => setQuickExportOpen(true)}
                  className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] text-xs font-medium text-slate-700 dark:text-slate-200 shadow-lg hover:bg-slate-50 dark:hover:bg-[#1A1F2B] whitespace-nowrap shrink-0 tabular-nums"
                >
                  {quickExportRecord.status === 'succeeded'
                    ? 'View 360p Draft'
                    : quickExportRecord.status === 'failed'
                      ? 'Draft Failed'
                      : `Draft ${activeProgressPct}%`}
                </button>
              )}

              <button
                type="button"
                onClick={() => void handleTriggerQuickExport()}
                title="Render a fast 360p low-resolution draft MP4 without leaving the editor"
                className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs shadow-xl border border-amber-400/60 transition-colors whitespace-nowrap shrink-0"
              >
                {isQuickExportRunning ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="tabular-nums">Rendering 360p · {activeProgressPct}%</span>
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    <span>Quick Export · 360p</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </StudioLayout>
  );
};
