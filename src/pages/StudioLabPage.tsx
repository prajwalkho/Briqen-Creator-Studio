import React, { useEffect, useState } from 'react';
import { FileSearch, Music, ScanSearch, Upload } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { StudioLayout } from '../layouts/StudioLayout';
import { apiRequest } from '../services/api';
import { GenerationJob, Project } from '../types/studio';

export const StudioLabPage: React.FC = () => {
  const { refreshProfile } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  // Lyria Music Studio state
  const [musicProvider, setMusicProvider] = useState<'gemini' | 'mock'>('gemini');
  const [musicModel, setMusicModel] = useState<'lyria-3-clip-preview' | 'lyria-3-pro-preview'>(
    'lyria-3-clip-preview'
  );
  const [musicPrompt, setMusicPrompt] = useState(
    'Upbeat modern electronic corporate soundtrack with warm analog synth pads and crisp percussion'
  );
  const [musicRefBase64, setMusicRefBase64] = useState<string | null>(null);
  const [musicRefMime, setMusicRefMime] = useState<string | null>(null);
  const [musicRefName, setMusicRefName] = useState<string | null>(null);
  const [musicJob, setMusicJob] = useState<GenerationJob | null>(null);
  const [musicBusy, setMusicBusy] = useState(false);
  const [musicError, setMusicError] = useState<string | null>(null);

  // Media Intelligence (Gemini 4 Neon) state
  const [analysisType, setAnalysisType] = useState<'image' | 'video'>('image');
  const [analysisFile, setAnalysisFile] = useState<File | null>(null);
  const [analysisQuestion, setAnalysisQuestion] = useState('');
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  useEffect(() => {
    const loadProjects = async () => {
      try {
        const res = await apiRequest<{ data: { projects: Project[] } }>('/projects');
        setProjects(res.data.projects);
        if (res.data.projects[0]) {
          setSelectedProjectId(res.data.projects[0].id);
        }
      } catch (err) {
        console.error('Failed to load projects for Studio Lab:', err);
      }
    };
    void loadProjects();
  }, []);

  // Poll music job status
  useEffect(() => {
    if (!musicJob || !['queued', 'processing', 'retrying'].includes(musicJob.status)) return;
    const timer = setInterval(async () => {
      try {
        const res = await apiRequest<{ data: GenerationJob }>(`/jobs/${musicJob.id}`);
        setMusicJob(res.data);
        if (res.data.status === 'succeeded' || res.data.status === 'failed') {
          await refreshProfile();
        }
      } catch {
        // ignore transient poll error
      }
    }, 2500);
    return () => clearInterval(timer);
  }, [musicJob, refreshProfile]);

  const handleMusicImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      setMusicRefBase64(result.split(',')[1] || '');
      setMusicRefMime(file.type || 'image/jpeg');
      setMusicRefName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateMusic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId) {
      setMusicError('Create a project first so the generated soundtrack can be saved to its Media Library.');
      return;
    }
    setMusicBusy(true);
    setMusicError(null);
    try {
      const res = await apiRequest<{ data: { job_id: string } }>(
        `/projects/${selectedProjectId}/generate-music`,
        {
          method: 'POST',
          body: JSON.stringify({
            provider: musicProvider,
            model: musicModel,
            prompt: musicPrompt,
            ...(musicRefBase64 && musicRefMime
              ? {
                  referenceImageBase64: musicRefBase64,
                  referenceImageMimeType: musicRefMime,
                }
              : {}),
          }),
        }
      );
      const jobRes = await apiRequest<{ data: GenerationJob }>(`/jobs/${res.data.job_id}`);
      setMusicJob(jobRes.data);
      await refreshProfile();
    } catch (err: unknown) {
      setMusicError(err instanceof Error ? err.message : 'Music generation failed.');
    } finally {
      setMusicBusy(false);
    }
  };

  const handleAnalyzeMedia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!analysisFile) {
      setAnalysisError(`Select a ${analysisType} file to analyze.`);
      return;
    }
    setAnalysisBusy(true);
    setAnalysisError(null);
    setAnalysisResult(null);
    try {
      const form = new FormData();
      form.append('file', analysisFile);
      if (analysisQuestion.trim()) {
        form.append('question', analysisQuestion.trim());
      }
      const res = await apiRequest<{ data: { analysis: string; modelUsed: string } }>(
        `/analyze/${analysisType}`,
        {
          method: 'POST',
          body: form,
        }
      );
      setAnalysisResult(res.data.analysis);
    } catch (err: unknown) {
      setAnalysisError(err instanceof Error ? err.message : 'Media analysis failed.');
    } finally {
      setAnalysisBusy(false);
    }
  };

  const generatedLyrics =
    typeof musicJob?.asset?.metadataJson?.lyrics === 'string'
      ? musicJob.asset.metadataJson.lyrics
      : '';

  return (
    <StudioLayout title="Audio & Media Intelligence">
      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <section className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#13161E] p-6 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800/70">
            <div className="flex items-center gap-2.5">
              <Music className="h-5 w-5 text-amber-500" />
              <div>
                <h2 className="font-display text-base font-semibold">Lyria Soundtrack Studio</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Generate 30s clips or full tracks saved directly to a project timeline.
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleGenerateMusic} className="space-y-4">
            {musicError && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-500">
                {musicError}
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Target Project
                </label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-xs"
                >
                  {projects.length === 0 ? (
                    <option value="">No projects created yet</option>
                  ) : (
                    projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Lyria Model &amp; Provider
                </label>
                <div className="flex gap-2">
                  <select
                    value={musicModel}
                    onChange={(e) => setMusicModel(e.target.value as typeof musicModel)}
                    className="flex-1 px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-xs"
                  >
                    <option value="lyria-3-clip-preview">Lyria 3 Clip (30s)</option>
                    <option value="lyria-3-pro-preview">Lyria 3 Pro (Full)</option>
                  </select>
                  <select
                    value={musicProvider}
                    onChange={(e) => setMusicProvider(e.target.value as 'gemini' | 'mock')}
                    className="px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-xs"
                  >
                    <option value="gemini">Gemini</option>
                    <option value="mock">Mock</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Music Prompt (Mood, Instruments, Tempo)
              </label>
              <textarea
                rows={3}
                value={musicPrompt}
                onChange={(e) => setMusicPrompt(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800">
                <Upload className="h-3.5 w-3.5" />
                <span>{musicRefName ? `Ref: ${musicRefName}` : 'Optional Visual Inspiration'}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleMusicImageSelect}
                  className="hidden"
                />
              </label>

              <button
                type="submit"
                disabled={musicBusy || !selectedProjectId}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors disabled:opacity-50"
              >
                {musicBusy ? 'Queuing Track...' : 'Generate Soundtrack'}
              </button>
            </div>
          </form>

          {musicJob && (
            <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">Track Status</span>
                <span className="font-mono capitalize">{musicJob.status}</span>
              </div>
              {musicJob.errorMessage && (
                <p className="text-xs text-red-500">{musicJob.errorMessage}</p>
              )}
              {musicJob.asset?.signedUrl && (
                <audio
                  key={musicJob.asset.signedUrl}
                  src={musicJob.asset.signedUrl}
                  controls
                  className="w-full h-9"
                />
              )}
              {generatedLyrics && (
                <pre className="text-xs text-slate-500 whitespace-pre-wrap font-sans max-h-40 overflow-y-auto">
                  {generatedLyrics}
                </pre>
              )}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#13161E] p-6 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800/70">
            <div className="flex items-center gap-2.5">
              <ScanSearch className="h-5 w-5 text-amber-500" />
              <div>
                <h2 className="font-display text-base font-semibold">
                  Multimodal Media Intelligence (Gemini 4 Neon)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Analyze uploaded photos or video clips for composition, pacing, and motion prompts.
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleAnalyzeMedia} className="space-y-4">
            {analysisError && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-500">
                {analysisError}
              </div>
            )}

            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 w-fit">
              <button
                type="button"
                onClick={() => {
                  setAnalysisType('image');
                  setAnalysisFile(null);
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                  analysisType === 'image'
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Analyze Image
              </button>
              <button
                type="button"
                onClick={() => {
                  setAnalysisType('video');
                  setAnalysisFile(null);
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                  analysisType === 'video'
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Analyze Video
              </button>
            </div>

            <div>
              <label className="flex items-center justify-center gap-2 p-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0D12] cursor-pointer hover:border-amber-500 transition-colors text-xs text-slate-500">
                <FileSearch className="h-4 w-4 text-amber-500" />
                <span>
                  {analysisFile
                    ? `${analysisFile.name} (${Math.round(analysisFile.size / 1024)} KB)`
                    : `Select ${analysisType === 'image' ? 'PNG / JPG / WEBP image' : 'MP4 / WEBM video'} to analyze`}
                </span>
                <input
                  type="file"
                  accept={analysisType === 'image' ? 'image/*' : 'video/*'}
                  onChange={(e) => setAnalysisFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
              </label>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Analysis Prompt (Optional)
              </label>
              <input
                type="text"
                value={analysisQuestion}
                onChange={(e) => setAnalysisQuestion(e.target.value)}
                placeholder={
                  analysisType === 'image'
                    ? 'e.g., Suggest a 6s camera animation prompt and critique lighting...'
                    : 'e.g., Summarize key moments with timestamps and pacing notes...'
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={analysisBusy || !analysisFile}
              className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 font-semibold text-xs hover:opacity-90 disabled:opacity-50"
            >
              {analysisBusy ? 'Analyzing with Gemini 4 Neon...' : `Analyze ${analysisType}`}
            </button>
          </form>

          {analysisResult && (
            <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-xs leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto">
              {analysisResult}
            </div>
          )}
        </section>
      </div>
    </StudioLayout>
  );
};
