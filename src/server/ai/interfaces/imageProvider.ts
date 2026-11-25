import type { AIUsageStats } from './llmProvider.ts';

export interface ImageGenerateRequest {
  model?: string;
  prompt: string;
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:3' | '3:4';
  resolution?: '1K' | '2K' | '4K';
  style?: string;
  useSearchGrounding?: boolean;
  referenceImageBase64?: string;
  referenceImageMimeType?: string;
}

export interface ImageGenerateResult {
  buffer: Buffer;
  mimeType: string;
  fileExtension: string;
  width: number;
  height: number;
  model: string;
  providerRequestId?: string;
  metadata: Record<string, unknown>;
  usage?: AIUsageStats;
}

export interface ImageProviderCapabilities {
  name: string;
  isMock: boolean;
  supportedAspectRatios: Array<'16:9' | '9:16' | '1:1' | '4:3' | '3:4'>;
  supportsImageEditing: boolean;
  supportsSearchGrounding: boolean;
  supportsResolutions: Array<'1K' | '2K' | '4K'>;
  limitations: string[];
}

export interface ImageProvider {
  readonly name: string;
  readonly capabilities: ImageProviderCapabilities;
  generateImage(request: ImageGenerateRequest, signal?: AbortSignal): Promise<ImageGenerateResult>;
}
