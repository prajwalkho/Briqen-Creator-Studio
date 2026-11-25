import React, { useEffect, useState } from 'react';
import {
  Clock,
  ExternalLink,
  Globe,
  History,
  RotateCcw,
  Save,
  Scissors,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { apiRequest } from '../../services/api';
import { Project, Scene, ScriptRevision } from '../../types/studio';

interface ScriptStudioTabProps {
  project: Project;
  revisions: ScriptRevision[];
  onRevisionsChange: (revs: ScriptRevision[]) => void;
  onScenesExtracted: (scenes: Scene[]) => void;
}

export const ScriptStudioTab: React.FC<ScriptStudioTabProps> = ({
  project,
  revisions,
  onRevisionsChange,
  onScenesExtracted,
}) => {
  const activeRev =
    revisions.find((r) => r.id === project.activeScriptRevisionId) || revisions[0] || null;

  const [title, setTitle] = useState(activeRev?.title || `${project.title} Script`);
  const [brandName, setBrandName] = useState(activeRev?.brandName || project.brandName || '');
  const [targetAudience, setTargetAudience] = useState(
    activeRev?.targetAudience || project.targetAudience || ''
  );
  const [platform, setPlatform] = useState(activeRev?.platform || project.platform || 'YouTube');
  const [targetDurationSec, setTargetDurationSec] = useState(activeRev?.targetDurationSec || 30);
  const [language, setLanguage] = useState(activeRev?.language || 'English');
  const [toneOfVoice, setToneOfVoice] = useState(activeRev?.toneOfVoice || 'Confident & Modern');
  const [marketingObjective, setMarketingObjective] = useState(
    activeRev?.marketingObjective || 'Product Launch'
  );
  const [brief, setBrief] = useState('');
  const [content, setContent] = useState(activeRev?.content || '');

  const [provider, setProvider] = useState<'gemini' | 'mock'>('gemini');
  const [useSearchGrounding, setUseSearchGrounding] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (activeRev) {
      setTitle(activeRev.title);
      setBrandName(activeRev.brandName);
      setTargetAudience(activeRev.targetAudience);
      setPlatform(activeRev.platform);
      setTargetDurationSec(activeRev.targetDurationSec);
      setLanguage(activeRev.language);
      setToneOfVoice(activeRev.toneOfVoice);
      setMarketingObjective(activeRev.marketingObjective);
      setContent(activeRev.content);
    }
  }, [activeRev?.id]);

  const handleGenerate = async () => {
    setBusyAction('generate');
    setError(null);
    setStatusMessage(null);
    try {
      const res = await apiRequest<{ data: ScriptRevision; message: string }>(
        `/projects/${project.id}/scripts/generate`,
        {
          method: 'POST',
          body: JSON.stringify({
            title,
            brandName,
            targetAudience,
            platform,
            targetDurationSec: Number(targetDurationSec) || 30,
            language,
            toneOfVoice,
            marketingObjective,
            brief,
            useSearchGrounding,
            provider,
          }),
        }
      );
      onRevisionsChange([res.data, ...revisions]);
      setContent(res.data.content);
      setStatusMessage(res.message);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate script.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleRevise = async (
    action: 'rewrite' | 'grammar' | 'tone' | 'expand' | 'shorten' | 'alternative'
  ) => {
    if (!content.trim()) {
      setError('Write or generate a script before revising.');
      return;
    }
    setBusyAction(action);
    setError(null);
    setStatusMessage(null);
    try {
      const res = await apiRequest<{ data: ScriptRevision; message: string }>(
        `/projects/${project.id}/scripts/revise`,
        {
          method: 'POST',
          body: JSON.stringify({
            title,
            brandName,
            targetAudience,
            platform,
            targetDurationSec: Number(targetDurationSec) || 30,
            language,
            toneOfVoice,
            marketingObjective,
            currentContent: content,
            action,
            targetTone: toneOfVoice,
            provider,
          }),
        }
      );
      onRevisionsChange([res.data, ...revisions]);
      setContent(res.data.content);
      setStatusMessage(res.message);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Script revision failed.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveManual = async () => {
    if (!content.trim()) {
      setError('Script content cannot be empty.');
      return;
    }
    setBusyAction('save');
    setError(null);
    setStatusMessage(null);
    try {
      const res = await apiRequest<{ data: ScriptRevision; message: string }>(
        `/projects/${project.id}/scripts`,
        {
          method: 'POST',
          body: JSON.stringify({
            title,
            brandName,
            targetAudience,
            platform,
            targetDurationSec: Number(targetDurationSec) || 30,
            language,
            toneOfVoice,
            marketingObjective,
            content,
          }),
        }
      );
      onRevisionsChange([res.data, ...revisions]);
      setStatusMessage(res.message);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save revision.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleRestore = async (rev: ScriptRevision) => {
    setBusyAction(`restore-${rev.id}`);
    setError(null);
    setStatusMessage(null);
    try {
      const res = await apiRequest<{ data: ScriptRevision; message: string }>(
        `/projects/${project.id}/scripts/${rev.id}/restore`,
        { method: 'POST' }
      );
      onRevisionsChange([res.data, ...revisions]);
      setContent(res.data.content);
      setStatusMessage(res.message);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to restore revision.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleExtractScenes = async () => {
    if (!content.trim()) {
      setError('Write or generate a script before extracting scenes.');
      return;
    }
    setBusyAction('extract');
    setError(null);
    setStatusMessage(null);
    try {
      const res = await apiRequest<{ data: Scene[]; message: string }>(
        `/projects/${project.id}/scripts/extract-scenes`,
        {
          method: 'POST',
          body: JSON.stringify({
            scriptRevisionId: activeRev?.id,
            content,
            replaceExisting: true,
            provider,
          }),
        }
      );
      setStatusMessage(res.message);
      onScenesExtracted(res.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Scene extraction failed.');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="grid lg:grid-cols-12 gap-6 items-start">
      <div className="lg:col-span-8 space-y-5">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#13161E] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800/70">
            <h2 className="font-display text-base font-semibold">Script Brief &amp; Metadata</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">Engine:</span>
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
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Script Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Brand / Product
              </label>
              <input
                type="text"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Target Duration (sec)
              </label>
              <input
                type="number"
                min={5}
                max={300}
                value={targetDurationSec}
                onChange={(e) => setTargetDurationSec(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm font-mono tabular-nums focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Platform
              </label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm focus:outline-none focus:border-amber-500"
              >
                <option value="YouTube">YouTube</option>
                <option value="Instagram">Instagram</option>
                <option value="TikTok">TikTok</option>
                <option value="LinkedIn">LinkedIn</option>
                <option value="Facebook">Facebook</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Tone of Voice
              </label>
              <input
                type="text"
                value={toneOfVoice}
                onChange={(e) => setToneOfVoice(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Language
              </label>
              <input
                type="text"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Objective
              </label>
              <input
                type="text"
                value={marketingObjective}
                onChange={(e) => setMarketingObjective(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Target Audience
              </label>
              <input
                type="text"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder="e.g., Creative directors and indie founders"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Creative Prompt / Key Selling Points
              </label>
              <input
                type="text"
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="Optional angle, offer, or recent product stats to highlight..."
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={useSearchGrounding}
                onChange={(e) => setUseSearchGrounding(e.target.checked)}
                className="rounded border-slate-300 dark:border-slate-700 accent-amber-500"
              />
              <Globe className="h-3.5 w-3.5 text-amber-500" />
              <span>Use Google Search Grounding (live web facts via Gemini 4 Hydrogen)</span>
            </label>

            <button
              type="button"
              disabled={busyAction !== null}
              onClick={handleGenerate}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors disabled:opacity-60 whitespace-nowrap"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>{busyAction === 'generate' ? 'Generating Script...' : 'Generate Script'}</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3.5 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-500">
            {error}
          </div>
        )}
        {statusMessage && (
          <div className="p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-600 dark:text-emerald-400">
            {statusMessage}
          </div>
        )}

        <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#13161E] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
                Script Editor
              </span>
              {activeRev && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">v{activeRev.versionNumber}</span>
                  <span aria-hidden="true">·</span>
                  <span>{activeRev.aiModelUsed}</span>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={handleSaveManual}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                <Save className="h-3.5 w-3.5" />
                <span>{busyAction === 'save' ? 'Saving...' : 'Save New Revision'}</span>
              </button>

              <button
                type="button"
                disabled={busyAction !== null || !content.trim()}
                onClick={handleExtractScenes}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 whitespace-nowrap"
              >
                <Scissors className="h-3.5 w-3.5" />
                <span>
                  {busyAction === 'extract'
                    ? 'Thinking & Splitting...'
                    : 'Split Into Scenes (Gemini 4 Carbon)'}
                </span>
              </button>
            </div>
          </div>

          <textarea
            rows={14}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your marketing script here, or click Generate Script above to create one with AI..."
            className="w-full p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm leading-relaxed font-sans focus:outline-none focus:border-amber-500"
          />

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 mr-1">
              <Wand2 className="h-3.5 w-3.5" />
              <span>AI Polish:</span>
            </span>
            {(
              [
                ['rewrite', 'Rewrite'],
                ['grammar', 'Fix Grammar'],
                ['tone', 'Apply Tone'],
                ['expand', 'Expand'],
                ['shorten', 'Shorten'],
                ['alternative', 'Alt Hook'],
              ] as const
            ).map(([actionKey, label]) => (
              <button
                key={actionKey}
                type="button"
                disabled={busyAction !== null || !content.trim()}
                onClick={() => void handleRevise(actionKey)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-xs font-medium text-slate-700 dark:text-slate-300 hover:border-amber-500/60 transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {busyAction === actionKey ? 'Working...' : label}
              </button>
            ))}
          </div>

          {activeRev?.groundingSources && activeRev.groundingSources.length > 0 && (
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800/70 space-y-2">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Google Search Grounding Sources
              </p>
              <div className="flex flex-wrap gap-3">
                {activeRev.groundingSources.map((src, i) => (
                  <a
                    key={i}
                    href={src.uri}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    <span className="truncate max-w-[260px]">{src.title}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <aside className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#13161E] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-slate-400" />
            <h3 className="font-display text-sm font-semibold">Immutable Revision History</h3>
          </div>
          <span className="text-xs font-mono text-slate-500 tabular-nums">
            {revisions.length} versions
          </span>
        </div>

        {revisions.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
            No saved revisions yet. Every save or AI edit creates a permanent immutable snapshot.
          </p>
        ) : (
          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
            {revisions.map((rev) => {
              const isActive = activeRev?.id === rev.id;
              return (
                <div
                  key={rev.id}
                  className={`p-3.5 rounded-lg border transition-colors space-y-2 ${
                    isActive
                      ? 'border-amber-500/60 bg-amber-500/5'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                      v{rev.versionNumber} · {rev.aiModelUsed}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 font-mono tabular-nums">
                      <Clock className="h-3 w-3" />
                      {new Date(rev.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  {rev.aiNotes && (
                    <p className="text-xs text-slate-600 dark:text-slate-400">{rev.aiNotes}</p>
                  )}

                  <p className="text-xs text-slate-500 dark:text-slate-500 line-clamp-2">
                    {rev.content}
                  </p>

                  <div className="flex items-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setContent(rev.content)}
                      className="text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-amber-500"
                    >
                      Load into editor
                    </button>
                    {!isActive && (
                      <button
                        type="button"
                        disabled={busyAction !== null}
                        onClick={() => void handleRestore(rev)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline"
                      >
                        <RotateCcw className="h-3 w-3" />
                        <span>Restore as new version</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </aside>
    </div>
  );
};
