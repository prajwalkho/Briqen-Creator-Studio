import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  Check,
  Copy,
  Image as ImageIcon,
  Mic,
  Plus,
  RefreshCw,
  RotateCw,
  Save,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../services/api';
import { Asset, GenerationJob, Project, ProviderOverview, Scene } from '../../types/studio';

interface ScenesTabProps {
  project: Project;
  scenes: Scene[];
  assets: Asset[];
  jobs: GenerationJob[];
  onRefreshAll: () => Promise<void>;
}

const STYLE_PRESETS = [
  'Commercial studio lighting, sharp focus',
  'Warm editorial film grain, shallow depth of field',
  'Minimalist architectural product showcase',
  'Vibrant social-first high-contrast aesthetic',
  'Cyberpunk neon studio rim light',
];

export const ScenesTab: React.FC<ScenesTabProps> = ({
  project,
  scenes,
  assets,
  jobs,
  onRefreshAll,
}) => {
  const { refreshProfile } = useAuth();
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(scenes[0]?.id ?? null);
  const [providerOverview, setProviderOverview] = useState<ProviderOverview | null>(null);
  const [provider, setProvider] = useState<'gemini' | 'openai' | 'mock'>('gemini');
  const [imageModel, setImageModel] = useState<
    'gemini-nano-banana-2.1' | 'gemini-3.1-flash-lite-image'
  >('gemini-nano-banana-2.1');
  const [imageAspectRatio, setImageAspectRatio] = useState<'16:9' | '9:16' | '1:1'>(
    project.aspectRatio === '9:16' ? '9:16' : project.aspectRatio === '1:1' ? '1:1' : '16:9'
  );
  const [resolution, setResolution] = useState<'1K' | '2K' | '4K'>('1K');
  const [videoRes, setVideoRes] = useState<'720p' | '1080p' | '360p'>('720p');
  const [styleHint, setStyleHint] = useState(STYLE_PRESETS[0]);
  const [useImageSearch, setUseImageSearch] = useState(false);

  // Voiceover (TTS) config
  const [voiceName, setVoiceName] = useState<'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr'>('Kore');
  const [voiceStyle, setVoiceStyle] = useState('Confident, warm commercial voiceover');

  // Optional reference image upload for Image Editing or Image-to-Video Animation
  const [refFileBase64, setRefFileBase64] = useState<string | null>(null);
  const [refFileMime, setRefFileMime] = useState<string | null>(null);
  const [refFileName, setRefFileName] = useState<string | null>(null);
  const [animateFromSceneImage, setAnimateFromSceneImage] = useState(false);

  const [editDraft, setEditDraft] = useState<Partial<Scene>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeScene = scenes.find((s) => s.id === selectedSceneId) || scenes[0] || null;

  useEffect(() => {
    let mounted = true;
    apiRequest<{ data: ProviderOverview }>('/ai/providers')
      .then((res) => {
        if (!mounted || !res.data) return;
        setProviderOverview(res.data);
        setProvider(res.data.defaults.imageProvider);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedSceneId && scenes.length > 0) {
      setSelectedSceneId(scenes[0].id);
    }
  }, [scenes, selectedSceneId]);

  useEffect(() => {
    if (activeScene) {
      setEditDraft({
        title: activeScene.title,
        narration: activeScene.narration,
        visualDescription: activeScene.visualDescription,
        imagePrompt: activeScene.imagePrompt,
        videoPrompt: activeScene.videoPrompt,
        durationSec: activeScene.durationSec,
        transition: activeScene.transition,
        mediaPreference: activeScene.mediaPreference,
      });
    }
  }, [activeScene?.id]);

  // Poll active jobs automatically
  const hasRunningJobs = jobs.some((j) =>
    ['queued', 'processing', 'retrying'].includes(j.status)
  );
  useEffect(() => {
    if (!hasRunningJobs) return;
    const interval = setInterval(() => {
      void onRefreshAll();
      void refreshProfile();
    }, 2000);
    return () => clearInterval(interval);
  }, [hasRunningJobs, onRefreshAll, refreshProfile]);

  const handleRefUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.split(',')[1] || '';
      setRefFileBase64(base64);
      setRefFileMime(file.type || 'image/png');
      setRefFileName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleAddScene = async () => {
    setBusy('add');
    setError(null);
    try {
      const res = await apiRequest<{ data: Scene }>(`/projects/${project.id}/scenes`, {
        method: 'POST',
        body: JSON.stringify({
          title: `Scene ${scenes.length + 1}`,
          narration: '',
          visualDescription: '',
          imagePrompt: '',
          videoPrompt: '',
          durationSec: 5,
        }),
      });
      await onRefreshAll();
      setSelectedSceneId(res.data.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add scene.');
    } finally {
      setBusy(null);
    }
  };

  const handleSaveScene = async () => {
    if (!activeScene) return;
    setBusy('save');
    setError(null);
    setStatusMsg(null);
    try {
      await apiRequest(`/ai/scenes/${activeScene.id}`, {
        method: 'PATCH',
        body: JSON.stringify(editDraft),
      });
      await onRefreshAll();
      setStatusMsg('Scene saved.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save scene.');
    } finally {
      setBusy(null);
    }
  };

  const handleDuplicate = async (sceneId: string) => {
    setBusy('dup');
    setError(null);
    try {
      await apiRequest(`/scenes/${sceneId}/duplicate`, { method: 'POST' });
      await onRefreshAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to duplicate scene.');
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (sceneId: string) => {
    setBusy('del');
    setError(null);
    try {
      await apiRequest(`/scenes/${sceneId}`, { method: 'DELETE' });
      await onRefreshAll();
      setSelectedSceneId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete scene.');
    } finally {
      setBusy(null);
    }
  };

  const handleGenerateImage = async () => {
    if (!activeScene) return;
    const prompt = (editDraft.imagePrompt || editDraft.visualDescription || editDraft.title || '').trim();
    if (!prompt) {
      setError('Enter an Image Prompt or Visual Description first.');
      return;
    }
    setBusy('gen-img');
    setError(null);
    setStatusMsg(null);
    try {
      const res = await apiRequest<{ message: string }>(`/ai/images/generate`, {
        method: 'POST',
        body: JSON.stringify({
          sceneId: activeScene.id,
          provider,
          model: imageModel,
          prompt,
          aspectRatio: imageAspectRatio,
          resolution,
          style: styleHint,
          useSearchGrounding: provider === 'gemini' ? useImageSearch : false,
          ...(refFileBase64 && refFileMime
            ? { referenceImageBase64: refFileBase64, referenceImageMimeType: refFileMime }
            : {}),
        }),
      });
      setStatusMsg(res.message);
      await onRefreshAll();
      await refreshProfile();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to queue image generation.');
    } finally {
      setBusy(null);
    }
  };

  const handleGenerateVideo = async () => {
    if (!activeScene) return;
    const prompt = (editDraft.videoPrompt || editDraft.visualDescription || editDraft.title || '').trim();
    if (!prompt) {
      setError('Enter a Video Prompt or Visual Description first.');
      return;
    }
    setBusy('gen-vid');
    setError(null);
    setStatusMsg(null);
    try {
      const res = await apiRequest<{ message: string }>(`/ai/videos/generate`, {
        method: 'POST',
        body: JSON.stringify({
          sceneId: activeScene.id,
          provider,
          prompt,
          aspectRatio: imageAspectRatio === '9:16' ? '9:16' : '16:9',
          resolution: videoRes,
          style: styleHint,
          durationSec: Math.min(15, Math.max(3, Number(editDraft.durationSec) || 6)),
          ...(refFileBase64 && refFileMime
            ? { referenceImageBase64: refFileBase64, referenceImageMimeType: refFileMime }
            : animateFromSceneImage && activeScene.selectedAssetId
              ? { referenceAssetId: activeScene.selectedAssetId }
              : {}),
        }),
      });
      setStatusMsg(res.message);
      await onRefreshAll();
      await refreshProfile();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to queue video generation.');
    } finally {
      setBusy(null);
    }
  };

  const handleGenerateTTS = async () => {
    if (!activeScene) return;
    const narration = (editDraft.narration || '').trim();
    if (!narration) {
      setError('Enter Narration text for this scene before generating voiceover.');
      return;
    }
    setBusy('gen-tts');
    setError(null);
    setStatusMsg(null);
    try {
      const ttsProvider = provider === 'mock' ? 'mock' : 'gemini';
      const res = await apiRequest<{ message: string }>(`/scenes/${activeScene.id}/generate-tts`, {
        method: 'POST',
        body: JSON.stringify({
          provider: ttsProvider,
          prompt: narration,
          voiceName,
          voiceStyle,
        }),
      });
      setStatusMsg(res.message);
      await onRefreshAll();
      await refreshProfile();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to queue voiceover.');
    } finally {
      setBusy(null);
    }
  };

  const handleRetryJob = async (jobId: string) => {
    setBusy(`retry-${jobId}`);
    setError(null);
    setStatusMsg(null);
    try {
      const res = await apiRequest<{ message: string }>(`/ai/jobs/${jobId}/retry`, {
        method: 'POST',
      });
      setStatusMsg(res.message);
      await onRefreshAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Retry failed.');
    } finally {
      setBusy(null);
    }
  };

  const handleCancelJob = async (jobId: string) => {
    setBusy(`cancel-${jobId}`);
    setError(null);
    try {
      const res = await apiRequest<{ message: string }>(`/ai/jobs/${jobId}/cancel`, {
        method: 'POST',
      });
      setStatusMsg(res.message);
      await onRefreshAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Cancel failed.');
    } finally {
      setBusy(null);
    }
  };

  const handleRegenerate = async () => {
    if (!activeScene) return;
    setBusy('regen');
    setError(null);
    try {
      const res = await apiRequest<{ message: string }>(`/scenes/${activeScene.id}/regenerate`, {
        method: 'POST',
        body: JSON.stringify({
          provider,
          mediaType: editDraft.mediaPreference || 'image',
        }),
      });
      setStatusMsg(res.message);
      await onRefreshAll();
      await refreshProfile();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Regeneration failed.');
    } finally {
      setBusy(null);
    }
  };

  const handleAcceptAsset = async (assetId: string) => {
    if (!activeScene) return;
    setBusy(`accept-${assetId}`);
    setError(null);
    try {
      const res = await apiRequest<{ message: string }>(`/ai/assets/${assetId}/accept`, {
        method: 'POST',
        body: JSON.stringify({ sceneId: activeScene.id }),
      });
      setStatusMsg(res.message);
      await onRefreshAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Accept failed.');
    } finally {
      setBusy(null);
    }
  };

  const handleRejectAsset = async (assetId: string) => {
    setBusy(`reject-${assetId}`);
    setError(null);
    try {
      const res = await apiRequest<{ message: string }>(`/ai/assets/${assetId}/reject`, {
        method: 'POST',
      });
      setStatusMsg(res.message);
      await onRefreshAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Reject failed.');
    } finally {
      setBusy(null);
    }
  };

  const selectedAsset = activeScene
    ? assets.find((a) => a.id === activeScene.selectedAssetId) || null
    : null;
  const voiceoverAsset = activeScene
    ? assets.find((a) => a.id === activeScene.voiceoverAssetId) || null
    : null;
  const sceneJobs = activeScene
    ? jobs.filter((j) => j.sceneId === activeScene.id).slice(0, 6)
    : [];
  const sceneVisualAssets = activeScene
    ? assets.filter(
        (a) =>
          a.sceneId === activeScene.id &&
          (a.assetType === 'image' || a.assetType === 'video')
      )
    : [];

  return (
    <div className="grid lg:grid-cols-12 gap-6 items-start">
      <div className="lg:col-span-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold">
            Scenes ({scenes.length})
          </h2>
          <button
            type="button"
            disabled={busy !== null}
            onClick={handleAddScene}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Scene</span>
          </button>
        </div>

        {scenes.length === 0 ? (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#13161E] p-8 text-center space-y-2">
            <p className="text-sm font-medium">No scenes yet</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Split a script in Script Studio or click Add Scene to start building manually.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {scenes.map((scene, idx) => {
              const isSelected = activeScene?.id === scene.id;
              const asset = assets.find((a) => a.id === scene.selectedAssetId);
              return (
                <div
                  key={scene.id}
                  onClick={() => setSelectedSceneId(scene.id)}
                  className={`cursor-pointer rounded-xl border p-3.5 transition-colors flex items-center gap-3 ${
                    isSelected
                      ? 'border-amber-500 bg-amber-500/8'
                      : 'border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#13161E] hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="h-12 w-20 rounded-lg bg-slate-900 overflow-hidden shrink-0 flex items-center justify-center border border-slate-800">
                    {asset ? (
                      asset.assetType === 'video' ? (
                        <video
                          src={asset.signedUrl}
                          muted
                          className="h-full w-full object-cover"
                        />
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
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      <span>{String(idx + 1).padStart(2, '0')}</span>
                      <span aria-hidden="true">·</span>
                      <span>{scene.durationSec}s</span>
                      <span aria-hidden="true">·</span>
                      <span className="capitalize">{scene.generationStatus}</span>
                    </div>
                    <p className="text-sm font-semibold truncate">{scene.title}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="lg:col-span-8 space-y-5">
        {!activeScene ? (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#13161E] p-12 text-center text-sm text-slate-500">
            Select or create a scene to edit prompts and generate AI media.
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#13161E] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800/70">
                <h3 className="font-display text-base font-semibold">
                  Scene Details &amp; Prompts
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void handleDuplicate(activeScene.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>Duplicate</span>
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void handleDelete(activeScene.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs text-red-500 hover:bg-red-500/10 whitespace-nowrap shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Delete</span>
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={handleSaveScene}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 text-xs font-semibold hover:opacity-90 whitespace-nowrap shrink-0"
                  >
                    <Save className="h-3.5 w-3.5" />
                    <span>{busy === 'save' ? 'Saving...' : 'Save Scene'}</span>
                  </button>
                </div>
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

              <div className="grid sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Scene Title
                  </label>
                  <input
                    type="text"
                    value={editDraft.title || ''}
                    onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Duration (3–15s for AI video)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={editDraft.durationSec || 5}
                    onChange={(e) =>
                      setEditDraft({ ...editDraft, durationSec: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm font-mono tabular-nums focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Narration / Voiceover Script
                  </label>
                  <textarea
                    rows={3}
                    value={editDraft.narration || ''}
                    onChange={(e) => setEditDraft({ ...editDraft, narration: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Visual Direction
                  </label>
                  <textarea
                    rows={3}
                    value={editDraft.visualDescription || ''}
                    onChange={(e) =>
                      setEditDraft({ ...editDraft, visualDescription: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Image Generation Prompt
                  </label>
                  <textarea
                    rows={2}
                    value={editDraft.imagePrompt || ''}
                    onChange={(e) => setEditDraft({ ...editDraft, imagePrompt: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Video Motion Prompt
                  </label>
                  <textarea
                    rows={2}
                    value={editDraft.videoPrompt || ''}
                    onChange={(e) => setEditDraft({ ...editDraft, videoPrompt: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#13161E] p-5 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800/70">
                <h3 className="font-display text-base font-semibold">AI Media &amp; Voiceover Generation</h3>
                <div className="flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800">
                  {(
                    [
                      ['gemini', 'Gemini', providerOverview ? providerOverview.configuredKeys.gemini : true],
                      ['openai', 'OpenAI', providerOverview ? providerOverview.configuredKeys.openai : false],
                      ['mock', 'Mock Mode', true],
                    ] as const
                  ).map(([key, label, configured]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setProvider(key)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                        provider === key
                          ? key === 'mock'
                            ? 'bg-slate-700 text-white font-semibold'
                            : 'bg-amber-500 text-slate-950 font-semibold'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {label}
                      {!configured ? ' (No Key)' : ''}
                    </button>
                  ))}
                </div>
              </div>

              {provider === 'mock' && (
                <div className="flex items-start gap-2.5 p-3 rounded-lg border border-amber-500/30 bg-amber-500/8 text-xs text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    Mock Media Mode active — FFmpeg generates labeled placeholder frames and clips locally (not real AI photography/video).
                  </span>
                </div>
              )}

              {provider === 'openai' &&
                providerOverview &&
                !providerOverview.configuredKeys.openaiVideoEndpoint && (
                  <div className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0D12] text-xs text-slate-600 dark:text-slate-400">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
                    <span>
                      OpenAI Image generation uses DALL-E 3 (`16:9`, `9:16`, `1:1`). OpenAI Video requires `OPENAI_VIDEO_ENDPOINT` configured on the server.
                    </span>
                  </div>
                )}

              <div className="grid md:grid-cols-2 gap-5">
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">
                        Aspect Ratio
                      </label>
                      <select
                        value={imageAspectRatio}
                        onChange={(e) =>
                          setImageAspectRatio(e.target.value as '16:9' | '9:16' | '1:1')
                        }
                        className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-xs"
                      >
                        <option value="16:9">16:9</option>
                        <option value="9:16">9:16</option>
                        <option value="1:1">1:1 (Img)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">
                        Image Model
                      </label>
                      <select
                        disabled={provider !== 'gemini'}
                        value={imageModel}
                        onChange={(e) => setImageModel(e.target.value as typeof imageModel)}
                        className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-xs disabled:opacity-60"
                      >
                        <option value="gemini-nano-banana-2.1">Nano Banana 2.1</option>
                        <option value="gemini-3.1-flash-lite-image">Flash Lite</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">
                        Img / Vid Size
                      </label>
                      <div className="flex gap-1">
                        <select
                          value={resolution}
                          onChange={(e) => setResolution(e.target.value as typeof resolution)}
                          className="w-1/2 px-1.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-xs"
                        >
                          <option value="1K">1K</option>
                          <option value="2K">2K</option>
                          <option value="4K">4K</option>
                        </select>
                        <select
                          value={videoRes}
                          onChange={(e) => setVideoRes(e.target.value as typeof videoRes)}
                          className="w-1/2 px-1.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-xs"
                        >
                          <option value="720p">720p</option>
                          <option value="1080p">1080p</option>
                          <option value="360p">360p</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-medium text-slate-500">
                        Visual Style Preset
                      </label>
                      <select
                        value=""
                        onChange={(e) => {
                          if (e.target.value) setStyleHint(e.target.value);
                        }}
                        className="text-[11px] text-amber-600 dark:text-amber-400 bg-transparent focus:outline-none"
                      >
                        <option value="">Load preset...</option>
                        {STYLE_PRESETS.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </div>
                    <input
                      type="text"
                      value={styleHint}
                      onChange={(e) => setStyleHint(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-xs"
                    />
                  </div>

                  <div className="space-y-2 pt-1">
                    <label
                      className={`inline-flex items-center gap-2 text-xs cursor-pointer ${
                        provider === 'gemini'
                          ? 'text-slate-600 dark:text-slate-300'
                          : 'text-slate-400 dark:text-slate-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={provider !== 'gemini'}
                        checked={provider === 'gemini' && useImageSearch}
                        onChange={(e) => setUseImageSearch(e.target.checked)}
                        className="accent-amber-500"
                      />
                      <span>Ground image with Google Web + Image Search (Gemini)</span>
                    </label>

                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800">
                        <Upload className="h-3.5 w-3.5" />
                        <span>{refFileName ? `Ref: ${refFileName}` : 'Attach Photo (Edit / Animate)'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleRefUpload}
                          className="hidden"
                        />
                      </label>
                      {refFileName && (
                        <button
                          type="button"
                          onClick={() => {
                            setRefFileBase64(null);
                            setRefFileMime(null);
                            setRefFileName(null);
                          }}
                          className="text-xs text-red-500 hover:underline"
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    {selectedAsset?.assetType === 'image' && (
                      <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={animateFromSceneImage}
                          onChange={(e) => setAnimateFromSceneImage(e.target.checked)}
                          className="accent-amber-500"
                        />
                        <span>Animate scene&apos;s accepted image into video (Image-to-Video)</span>
                      </label>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={handleGenerateImage}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors disabled:opacity-60 whitespace-nowrap shrink-0"
                    >
                      <ImageIcon className="h-3.5 w-3.5" />
                      <span>{refFileBase64 ? 'Edit Image' : 'Generate Image'}</span>
                    </button>

                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={handleGenerateVideo}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 font-semibold text-xs hover:opacity-90 transition-opacity disabled:opacity-60 whitespace-nowrap shrink-0"
                    >
                      <Video className="h-3.5 w-3.5" />
                      <span>
                        {refFileBase64 || animateFromSceneImage ? 'Animate to Video' : 'Generate Video'}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={handleRegenerate}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Regenerate (New Action)</span>
                    </button>
                  </div>

                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800/70 space-y-2.5">
                    <p className="text-xs font-semibold">Voiceover TTS (Gemini 3.8 Flash TTS)</p>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={voiceName}
                        onChange={(e) => setVoiceName(e.target.value as typeof voiceName)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-xs"
                      >
                        <option value="Kore">Kore (Warm Studio)</option>
                        <option value="Puck">Puck (Bright Energetic)</option>
                        <option value="Charon">Charon (Deep Authority)</option>
                        <option value="Fenrir">Fenrir (Bold Narrative)</option>
                        <option value="Zephyr">Zephyr (Calm Crisp)</option>
                      </select>
                      <input
                        type="text"
                        value={voiceStyle}
                        onChange={(e) => setVoiceStyle(e.target.value)}
                        placeholder="Delivery style..."
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-xs"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={handleGenerateTTS}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                    >
                      <Mic className="h-3.5 w-3.5 text-amber-500" />
                      <span>Generate Scene Voiceover</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="aspect-video rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950 overflow-hidden flex items-center justify-center">
                      {selectedAsset ? (
                        selectedAsset.assetType === 'video' ? (
                          <video
                            key={selectedAsset.signedUrl}
                            src={selectedAsset.signedUrl}
                            controls
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <img
                            src={selectedAsset.signedUrl}
                            alt={activeScene.title}
                            referrerPolicy="no-referrer"
                            className="h-full w-full object-contain"
                          />
                        )
                      ) : (
                        <div className="text-center p-4 space-y-1">
                          <ImageIcon className="h-6 w-6 text-slate-600 mx-auto" />
                          <p className="text-xs text-slate-500">No media selected for this scene yet</p>
                        </div>
                      )}
                    </div>

                    {selectedAsset && (
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="font-mono">
                          {selectedAsset.provider} · {selectedAsset.model}
                          {selectedAsset.provider === 'mock' ? ' · Simulated Mock Output' : ''}
                        </span>
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void handleRejectAsset(selectedAsset.id)}
                          className="inline-flex items-center gap-1 text-red-500 hover:underline whitespace-nowrap"
                        >
                          <X className="h-3 w-3" />
                          <span>Reject Active Asset</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {voiceoverAsset && (
                    <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] space-y-1.5">
                      <p className="text-[11px] font-medium text-slate-500">
                        Active Scene Voiceover ({voiceoverAsset.model})
                      </p>
                      <audio
                        key={voiceoverAsset.signedUrl}
                        src={voiceoverAsset.signedUrl}
                        controls
                        className="w-full h-8"
                      />
                    </div>
                  )}

                  {sceneVisualAssets.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        Generated Candidates ({sceneVisualAssets.length})
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {sceneVisualAssets.slice(0, 4).map((cand) => {
                          const isCurrent = activeScene.selectedAssetId === cand.id;
                          return (
                            <div
                              key={cand.id}
                              className={`p-2 rounded-lg border text-[11px] space-y-1.5 ${
                                isCurrent
                                  ? 'border-amber-500/70 bg-amber-500/5'
                                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12]'
                              }`}
                            >
                              <div className="aspect-video rounded overflow-hidden bg-slate-900">
                                {cand.assetType === 'video' ? (
                                  <video src={cand.signedUrl} muted className="h-full w-full object-cover" />
                                ) : (
                                  <img
                                    src={cand.signedUrl}
                                    alt={cand.fileName}
                                    referrerPolicy="no-referrer"
                                    className="h-full w-full object-cover"
                                  />
                                )}
                              </div>
                              <div className="flex items-center justify-between gap-1">
                                <span className="truncate font-mono text-slate-500">
                                  {cand.provider}
                                </span>
                                {!isCurrent ? (
                                  <button
                                    type="button"
                                    disabled={busy !== null}
                                    onClick={() => void handleAcceptAsset(cand.id)}
                                    className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 font-semibold hover:underline whitespace-nowrap shrink-0"
                                  >
                                    <Check className="h-3 w-3" />
                                    <span>Accept</span>
                                  </button>
                                ) : (
                                  <span className="text-amber-600 dark:text-amber-400 font-semibold whitespace-nowrap">
                                    Accepted
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {sceneJobs.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        Scene Generation Jobs
                      </p>
                      <div className="space-y-1.5">
                        {sceneJobs.map((job) => {
                          const isActive = ['queued', 'processing', 'retrying'].includes(job.status);
                          const isRetryable = ['failed', 'timed_out', 'cancelled'].includes(job.status);
                          const pct = job.progress ?? (job.status === 'succeeded' ? 100 : isActive ? 30 : 0);
                          return (
                            <div
                              key={job.id}
                              className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-xs space-y-1.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="font-medium truncate">
                                    {job.mediaType} · {job.provider} ({job.model})
                                  </p>
                                  <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                                    {job.status} · attempt #{job.attemptCount} · {pct}%
                                    {job.errorMessage ? ` · ${job.errorMessage}` : ''}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {isActive && (
                                    <button
                                      type="button"
                                      onClick={() => void handleCancelJob(job.id)}
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 text-[11px] whitespace-nowrap"
                                    >
                                      <Ban className="h-3 w-3" />
                                      <span>Cancel</span>
                                    </button>
                                  )}
                                  {isRetryable && (
                                    <button
                                      type="button"
                                      onClick={() => void handleRetryJob(job.id)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500 text-slate-950 font-semibold text-[11px] whitespace-nowrap"
                                    >
                                      <RotateCw className="h-3 w-3" />
                                      <span>Retry (Free)</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                              {isActive && (
                                <div className="h-1 w-full rounded bg-slate-200 dark:bg-slate-800 overflow-hidden">
                                  <div
                                    className="h-full bg-amber-500 transition-all duration-300"
                                    style={{ width: `${Math.max(8, pct)}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
