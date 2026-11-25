import { loadAIConfig, type ImageProviderName } from '../config.ts';
import { getImageProvider } from '../factory.ts';
import { ProviderCapabilityError, ProviderConfigurationError } from '../exceptions.ts';
import { enqueueMediaGenerationJob, readAssetAsBase64 } from '../../workers/jobWorker.ts';

export interface ImageGenerationServiceInput {
  projectId: string;
  sceneId: string;
  userId: string;
  provider?: ImageProviderName;
  model?: string;
  prompt: string;
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:3' | '3:4';
  resolution?: '1K' | '2K' | '4K';
  style?: string;
  useSearchGrounding?: boolean;
  referenceAssetId?: string;
  referenceImageBase64?: string;
  referenceImageMimeType?: string;
  idempotencyKey?: string;
  requestTimeoutMs?: number;
}

export async function queueSceneImageGeneration(input: ImageGenerationServiceInput) {
  const cfg = loadAIConfig();
  const chosenProvider = input.provider || cfg.imageProvider;
  const providerInstance = getImageProvider(chosenProvider);

  // Fail fast on obvious misconfiguration / unsupported aspect ratio before reserving credits
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

  const aspect = input.aspectRatio || '16:9';
  if (!providerInstance.capabilities.supportedAspectRatios.includes(aspect)) {
    throw new ProviderCapabilityError(
      `Provider "${chosenProvider}" does not support aspect ratio ${aspect}. Supported: ${providerInstance.capabilities.supportedAspectRatios.join(', ')}.`,
      chosenProvider
    );
  }

  let refBase64 = input.referenceImageBase64;
  let refMime = input.referenceImageMimeType;
  if (!refBase64 && input.referenceAssetId) {
    const refAsset = await readAssetAsBase64(input.referenceAssetId);
    if (refAsset) {
      refBase64 = refAsset.base64;
      refMime = refAsset.mimeType;
    }
  }

  const resolvedModel =
    chosenProvider === 'mock'
      ? 'mock-image-v1'
      : chosenProvider === 'openai'
        ? process.env.OPENAI_IMAGE_MODEL || 'dall-e-3'
        : input.model || 'gemini-nano-banana-2.1';

  return enqueueMediaGenerationJob({
    projectId: input.projectId,
    sceneId: input.sceneId,
    userId: input.userId,
    idempotencyKey: input.idempotencyKey,
    requestTimeoutMs: input.requestTimeoutMs,
    request: {
      mediaType: 'image',
      provider: chosenProvider,
      model: resolvedModel,
      prompt: input.prompt,
      aspectRatio: aspect,
      resolution: input.resolution || '1K',
      style: input.style,
      useSearchGrounding: Boolean(input.useSearchGrounding),
      referenceImageBase64: refBase64,
      referenceImageMimeType: refMime,
    },
  });
}
