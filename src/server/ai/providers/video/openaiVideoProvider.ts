import { hasOpenAIKey, hasOpenAIVideoEndpoint } from '../../config.ts';
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

export class OpenAIVideoProvider implements VideoProvider {
  readonly name = 'openai';
  readonly capabilities: VideoProviderCapabilities = {
    name: 'openai',
    isMock: false,
    supportedAspectRatios: ['16:9', '9:16'],
    supportsImageToVideo: false,
    minDurationSec: 4,
    maxDurationSec: 12,
    supportedResolutions: ['720p', '1080p'],
    limitations: [
      'OpenAI public REST video generation requires an explicit OPENAI_VIDEO_ENDPOINT (e.g., Sora API endpoint) and OPENAI_API_KEY.',
      'When OPENAI_VIDEO_ENDPOINT is unset, Briqen reports a clear capability error instead of fabricating mock clips.',
    ],
  };

  private readonly timeoutMs: number;

  constructor(timeoutMs = 180_000) {
    this.timeoutMs = timeoutMs;
  }

  async generateVideo(request: VideoGenerateRequest, signal?: AbortSignal): Promise<VideoGenerateResult> {
    if (!hasOpenAIKey()) {
      throw new ProviderConfigurationError(
        'OPENAI_API_KEY is not configured. Configure OPENAI_API_KEY and OPENAI_VIDEO_ENDPOINT or switch VIDEO_PROVIDER=gemini|mock.',
        'openai'
      );
    }

    if (!hasOpenAIVideoEndpoint()) {
      throw new ProviderCapabilityError(
        'OpenAI video generation is unavailable because OPENAI_VIDEO_ENDPOINT is not configured (OpenAI standard Chat/Images keys do not include a default public Sora video endpoint). Switch VIDEO_PROVIDER to gemini or mock, or set OPENAI_VIDEO_ENDPOINT.',
        'openai'
      );
    }

    const endpoint = process.env.OPENAI_VIDEO_ENDPOINT!.trim();
    const model = process.env.OPENAI_VIDEO_MODEL || 'sora-2';
    const durNum = Math.min(12, Math.max(4, Math.round(request.durationSec || 6)));
    const abortSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)])
      : AbortSignal.timeout(this.timeoutMs);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        signal: abortSignal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          prompt: request.style ? `${request.prompt}. Style: ${request.style}` : request.prompt,
          aspect_ratio: request.aspectRatio,
          duration: durNum,
          resolution: request.resolution || '720p',
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new ProviderUnavailableError(
          `OpenAI video endpoint returned HTTP ${res.status}: ${errText.slice(0, 240)}`,
          'openai',
          res.status >= 500 || res.status === 429
        );
      }

      if (contentType.includes('video/')) {
        const buf = Buffer.from(await res.arrayBuffer());
        const dims = dimsFor(request.aspectRatio, request.resolution);
        return {
          buffer: buf,
          mimeType: contentType.split(';')[0] || 'video/mp4',
          fileExtension: 'mp4',
          width: dims.width,
          height: dims.height,
          durationSec: durNum,
          model,
          providerJobId: res.headers.get('x-request-id') || `openai-vid-${Date.now()}`,
          metadata: { model, endpointConfigured: true },
          usage: { provider: 'openai', isMock: false },
        };
      }

      const payload = (await res.json()) as {
        id?: string;
        b64_video?: string;
        video_url?: string;
      };

      let buffer: Buffer | null = null;
      if (payload.b64_video) {
        buffer = Buffer.from(payload.b64_video, 'base64');
      } else if (payload.video_url) {
        const vidRes = await fetch(payload.video_url, { signal: abortSignal });
        if (vidRes.ok) {
          buffer = Buffer.from(await vidRes.arrayBuffer());
        }
      }

      if (!buffer) {
        throw new ProviderUnavailableError(
          'OpenAI video endpoint did not return binary video, b64_video, or video_url.',
          'openai',
          true
        );
      }

      const dims = dimsFor(request.aspectRatio, request.resolution);
      return {
        buffer,
        mimeType: 'video/mp4',
        fileExtension: 'mp4',
        width: dims.width,
        height: dims.height,
        durationSec: durNum,
        model,
        providerJobId: payload.id || `openai-vid-${Date.now()}`,
        metadata: { model, providerJobId: payload.id },
        usage: {
          provider: 'openai',
          isMock: false,
          providerRequestId: payload.id,
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
        throw new ProviderTimeoutError(`OpenAI video generation timed out: ${msg}`, 'openai');
      }
      throw new ProviderUnavailableError(msg, 'openai', true);
    }
  }
}
