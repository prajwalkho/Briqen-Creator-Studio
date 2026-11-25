import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Film, FolderOpen, Layers, ScrollText } from 'lucide-react';
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

  const tabs: Array<{ id: WorkspaceTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'script', label: 'Script Studio', icon: ScrollText },
    { id: 'scenes', label: 'Scenes & Generation', icon: Layers },
    { id: 'timeline', label: 'Timeline & Export', icon: Film },
    { id: 'library', label: 'Media Library', icon: FolderOpen },
  ];

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
        <div className="space-y-6">
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
              onRevisionsChange={setRevisions}
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
        </div>
      )}
    </StudioLayout>
  );
};
