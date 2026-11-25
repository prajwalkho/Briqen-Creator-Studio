import { hasOpenAIKey } from '../../config.ts';
import {
  ProviderCapabilityError,
  ProviderConfigurationError,
  ProviderTimeoutError,
  ProviderUnavailableError,
} from '../../exceptions.ts';
import type {
  ImageGenerateRequest,
  ImageGenerateResult,
  ImageProvider,
  ImageProviderCapabilities,
} from '../../interfaces/imageProvider.ts';

function mapOpenAISize(aspectRatio: string): { size: string; width: number; height: number } {
  switch (aspectRatio) {
    case '9:16':
      return { size: '1024x1792', width: 1024, height: 1792 };
    case '16:9':
      return { size: '1792x1024', width: 1792, height: 1024 };
    case '1:1':
    default:
      return { size: '1024x1024', width: 1024, height: 1024 };
  }
}

export class OpenAIImageProvider implements ImageProvider {
  readonly name = 'openai';
  readonly capabilities: ImageProviderCapabilities = {
    name: 'openai',
    isMock: false,
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
    supportsImageEditing: false,
    supportsSearchGrounding: false,
    supportsResolutions: ['1K'],
    limitations: [
      'Requires OPENAI_API_KEY configured on the server.',
      'Supports 16:9 (1792x1024), 9:16 (1024x1792), and 1:1 (1024x1024) via dall-e-3.',
      'Does not support Google Search Grounding or inline reference image editing on generations endpoint.',
    ],
  };

  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(timeoutMs = 120_000, model?: string) {
    this.timeoutMs = timeoutMs;
    this.model = model || process.env.OPENAI_IMAGE_MODEL || 'dall-e-3';
  }

  async generateImage(request: ImageGenerateRequest, signal?: AbortSignal): Promise<ImageGenerateResult> {
    if (!hasOpenAIKey()) {
      throw new ProviderConfigurationError(
        'OPENAI_API_KEY is not configured. Set OPENAI_API_KEY on the server or switch IMAGE_PROVIDER.',
        'openai'
      );
    }

    if (!['16:9', '9:16', '1:1'].includes(request.aspectRatio)) {
      throw new ProviderCapabilityError(
        `OpenAI image provider supports 16:9, 9:16, and 1:1 (received ${request.aspectRatio}).`,
        'openai'
      );
    }

    const { size, width, height } = mapOpenAISize(request.aspectRatio);
    const promptText = request.style ? `${request.prompt}. Visual style: ${request.style}` : request.prompt;
    const abortSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)])
      : AbortSignal.timeout(this.timeoutMs);

    try {
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        signal: abortSignal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: this.model,
          prompt: promptText,
          n: 1,
          size,
          response_format: 'b64_json',
        }),
      });

      const data = (await res.json()) as {
        created?: number;
        data?: Array<{ b64_json?: string; revised_prompt?: string }>;
        error?: { message?: string };
      };

      if (!res.ok) {
        throw new ProviderUnavailableError(
          data.error?.message || `OpenAI Images API returned HTTP ${res.status}.`,
          'openai',
          res.status >= 500 || res.status === 429
        );
      }

      const b64 = data.data?.[0]?.b64_json;
      if (!b64) {
        throw new ProviderUnavailableError('OpenAI did not return b64_json image payload.', 'openai', true);
      }

      const reqId = `openai-img-${data.created || Date.now()}`;
      return {
        buffer: Buffer.from(b64, 'base64'),
        mimeType: 'image/png',
        fileExtension: 'png',
        width,
        height,
        model: this.model,
        providerRequestId: reqId,
        metadata: {
          model: this.model,
          style: request.style || 'default',
          revisedPrompt: data.data?.[0]?.revised_prompt,
        },
        usage: {
          provider: 'openai',
          isMock: false,
          providerRequestId: reqId,
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
        throw new ProviderTimeoutError(`OpenAI image generation timed out: ${msg}`, 'openai');
      }
      throw new ProviderUnavailableError(msg, 'openai', true);
    }
  }
}
