import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { ArrowUpRight, Film, Plus, Search, Trash2, X } from 'lucide-react';
import { StudioLayout } from '../layouts/StudioLayout';
import { apiRequest } from '../services/api';
import { DashboardStats, Project } from '../types/studio';

const createProjectSchema = z.object({
  title: z.string().trim().min(2, 'Project title must be at least 2 characters').max(160),
  description: z.string().trim().max(1000).optional(),
  brandName: z.string().trim().max(120).optional(),
  targetAudience: z.string().trim().max(240).optional(),
  platform: z.enum(['YouTube', 'Instagram', 'TikTok', 'LinkedIn', 'Facebook', 'Web']),
  aspectRatio: z.enum(['16:9', '9:16', '1:1', '4:3']),
});

const FALLBACK_THUMBNAILS = [
  '/src/assets/images/sample_product_launch_1795602333574.jpg',
  '/src/assets/images/sample_brand_story_1795602334394.jpg',
  '/src/assets/images/studio_hero_cinema_1795602333947.jpg',
];

export const DashboardPage: React.FC<{ mode?: 'dashboard' | 'projects' }> = ({
  mode = 'dashboard',
}) => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalProjects: 0,
    completedProjects: 0,
    processingProjects: 0,
    failedJobs: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('updated_desc');

  const [modalOpen, setModalOpen] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formBrand, setFormBrand] = useState('');
  const [formAudience, setFormAudience] = useState('');
  const [formPlatform, setFormPlatform] = useState<'YouTube' | 'Instagram' | 'TikTok' | 'LinkedIn' | 'Facebook' | 'Web'>('YouTube');
  const [formRatio, setFormRatio] = useState<'16:9' | '9:16' | '1:1' | '4:3'>('16:9');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        search,
        status: statusFilter,
        sort: sortBy,
      });
      const res = await apiRequest<{ data: { projects: Project[]; stats: DashboardStats } }>(
        `/projects?${qs.toString()}`
      );
      setProjects(res.data.projects);
      setStats(res.data.stats);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load projects.');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, sortBy]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchProjects();
    }, 150);
    return () => clearTimeout(timer);
  }, [fetchProjects]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const parsed = createProjectSchema.safeParse({
      title: formTitle,
      description: formDesc,
      brandName: formBrand,
      targetAudience: formAudience,
      platform: formPlatform,
      aspectRatio: formRatio,
    });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message || 'Please check project details.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiRequest<{ data: Project }>('/projects', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      setModalOpen(false);
      setFormTitle('');
      setFormDesc('');
      setFormBrand('');
      setFormAudience('');
      navigate(`/projects/${res.data.id}`);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to create project.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteProject = async (projectId: string, title: string) => {
    try {
      await apiRequest(`/projects/${projectId}`, { method: 'DELETE' });
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
      setStats((prev) => ({ ...prev, totalProjects: Math.max(0, prev.totalProjects - 1) }));
    } catch (err: unknown) {
      setError(`Could not delete "${title}": ${err instanceof Error ? err.message : 'Error'}`);
    }
  };

  return (
    <StudioLayout
      title={mode === 'projects' ? 'Projects' : 'Dashboard'}
      primaryAction={
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>New Project</span>
        </button>
      }
    >
      <div className="space-y-8">
        {mode === 'dashboard' && (
          <section className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl font-bold tracking-tight text-balance">
                  Production Overview
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  Manage scripts, scene storyboards, AI media jobs, and FFmpeg video renders.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 border border-slate-200 dark:border-slate-800/80 rounded-xl bg-white dark:bg-[#13161E] divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800/80">
              <div className="p-5">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Total Projects
                </p>
                <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">
                  {stats.totalProjects}
                </p>
              </div>
              <div className="p-5">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Completed Exports
                </p>
                <p className="mt-2 font-mono text-2xl font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {stats.completedProjects}
                </p>
              </div>
              <div className="p-5">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Processing
                </p>
                <p className="mt-2 font-mono text-2xl font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                  {stats.processingProjects}
                </p>
              </div>
              <div className="p-5">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Failed Jobs
                </p>
                <p className="mt-2 font-mono text-2xl font-semibold text-red-600 dark:text-red-400 tabular-nums">
                  {stats.failedJobs}
                </p>
              </div>
            </div>
          </section>
        )}

        <section className="space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search projects by title or brand..."
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] text-sm focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-200/70 dark:bg-[#13161E] border border-slate-200 dark:border-slate-800/80">
                {(['all', 'draft', 'processing', 'completed', 'failed'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatusFilter(s)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors whitespace-nowrap ${
                      statusFilter === s
                        ? 'bg-white dark:bg-[#1E2330] text-slate-900 dark:text-slate-100 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] text-xs font-medium focus:outline-none focus:border-amber-500"
              >
                <option value="updated_desc">Recently Modified</option>
                <option value="created_desc">Newest Created</option>
                <option value="title_asc">Title (A–Z)</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="p-4 rounded-lg border border-red-500/30 bg-red-500/10 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="h-72 rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#13161E] animate-pulse"
                />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#13161E] p-12 text-center space-y-4">
              <div className="mx-auto h-12 w-12 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center">
                <Film className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-display text-lg font-semibold">No video projects yet</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  Create your first campaign project to draft an AI script, extract scenes, generate media, and render a draft video.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span>Create First Project</span>
              </button>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {projects.map((project, idx) => {
                const thumbSrc =
                  project.thumbnailUrl || FALLBACK_THUMBNAILS[idx % FALLBACK_THUMBNAILS.length];
                const statusLabel =
                  project.status === 'completed'
                    ? 'Completed'
                    : project.status === 'processing'
                      ? 'Processing'
                      : project.status === 'failed'
                        ? 'Attention needed'
                        : 'Draft';

                return (
                  <article
                    key={project.id}
                    className="group rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#13161E] overflow-hidden flex flex-col transition-colors hover:border-slate-300 dark:hover:border-slate-700"
                  >
                    <Link
                      to={`/projects/${project.id}`}
                      className="relative aspect-video bg-slate-900 overflow-hidden block"
                    >
                      <img
                        src={thumbSrc}
                        alt={project.title}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
                      <span className="absolute bottom-3 left-3 text-xs font-medium text-white/90">
                        {statusLabel}
                      </span>
                    </Link>

                    <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span>{project.platform}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">{project.aspectRatio}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">
                            {new Date(project.updatedAt).toLocaleDateString()}
                          </span>
                        </div>
                        <Link
                          to={`/projects/${project.id}`}
                          className="font-display text-base font-semibold text-slate-900 dark:text-slate-100 hover:text-amber-500 dark:hover:text-amber-400 transition-colors line-clamp-1 block"
                        >
                          {project.title}
                        </Link>
                        <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                          {project.description || project.brandName || 'Ready for script and scene production.'}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800/70">
                        <Link
                          to={`/projects/${project.id}`}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline whitespace-nowrap"
                        >
                          <span>Open Studio</span>
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => void handleDeleteProject(project.id, project.title)}
                          className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                          aria-label={`Delete ${project.title}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">New Video Project</h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-200"
                aria-label="Close modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="space-y-4">
              {formError && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-500">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  Project Title
                </label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g., Q4 Acoustic Speaker Launch"
                  className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                    Brand / Product
                  </label>
                  <input
                    type="text"
                    value={formBrand}
                    onChange={(e) => setFormBrand(e.target.value)}
                    placeholder="e.g., Briqen Audio"
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                    Target Audience
                  </label>
                  <input
                    type="text"
                    value={formAudience}
                    onChange={(e) => setFormAudience(e.target.value)}
                    placeholder="e.g., Design-conscious creators"
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                    Platform
                  </label>
                  <select
                    value={formPlatform}
                    onChange={(e) => setFormPlatform(e.target.value as typeof formPlatform)}
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm focus:outline-none focus:border-amber-500"
                  >
                    <option value="YouTube">YouTube</option>
                    <option value="Instagram">Instagram</option>
                    <option value="TikTok">TikTok</option>
                    <option value="LinkedIn">LinkedIn</option>
                    <option value="Facebook">Facebook</option>
                    <option value="Web">Web</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                    Aspect Ratio
                  </label>
                  <select
                    value={formRatio}
                    onChange={(e) => setFormRatio(e.target.value as typeof formRatio)}
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm focus:outline-none focus:border-amber-500"
                  >
                    <option value="16:9">16:9 Landscape</option>
                    <option value="9:16">9:16 Vertical</option>
                    <option value="1:1">1:1 Square</option>
                    <option value="4:3">4:3 Standard</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Campaign goals, product highlights, or visual direction..."
                  className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors disabled:opacity-60"
                >
                  {submitting ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </StudioLayout>
  );
};
