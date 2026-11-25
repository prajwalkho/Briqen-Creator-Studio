import { getAiClient } from '../../../providers/aiClient.ts';
import { hasGeminiKey } from '../../config.ts';
import {
  ProviderCapabilityError,
  ProviderConfigurationError,
  ProviderTimeoutError,
  ProviderUnavailableError,
} from '../../exceptions.ts';
import type {
  VideoGenerateRequest,
  VideoGenerateResult,
  VideoProvider,
  VideoProviderCapabilities,
} from '../../interfaces/videoProvider.ts';

function dimsFor(aspectRatio: '16:9' | '9:16', resolution = '720p') {
  const is1080 = resolution === '1080p' || resolution === '4k';
  if (aspectRatio === '9:16') {
    return is1080 ? { width: 1080, height: 1920 } : { width: 720, height: 1280 };
  }
  return is1080 ? { width: 1920, height: 1080 } : { width: 1280, height: 720 };
}

export class GeminiVideoProvider implements VideoProvider {
  readonly name = 'gemini';
  readonly capabilities: VideoProviderCapabilities = {
    name: 'gemini',
    isMock: false,
    supportedAspectRatios: ['16:9', '9:16'],
    supportsImageToVideo: true,
    minDurationSec: 3,
    maxDurationSec: 15,
    supportedResolutions: ['360p', '720p', '1080p', '4k'],
    limitations: [
      'Uses gemini-omni-1.2-flash via the Interactions API (requires billing-enabled GEMINI_API_KEY).',
      'Supports 16:9 and 9:16 aspect ratios and durations between 3s and 15s.',
    ],
  };

  private readonly timeoutMs: number;

  constructor(timeoutMs = 180_000) {
    this.timeoutMs = timeoutMs;
  }

  async generateVideo(request: VideoGenerateRequest, signal?: AbortSignal): Promise<VideoGenerateResult> {
    if (!hasGeminiKey()) {
      throw new ProviderConfigurationError(
        'GEMINI_API_KEY is not configured. Add it in Settings > Secrets or switch VIDEO_PROVIDER=mock.',
        'gemini'
      );
    }

    if (request.aspectRatio !== '16:9' && request.aspectRatio !== '9:16') {
      throw new ProviderCapabilityError(
        `Gemini Omni supports 16:9 and 9:16 aspect ratios (received ${request.aspectRatio}).`,
        'gemini'
      );
    }

    const ai = getAiClient();
    const model = 'gemini-omni-1.2-flash';
    const durNum = Math.min(15, Math.max(3, Math.round(request.durationSec || 6)));
    const duration = `${durNum}s`;
    const resolution =
      request.resolution === '1080p' || request.resolution === '360p' || request.resolution === '4k'
        ? request.resolution
        : '720p';

    const promptText = request.style ? `${request.prompt}. Style: ${request.style}` : request.prompt;
    const inputPayload =
      request.referenceImageBase64 && request.referenceImageMimeType
        ? [
            {
              type: 'image' as const,
              mime_type: request.referenceImageMimeType,
              data: request.referenceImageBase64,
            },
            {
              type: 'text' as const,
              text: promptText,
            },
          ]
        : promptText;

    const abortSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)])
      : AbortSignal.timeout(this.timeoutMs);

    try {
      const interaction = await ai.interactions.create(
        {
          model,
          input: inputPayload as never,
          background: false,
          store: false,
          stream: false,
          response_format: {
            type: 'video',
            aspect_ratio: request.aspectRatio,
            duration,
            resolution,
          } as never,
        },
        { timeout: this.timeoutMs, signal: abortSignal }
      );

      const videoPart = interaction.output_video;
      if (!videoPart?.data) {
        throw new ProviderUnavailableError('Gemini Omni did not return a video payload.', 'gemini', true);
      }

      const dims = dimsFor(request.aspectRatio, resolution);
      return {
        buffer: Buffer.from(videoPart.data, 'base64'),
        mimeType: videoPart.mime_type || 'video/mp4',
        fileExtension: 'mp4',
        width: dims.width,
        height: dims.height,
        durationSec: durNum,
        model,
        providerJobId: interaction.id,
        metadata: {
          model,
          interactionId: interaction.id,
          mode: request.referenceImageBase64 ? 'image_to_video' : 'text_to_video',
          aspectRatio: request.aspectRatio,
          resolution,
        },
        usage: {
          provider: 'gemini',
          isMock: false,
          providerRequestId: interaction.id,
        },
      };
    } catch (err) {
      if (
        err instanceof ProviderConfigurationError ||
        err instanceof ProviderCapabilityError ||
        err instanceof ProviderUnavailableError
      ) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('abort') || msg.toLowerCase().includes('timeout')) {
        throw new ProviderTimeoutError(`Gemini video generation timed out: ${msg}`, 'gemini');
      }
      throw new ProviderUnavailableError(msg, 'gemini', true);
    }
  }
}
