import { loadAIConfig, type VideoProviderName } from '../config.ts';
import { getVideoProvider } from '../factory.ts';
import { ProviderCapabilityError, ProviderConfigurationError } from '../exceptions.ts';
import { enqueueMediaGenerationJob, readAssetAsBase64 } from '../../workers/jobWorker.ts';

export interface VideoGenerationServiceInput {
  projectId: string;
  sceneId: string;
  userId: string;
  provider?: VideoProviderName;
  prompt: string;
  aspectRatio?: '16:9' | '9:16';
  resolution?: '360p' | '720p' | '1080p' | '4k';
  style?: string;
  durationSec?: number;
  referenceAssetId?: string;
  referenceImageBase64?: string;
  referenceImageMimeType?: string;
  idempotencyKey?: string;
  requestTimeoutMs?: number;
}

export async function queueSceneVideoGeneration(input: VideoGenerationServiceInput) {
  const cfg = loadAIConfig();
  const chosenProvider = input.provider || cfg.videoProvider;
  const providerInstance = getVideoProvider(chosenProvider);

  if (chosenProvider === 'gemini' && !cfg.geminiConfigured) {
    throw new ProviderConfigurationError(
      'GEMINI_API_KEY is not configured. Add it in Settings > Secrets or choose mock provider.',
      'gemini'
    );
  }
  if (chosenProvider === 'openai' && !cfg.openaiConfigured) {
    throw new ProviderConfigurationError(
      'OPENAI_API_KEY is not configured on the server.',
      'openai'
    );
  }
  if (chosenProvider === 'openai' && !cfg.openaiVideoConfigured) {
    throw new ProviderCapabilityError(
      'OpenAI video generation is unavailable because OPENAI_VIDEO_ENDPOINT is not configured. Switch to Gemini Omni or Mock.',
      'openai'
    );
  }

  const aspect = input.aspectRatio === '9:16' ? '9:16' : '16:9';
  const durationSec = Math.min(
    providerInstance.capabilities.maxDurationSec,
    Math.max(providerInstance.capabilities.minDurationSec, Math.round(input.durationSec || 6))
  );

  let refBase64 = input.referenceImageBase64;
  let refMime = input.referenceImageMimeType;
  if (!refBase64 && input.referenceAssetId) {
    const refAsset = await readAssetAsBase64(input.referenceAssetId);
    if (refAsset && refAsset.mimeType.startsWith('image/')) {
      refBase64 = refAsset.base64;
      refMime = refAsset.mimeType;
    }
  }

  if (refBase64 && !providerInstance.capabilities.supportsImageToVideo) {
    throw new ProviderCapabilityError(
      `Provider "${chosenProvider}" does not support image-to-video animation.`,
      chosenProvider
    );
  }

  const resolvedModel =
    chosenProvider === 'mock'
      ? 'mock-video-v1'
      : chosenProvider === 'openai'
        ? process.env.OPENAI_VIDEO_MODEL || 'sora-2'
        : 'gemini-omni-1.2-flash';

  return enqueueMediaGenerationJob({
    projectId: input.projectId,
    sceneId: input.sceneId,
    userId: input.userId,
    idempotencyKey: input.idempotencyKey,
    requestTimeoutMs: input.requestTimeoutMs,
    request: {
      mediaType: 'video',
      provider: chosenProvider,
      model: resolvedModel,
      prompt: input.prompt,
      aspectRatio: aspect,
      resolution: input.resolution || '720p',
      style: input.style,
      durationSec,
      referenceImageBase64: refBase64,
      referenceImageMimeType: refMime,
    },
  });
}
