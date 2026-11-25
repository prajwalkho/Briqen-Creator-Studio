import {
  type ImageProviderName,
  type LLMProviderName,
  type VideoProviderName,
  loadAIConfig,
} from './config.ts';
import type { ImageProvider } from './interfaces/imageProvider.ts';
import type { LLMProvider } from './interfaces/llmProvider.ts';
import type { VideoProvider } from './interfaces/videoProvider.ts';
import { GeminiImageProvider } from './providers/image/geminiImageProvider.ts';
import { MockImageProvider } from './providers/image/mockImageProvider.ts';
import { OpenAIImageProvider } from './providers/image/openaiImageProvider.ts';
import { GeminiLLMProvider } from './providers/llm/geminiLlmProvider.ts';
import { MockLLMProvider } from './providers/llm/mockLlmProvider.ts';
import { OpenAILLMProvider } from './providers/llm/openaiLlmProvider.ts';
import { GeminiVideoProvider } from './providers/video/geminiVideoProvider.ts';
import { MockVideoProvider } from './providers/video/mockVideoProvider.ts';
import { OpenAIVideoProvider } from './providers/video/openaiVideoProvider.ts';

export function getLLMProvider(override?: LLMProviderName): LLMProvider {
  const cfg = loadAIConfig();
  const chosen = override || cfg.llmProvider;
  const timeoutMs = cfg.requestTimeoutSec * 1000;

  switch (chosen) {
    case 'gemini':
      return new GeminiLLMProvider(timeoutMs);
    case 'openai':
      return new OpenAILLMProvider(timeoutMs);
    case 'mock':
    default:
      return new MockLLMProvider();
  }
}

export function getImageProvider(override?: ImageProviderName, timeoutMsOverride?: number): ImageProvider {
  const cfg = loadAIConfig();
  const chosen = override || cfg.imageProvider;
  const timeoutMs = timeoutMsOverride ?? cfg.requestTimeoutSec * 1000;

  switch (chosen) {
    case 'gemini':
      return new GeminiImageProvider(timeoutMs);
    case 'openai':
      return new OpenAIImageProvider(timeoutMs);
    case 'mock':
    default:
      return new MockImageProvider();
  }
}

export function getVideoProvider(override?: VideoProviderName, timeoutMsOverride?: number): VideoProvider {
  const cfg = loadAIConfig();
  const chosen = override || cfg.videoProvider;
  const timeoutMs = timeoutMsOverride ?? Math.max(cfg.requestTimeoutSec * 1000, 180_000);

  switch (chosen) {
    case 'gemini':
      return new GeminiVideoProvider(timeoutMs);
    case 'openai':
      return new OpenAIVideoProvider(timeoutMs);
    case 'mock':
    default:
      return new MockVideoProvider();
  }
}

export function getProviderOverview() {
  const cfg = loadAIConfig();
  const activeLlm = getLLMProvider();
  const activeImage = getImageProvider();
  const activeVideo = getVideoProvider();

  return {
    defaults: {
      llmProvider: cfg.llmProvider,
      imageProvider: cfg.imageProvider,
      videoProvider: cfg.videoProvider,
      requestTimeoutSec: cfg.requestTimeoutSec,
      maxRetries: cfg.maxRetries,
    },
    configuredKeys: {
      gemini: cfg.geminiConfigured,
      openai: cfg.openaiConfigured,
      openaiVideoEndpoint: cfg.openaiVideoConfigured,
    },
    active: {
      llm: activeLlm.capabilities,
      image: activeImage.capabilities,
      video: activeVideo.capabilities,
    },
    providers: {
      llm: [
        new GeminiLLMProvider().capabilities,
        new OpenAILLMProvider().capabilities,
        new MockLLMProvider().capabilities,
      ],
      image: [
        new GeminiImageProvider().capabilities,
        new OpenAIImageProvider().capabilities,
        new MockImageProvider().capabilities,
      ],
      video: [
        new GeminiVideoProvider().capabilities,
        new OpenAIVideoProvider().capabilities,
        new MockVideoProvider().capabilities,
      ],
    },
    warnings: cfg.warnings,
  };
}
