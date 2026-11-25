import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Clock,
  Columns2,
  ExternalLink,
  Globe,
  History,
  RotateCcw,
  Save,
  Scissors,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import { apiRequest } from '../../services/api';
import { Project, ProviderOverview, Scene, ScriptRevision } from '../../types/studio';
import { computeSideBySideDiff } from '../../utils/textDiff';

interface ScriptStudioTabProps {
  project: Project;
  revisions: ScriptRevision[];
  onRevisionsChange: (revs: ScriptRevision[]) => void;
  onScenesExtracted: (scenes: Scene[]) => void;
}

type ImproveAction =
  | 'rewrite'
  | 'grammar'
  | 'clarity'
  | 'engaging'
  | 'tone'
  | 'expand'
  | 'shorten'
  | 'alternative';

export const ScriptStudioTab: React.FC<ScriptStudioTabProps> = ({
  project,
  revisions,
  onRevisionsChange,
  onScenesExtracted,
}) => {
  const activeRev =
    revisions.find((r) => r.id === project.activeScriptRevisionId) || revisions[0] || null;

  const [topic, setTopic] = useState(activeRev?.topic || '');
  const [title, setTitle] = useState(activeRev?.title || `${project.title} Script`);
  const [description, setDescription] = useState(project.description || '');
  const [contentType, setContentType] = useState<
    'YouTube' | 'advertisement' | 'educational' | 'promotional' | 'social_media'
  >((activeRev?.contentType as 'YouTube') || 'YouTube');
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

  const [providerOverview, setProviderOverview] = useState<ProviderOverview | null>(null);
  const [provider, setProvider] = useState<'gemini' | 'openai' | 'mock'>('gemini');
  const [useSearchGrounding, setUseSearchGrounding] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Side-by-side comparison state
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareLeftId, setCompareLeftId] = useState<string | null>(null);
  const [compareRightId, setCompareRightId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    apiRequest<{ data: ProviderOverview }>('/ai/providers')
      .then((res) => {
        if (!mounted || !res.data) return;
        setProviderOverview(res.data);
        setProvider(res.data.defaults.llmProvider);
      })
      .catch(() => {
        // Leave default fallback
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (activeRev) {
      setTitle(activeRev.title);
      if (activeRev.topic !== undefined) setTopic(activeRev.topic);
      if (activeRev.contentType) {
        setContentType(
          activeRev.contentType as
            | 'YouTube'
            | 'advertisement'
            | 'educational'
            | 'promotional'
            | 'social_media'
        );
      }
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

  const leftRevision =
    revisions.find((r) => r.id === compareLeftId) ||
    revisions[1] ||
    revisions[0] ||
    null;

  const rightRevision =
    revisions.find((r) => r.id === compareRightId) ||
    activeRev ||
    revisions[0] ||
    null;

  const diffResult = useMemo(() => {
    if (!leftRevision || !rightRevision) return null;
    return computeSideBySideDiff(leftRevision.content, rightRevision.content);
  }, [leftRevision, rightRevision]);

  const openComparison = (snapshot: ScriptRevision) => {
    setCompareLeftId(snapshot.id);
    const defaultRight =
      activeRev && activeRev.id !== snapshot.id
        ? activeRev.id
        : revisions[0]?.id || snapshot.id;
    setCompareRightId(defaultRight);
    setCompareOpen(true);
  };

  const handleGenerate = async () => {
    setBusyAction('generate');
    setError(null);
    setStatusMessage(null);
    try {
      const res = await apiRequest<{ data: ScriptRevision; message: string }>(
        `/ai/scripts/generate`,
        {
          method: 'POST',
          body: JSON.stringify({
            projectId: project.id,
            topic,
            title,
            description,
            contentType,
            brandName,
            targetAudience,
            platform,
            targetDurationSec: Number(targetDurationSec) || 30,
            language,
            toneOfVoice,
            marketingObjective,
            brief,
            useSearchGrounding: provider === 'gemini' ? useSearchGrounding : false,
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

  const handleRevise = async (action: ImproveAction) => {
    if (!content.trim()) {
      setError('Write or generate a script before revising.');
      return;
    }
    setBusyAction(action);
    setError(null);
    setStatusMessage(null);
    try {
      const endpoint = activeRev
        ? `/ai/scripts/${activeRev.id}/improve`
        : `/projects/${project.id}/scripts/revise`;
      const res = await apiRequest<{ data: ScriptRevision; message: string }>(endpoint, {
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
      });
      onRevisionsChange([res.data, ...revisions]);
      setContent(res.data.content);
      setStatusMessage(res.message);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Script improvement failed.');
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
            topic,
            contentType,
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
      setCompareOpen(false);
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
      const res = await apiRequest<{ data: Scene[]; message: string }>(`/ai/scenes/extract`, {
        method: 'POST',
        body: JSON.stringify({
          projectId: project.id,
          scriptRevisionId: activeRev?.id,
          content,
          replaceExisting: true,
          provider,
        }),
      });
      setStatusMessage(res.message);
      onScenesExtracted(res.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Scene extraction failed.');
    } finally {
      setBusyAction(null);
    }
  };

  const activeIsMock =
    provider === 'mock' ||
    Boolean(activeRev?.usageJson?.isMock) ||
    activeRev?.aiModelUsed.includes('mock');

  return (
    <>
      <div className="grid lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 space-y-5">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#13161E] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800/70">
              <h2 className="font-display text-base font-semibold">Script Brief &amp; Metadata</h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">LLM Engine:</span>
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
                      title={!configured ? `${label} server API key is not configured` : undefined}
                      onClick={() => setProvider(key)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                        provider === key
                          ? key === 'mock'
                            ? 'bg-slate-700 text-white font-semibold'
                            : 'bg-amber-500 text-slate-950 font-semibold'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      {label}
                      {!configured ? ' (No Key)' : ''}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {provider === 'mock' && (
              <div className="flex items-start gap-2.5 p-3 rounded-lg border border-amber-500/30 bg-amber-500/8 text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Mock LLM Mode active — generates deterministic local scripts and scene breakdowns for testing without external AI charges.
                </span>
              </div>
            )}

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Topic / Subject
                </label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g., Ergonomic walnut standing desk launch"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Video Title
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
                  Content Type
                </label>
                <select
                  value={contentType}
                  onChange={(e) =>
                    setContentType(
                      e.target.value as
                        | 'YouTube'
                        | 'advertisement'
                        | 'educational'
                        | 'promotional'
                        | 'social_media'
                    )
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm focus:outline-none focus:border-amber-500"
                >
                  <option value="YouTube">YouTube</option>
                  <option value="advertisement">Advertisement</option>
                  <option value="educational">Educational</option>
                  <option value="promotional">Promotional</option>
                  <option value="social_media">Social Media</option>
                </select>
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
                  max={600}
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
                  <option value="Web">Web</option>
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
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Target Audience
                </label>
                <input
                  type="text"
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  placeholder="e.g., Creative directors"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Description / Video Summary
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Overview of what this video covers..."
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
                  placeholder="Optional angle, offer, or key points..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-sm focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <label
                className={`inline-flex items-center gap-2 text-xs cursor-pointer select-none ${
                  provider === 'gemini'
                    ? 'text-slate-600 dark:text-slate-300'
                    : 'text-slate-400 dark:text-slate-600'
                }`}
              >
                <input
                  type="checkbox"
                  disabled={provider !== 'gemini'}
                  checked={provider === 'gemini' && useSearchGrounding}
                  onChange={(e) => setUseSearchGrounding(e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-700 accent-amber-500"
                />
                <Globe className="h-3.5 w-3.5 text-amber-500" />
                <span>Use Google Search Grounding (Gemini only)</span>
              </label>

              <button
                type="button"
                disabled={busyAction !== null}
                onClick={handleGenerate}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors disabled:opacity-60 whitespace-nowrap shrink-0"
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
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
                  Script Editor
                </span>
                {activeRev && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">v{activeRev.versionNumber}</span>
                    <span aria-hidden="true">·</span>
                    <span>{activeRev.aiModelUsed}</span>
                    {activeIsMock && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-amber-600 dark:text-amber-400 font-medium">
                          Simulated Mock Output
                        </span>
                      </>
                    )}
                    {activeRev.usageJson?.totalTokens && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {activeRev.usageJson.totalTokens} tokens
                        </span>
                      </>
                    )}
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={handleSaveManual}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                >
                  <Save className="h-3.5 w-3.5" />
                  <span>{busyAction === 'save' ? 'Saving...' : 'Save New Revision'}</span>
                </button>

                <button
                  type="button"
                  disabled={busyAction !== null || !content.trim()}
                  onClick={handleExtractScenes}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <Scissors className="h-3.5 w-3.5" />
                  <span>
                    {busyAction === 'extract' ? 'Extracting Scenes...' : 'Split Into Scenes'}
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
                <span>AI Improve (Saves New Revision):</span>
              </span>
              {(
                [
                  ['rewrite', 'Rewrite'],
                  ['grammar', 'Fix Grammar'],
                  ['clarity', 'Improve Clarity'],
                  ['engaging', 'More Engaging'],
                  ['tone', 'Apply Tone'],
                  ['expand', 'Expand'],
                  ['shorten', 'Shorten'],
                  ['alternative', 'Alt Version'],
                ] as const
              ).map(([actionKey, label]) => (
                <button
                  key={actionKey}
                  type="button"
                  disabled={busyAction !== null || !content.trim()}
                  onClick={() => void handleRevise(actionKey)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-xs font-medium text-slate-700 dark:text-slate-300 hover:border-amber-500/60 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
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
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800/80">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-amber-500" />
              <h3 className="font-display text-sm font-semibold">Version History</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                {revisions.length} snapshots
              </span>
              {revisions.length >= 2 && (
                <button
                  type="button"
                  onClick={() => openComparison(revisions[1])}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:border-amber-500/60 whitespace-nowrap shrink-0"
                >
                  <Columns2 className="h-3 w-3" />
                  <span>Compare</span>
                </button>
              )}
            </div>
          </div>

          {revisions.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
              No saved snapshots yet. Every save, template launch, or AI edit records an immutable revision here.
            </p>
          ) : (
            <div className="space-y-3 max-h-[640px] overflow-y-auto pr-1">
              {revisions.map((rev) => {
                const isActive = activeRev?.id === rev.id;
                const isRestoring = busyAction === `restore-${rev.id}`;
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
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                          v{rev.versionNumber}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {rev.aiModelUsed}
                        </span>
                        {isActive && (
                          <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 whitespace-nowrap">
                            · Active
                          </span>
                        )}
                      </div>
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 font-mono tabular-nums shrink-0">
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

                    <p className="text-xs text-slate-500 dark:text-slate-500 line-clamp-2 leading-relaxed">
                      {rev.content}
                    </p>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-200/70 dark:border-slate-800/70">
                      <button
                        type="button"
                        onClick={() => openComparison(rev)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-amber-500 whitespace-nowrap"
                      >
                        <Columns2 className="h-3 w-3" />
                        <span>View Side-by-Side</span>
                      </button>

                      {!isActive && (
                        <button
                          type="button"
                          disabled={busyAction !== null}
                          onClick={() => void handleRestore(rev)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline disabled:opacity-50 whitespace-nowrap"
                        >
                          <RotateCcw className="h-3 w-3" />
                          <span>{isRestoring ? 'Restoring...' : 'Restore'}</span>
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

      {compareOpen && leftRevision && rightRevision && diffResult && (
        <div
          role="dialog"
          aria-label="Side-by-Side Script Comparison"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs"
        >
          <div className="w-full max-w-6xl max-h-[90vh] flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] shadow-2xl overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Columns2 className="h-4 w-4 text-amber-500" />
                  <h3 className="font-display text-base font-semibold">
                    Side-by-Side Script Revision Comparison
                  </h3>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  <span className="text-emerald-600 dark:text-emerald-400">
                    +{diffResult.addedCount} lines added
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="text-red-600 dark:text-red-400">
                    -{diffResult.removedCount} lines removed
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{diffResult.unchangedCount} unchanged</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {activeRev?.id !== leftRevision.id && (
                  <button
                    type="button"
                    disabled={busyAction !== null}
                    onClick={() => void handleRestore(leftRevision)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors disabled:opacity-60 whitespace-nowrap"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Restore v{leftRevision.versionNumber} Now</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setCompareOpen(false)}
                  aria-label="Close comparison"
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12]">
              <div className="p-3.5 flex items-center justify-between gap-3">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0">
                  Snapshot (Left)
                </label>
                <select
                  value={leftRevision.id}
                  onChange={(e) => setCompareLeftId(e.target.value)}
                  className="flex-1 max-w-xs px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] text-xs font-mono"
                >
                  {revisions.map((r) => (
                    <option key={r.id} value={r.id}>
                      v{r.versionNumber} · {r.aiModelUsed} (
                      {new Date(r.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      )
                    </option>
                  ))}
                </select>
              </div>
              <div className="p-3.5 flex items-center justify-between gap-3">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0">
                  Compared With (Right)
                </label>
                <select
                  value={rightRevision.id}
                  onChange={(e) => setCompareRightId(e.target.value)}
                  className="flex-1 max-w-xs px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] text-xs font-mono"
                >
                  {revisions.map((r) => (
                    <option key={r.id} value={r.id}>
                      v{r.versionNumber} · {r.aiModelUsed}
                      {activeRev?.id === r.id ? ' (Active)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/70 font-mono text-xs">
              {diffResult.rows.map((row, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800"
                >
                  <div
                    className={`flex items-start gap-3 px-3.5 py-1.5 ${
                      row.type === 'removed' || row.type === 'modified'
                        ? 'bg-red-500/10 text-red-700 dark:text-red-300'
                        : row.type === 'added'
                          ? 'bg-slate-50/70 dark:bg-[#0B0D12]/60 text-slate-400'
                          : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span className="w-8 shrink-0 text-right text-[11px] text-slate-400 select-none tabular-nums">
                      {row.leftLineNumber ?? ''}
                    </span>
                    <span className="whitespace-pre-wrap break-words flex-1">
                      {row.leftText || (row.type === 'added' ? '' : ' ')}
                    </span>
                  </div>

                  <div
                    className={`flex items-start gap-3 px-3.5 py-1.5 ${
                      row.type === 'added' || row.type === 'modified'
                        ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                        : row.type === 'removed'
                          ? 'bg-slate-50/70 dark:bg-[#0B0D12]/60 text-slate-400'
                          : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span className="w-8 shrink-0 text-right text-[11px] text-slate-400 select-none tabular-nums">
                      {row.rightLineNumber ?? ''}
                    </span>
                    <span className="whitespace-pre-wrap break-words flex-1">
                      {row.rightText || (row.type === 'removed' ? '' : ' ')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
