import type { AIUsageStats } from './llmProvider.ts';

export interface VideoGenerateRequest {
  prompt: string;
  aspectRatio: '16:9' | '9:16';
  resolution?: '360p' | '720p' | '1080p' | '4k';
  style?: string;
  durationSec: number;
  referenceImageBase64?: string;
  referenceImageMimeType?: string;
}

export interface VideoGenerateResult {
  buffer: Buffer;
  mimeType: string;
  fileExtension: string;
  width: number;
  height: number;
  durationSec: number;
  model: string;
  providerJobId?: string;
  metadata: Record<string, unknown>;
  usage?: AIUsageStats;
}

export interface VideoProviderCapabilities {
  name: string;
  isMock: boolean;
  supportedAspectRatios: Array<'16:9' | '9:16'>;
  supportsImageToVideo: boolean;
  minDurationSec: number;
  maxDurationSec: number;
  supportedResolutions: Array<'360p' | '720p' | '1080p' | '4k'>;
  limitations: string[];
}

export interface VideoProvider {
  readonly name: string;
  readonly capabilities: VideoProviderCapabilities;
  generateVideo(request: VideoGenerateRequest, signal?: AbortSignal): Promise<VideoGenerateResult>;
}
