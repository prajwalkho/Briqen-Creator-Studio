import React, { useEffect, useState } from 'react';
import {
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
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../services/api';
import { Asset, GenerationJob, Project, Scene } from '../../types/studio';

interface ScenesTabProps {
  project: Project;
  scenes: Scene[];
  assets: Asset[];
  jobs: GenerationJob[];
  onRefreshAll: () => Promise<void>;
}

export const ScenesTab: React.FC<ScenesTabProps> = ({
  project,
  scenes,
  assets,
  jobs,
  onRefreshAll,
}) => {
  const { refreshProfile } = useAuth();
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(scenes[0]?.id ?? null);
  const [provider, setProvider] = useState<'gemini' | 'mock'>('gemini');
  const [imageModel, setImageModel] = useState<'gemini-nano-banana-2.1' | 'gemini-3.1-flash-lite-image'>(
    'gemini-nano-banana-2.1'
  );
  const [resolution, setResolution] = useState<'1K' | '2K' | '4K'>('1K');
  const [videoRes, setVideoRes] = useState<'720p' | '1080p' | '360p'>('720p');
  const [styleHint, setStyleHint] = useState('Commercial studio lighting, sharp focus');
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
    }, 2500);
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
      await apiRequest(`/scenes/${activeScene.id}`, {
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
      const res = await apiRequest<{ message: string }>(`/scenes/${activeScene.id}/generate-image`, {
        method: 'POST',
        body: JSON.stringify({
          provider,
          model: imageModel,
          prompt,
          aspectRatio: project.aspectRatio === '9:16' ? '9:16' : project.aspectRatio === '1:1' ? '1:1' : '16:9',
          resolution,
          style: styleHint,
          useSearchGrounding: useImageSearch,
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
      const res = await apiRequest<{ message: string }>(`/scenes/${activeScene.id}/generate-video`, {
        method: 'POST',
        body: JSON.stringify({
          provider,
          prompt,
          aspectRatio: project.aspectRatio === '9:16' ? '9:16' : '16:9',
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
      const res = await apiRequest<{ message: string }>(`/scenes/${activeScene.id}/generate-tts`, {
        method: 'POST',
        body: JSON.stringify({
          provider,
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
      const res = await apiRequest<{ message: string }>(`/jobs/${jobId}/retry`, {
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

  const selectedAsset = activeScene
    ? assets.find((a) => a.id === activeScene.selectedAssetId) || null
    : null;
  const voiceoverAsset = activeScene
    ? assets.find((a) => a.id === activeScene.voiceoverAssetId) || null
    : null;
  const sceneJobs = activeScene
    ? jobs.filter((j) => j.sceneId === activeScene.id).slice(0, 6)
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
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors whitespace-nowrap"
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
                      <span>0{idx + 1}</span>
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
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>Duplicate</span>
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void handleDelete(activeScene.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs text-red-500 hover:bg-red-500/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Delete</span>
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={handleSaveScene}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 text-xs font-semibold hover:opacity-90"
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
                    Duration (sec)
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
                  <button
                    type="button"
                    onClick={() => setProvider('gemini')}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      provider === 'gemini'
                        ? 'bg-amber-500 text-slate-950 font-semibold'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Gemini AI
                  </button>
                  <button
                    type="button"
                    onClick={() => setProvider('mock')}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      provider === 'mock'
                        ? 'bg-slate-700 text-white font-semibold'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Mock Provider
                  </button>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-5">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">
                        Image Model
                      </label>
                      <select
                        value={imageModel}
                        onChange={(e) => setImageModel(e.target.value as typeof imageModel)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-xs"
                      >
                        <option value="gemini-nano-banana-2.1">Nano Banana 2.1 (1K-4K)</option>
                        <option value="gemini-3.1-flash-lite-image">Flash Lite Image</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">
                        Image / Video Size
                      </label>
                      <div className="flex gap-1.5">
                        <select
                          value={resolution}
                          onChange={(e) => setResolution(e.target.value as typeof resolution)}
                          className="w-1/2 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-xs"
                        >
                          <option value="1K">1K</option>
                          <option value="2K">2K</option>
                          <option value="4K">4K</option>
                        </select>
                        <select
                          value={videoRes}
                          onChange={(e) => setVideoRes(e.target.value as typeof videoRes)}
                          className="w-1/2 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-xs"
                        >
                          <option value="720p">720p</option>
                          <option value="1080p">1080p</option>
                          <option value="360p">360p</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      Visual Style Preset
                    </label>
                    <input
                      type="text"
                      value={styleHint}
                      onChange={(e) => setStyleHint(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-xs"
                    />
                  </div>

                  <div className="space-y-2 pt-1">
                    <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={useImageSearch}
                        onChange={(e) => setUseImageSearch(e.target.checked)}
                        className="accent-amber-500"
                      />
                      <span>Ground image with Google Web + Image Search</span>
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
                        <span>Animate scene&apos;s current image into video (Omni 1.2 Flash)</span>
                      </label>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={handleGenerateImage}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors disabled:opacity-60 whitespace-nowrap"
                    >
                      <ImageIcon className="h-3.5 w-3.5" />
                      <span>{refFileBase64 ? 'Edit Image' : 'Generate Image'}</span>
                    </button>

                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={handleGenerateVideo}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 font-semibold text-xs hover:opacity-90 transition-opacity disabled:opacity-60 whitespace-nowrap"
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
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Regenerate</span>
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
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Mic className="h-3.5 w-3.5 text-amber-500" />
                      <span>Generate Scene Voiceover</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
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

                  {sceneJobs.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        Scene Generation Jobs
                      </p>
                      <div className="space-y-1.5">
                        {sceneJobs.map((job) => (
                          <div
                            key={job.id}
                            className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-xs"
                          >
                            <div className="min-w-0">
                              <p className="font-medium truncate">
                                {job.mediaType} · {job.model}
                              </p>
                              <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                                {job.status} · attempt #{job.attemptCount}
                                {job.errorMessage ? ` · ${job.errorMessage}` : ''}
                              </p>
                            </div>
                            {job.status === 'failed' && (
                              <button
                                type="button"
                                onClick={() => void handleRetryJob(job.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500 text-slate-950 font-semibold text-[11px] shrink-0"
                              >
                                <RotateCw className="h-3 w-3" />
                                <span>Retry (Free)</span>
                              </button>
                            )}
                          </div>
                        ))}
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
