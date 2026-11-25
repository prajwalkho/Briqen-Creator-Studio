import { getAiClient } from '../../../providers/aiClient.ts';
import { hasGeminiKey } from '../../config.ts';
import {
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

function dimsFor(aspectRatio: string, resolution = '1K') {
  const high = resolution === '4K' || resolution === '2K';
  switch (aspectRatio) {
    case '9:16':
      return { width: 720, height: 1280 };
    case '1:1':
      return { width: 1024, height: 1024 };
    case '4:3':
      return { width: 1024, height: 768 };
    case '3:4':
      return { width: 768, height: 1024 };
    case '16:9':
    default:
      return { width: high ? 1920 : 1280, height: high ? 1080 : 720 };
  }
}

export class GeminiImageProvider implements ImageProvider {
  readonly name = 'gemini';
  readonly capabilities: ImageProviderCapabilities = {
    name: 'gemini',
    isMock: false,
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
    supportsImageEditing: true,
    supportsSearchGrounding: true,
    supportsResolutions: ['1K', '2K', '4K'],
    limitations: [
      'Nano Banana image models require a billing-enabled GEMINI_API_KEY.',
      'Google Image Search grounding is supported only on gemini-nano-banana-2.1.',
    ],
  };

  private readonly timeoutMs: number;

  constructor(timeoutMs = 120_000) {
    this.timeoutMs = timeoutMs;
  }

  async generateImage(request: ImageGenerateRequest, signal?: AbortSignal): Promise<ImageGenerateResult> {
    if (!hasGeminiKey()) {
      throw new ProviderConfigurationError(
        'GEMINI_API_KEY is not configured. Add it in Settings > Secrets or set IMAGE_PROVIDER=mock.',
        'gemini'
      );
    }

    const ai = getAiClient();
    const model =
      request.model === 'gemini-3.1-flash-lite-image'
        ? 'gemini-3.1-flash-lite-image'
        : 'gemini-nano-banana-2.1';

    const styledPrompt = request.style ? `${request.prompt}\nVisual style: ${request.style}` : request.prompt;
    const parts: Array<Record<string, unknown>> = [];

    if (request.referenceImageBase64 && request.referenceImageMimeType) {
      parts.push({
        inlineData: {
          data: request.referenceImageBase64,
          mimeType: request.referenceImageMimeType,
        },
      });
    }
    parts.push({ text: styledPrompt });

    const abortSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)])
      : AbortSignal.timeout(this.timeoutMs);

    const config: Record<string, unknown> = {
      abortSignal,
      imageConfig: {
        aspectRatio: request.aspectRatio || '16:9',
        ...(model === 'gemini-nano-banana-2.1' && request.resolution
          ? { imageSize: request.resolution }
          : {}),
      },
    };

    if (model === 'gemini-nano-banana-2.1' && request.useSearchGrounding) {
      config.tools = [
        {
          googleSearch: {
            searchTypes: {
              webSearch: {},
              imageSearch: {},
            },
          },
        },
      ];
    }

    try {
      const response = await ai.models.generateContent({
        model,
        contents: { parts: parts as never },
        config: config as never,
      });

      const respParts = response.candidates?.[0]?.content?.parts ?? [];
      for (const part of respParts) {
        if (part.inlineData?.data) {
          const mimeType = part.inlineData.mimeType || 'image/png';
          const ext = mimeType.includes('jpeg') ? 'jpg' : 'png';
          const dims = dimsFor(request.aspectRatio, request.resolution);
          return {
            buffer: Buffer.from(part.inlineData.data, 'base64'),
            mimeType,
            fileExtension: ext,
            width: dims.width,
            height: dims.height,
            model,
            providerRequestId: response.responseId,
            metadata: {
              model,
              style: request.style || 'default',
              aspectRatio: request.aspectRatio,
            },
            usage: {
              provider: 'gemini',
              isMock: false,
              providerRequestId: response.responseId,
            },
          };
        }
      }

      throw new ProviderUnavailableError('Gemini did not return an image payload.', 'gemini', true);
    } catch (err) {
      if (err instanceof ProviderConfigurationError || err instanceof ProviderUnavailableError) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('abort') || msg.toLowerCase().includes('timeout')) {
        throw new ProviderTimeoutError(`Gemini image generation timed out: ${msg}`, 'gemini');
      }
      throw new ProviderUnavailableError(msg, 'gemini', true);
    }
  }
}
