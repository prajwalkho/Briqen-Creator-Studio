export type LLMProviderName = 'gemini' | 'openai' | 'mock';
export type ImageProviderName = 'gemini' | 'openai' | 'mock';
export type VideoProviderName = 'gemini' | 'openai' | 'mock';

export interface AIConfig {
  llmProvider: LLMProviderName;
  imageProvider: ImageProviderName;
  videoProvider: VideoProviderName;
  requestTimeoutSec: number;
  maxRetries: number;
  geminiConfigured: boolean;
  openaiConfigured: boolean;
  openaiVideoConfigured: boolean;
  warnings: string[];
}

export function hasGeminiKey(): boolean {
  const key = process.env.GEMINI_API_KEY?.trim();
  return Boolean(key && key !== 'MY_GEMINI_API_KEY' && key.length > 10);
}

export function hasOpenAIKey(): boolean {
  const key = process.env.OPENAI_API_KEY?.trim();
  return Boolean(key && key !== 'MY_OPENAI_API_KEY' && key.length > 10);
}

export function hasOpenAIVideoEndpoint(): boolean {
  return Boolean(process.env.OPENAI_VIDEO_ENDPOINT?.trim() && hasOpenAIKey());
}

function parseProviderEnv<T extends string>(
  envVarName: string,
  allowed: readonly T[],
  fallback: T,
  warnings: string[]
): T {
  const raw = process.env[envVarName]?.trim().toLowerCase();
  if (!raw) return fallback;
  if ((allowed as readonly string[]).includes(raw)) {
    return raw as T;
  }
  warnings.push(
    `Invalid ${envVarName}="${raw}" (expected ${allowed.join('|')}); falling back to "${fallback}".`
  );
  return fallback;
}

export function loadAIConfig(): AIConfig {
  const warnings: string[] = [];
  const geminiConfigured = hasGeminiKey();
  const openaiConfigured = hasOpenAIKey();
  const openaiVideoConfigured = hasOpenAIVideoEndpoint();

  const defaultProvider = geminiConfigured ? 'gemini' : 'mock';

  const llmProvider = parseProviderEnv<LLMProviderName>(
    'LLM_PROVIDER',
    ['gemini', 'openai', 'mock'],
    defaultProvider,
    warnings
  );
  const imageProvider = parseProviderEnv<ImageProviderName>(
    'IMAGE_PROVIDER',
    ['gemini', 'openai', 'mock'],
    defaultProvider,
    warnings
  );
  const videoProvider = parseProviderEnv<VideoProviderName>(
    'VIDEO_PROVIDER',
    ['gemini', 'openai', 'mock'],
    defaultProvider,
    warnings
  );

  if (llmProvider === 'gemini' && !geminiConfigured) {
    warnings.push('LLM_PROVIDER=gemini but GEMINI_API_KEY is missing; LLM calls will fail unless mock/openai is selected.');
  }
  if (llmProvider === 'openai' && !openaiConfigured) {
    warnings.push('LLM_PROVIDER=openai but OPENAI_API_KEY is missing.');
  }
  if (imageProvider === 'openai' && !openaiConfigured) {
    warnings.push('IMAGE_PROVIDER=openai but OPENAI_API_KEY is missing.');
  }
  if (videoProvider === 'openai' && !openaiVideoConfigured) {
    warnings.push('VIDEO_PROVIDER=openai requires OPENAI_API_KEY and OPENAI_VIDEO_ENDPOINT; OpenAI video generation will report capability limits.');
  }

  const rawTimeout = Number(process.env.AI_REQUEST_TIMEOUT || 120);
  const requestTimeoutSec = Number.isFinite(rawTimeout)
    ? Math.min(600, Math.max(1, Math.round(rawTimeout)))
    : 120;

  const rawRetries = Number(process.env.AI_MAX_RETRIES || 3);
  const maxRetries = Number.isFinite(rawRetries)
    ? Math.min(5, Math.max(0, Math.round(rawRetries)))
    : 3;

  return {
    llmProvider,
    imageProvider,
    videoProvider,
    requestTimeoutSec,
    maxRetries,
    geminiConfigured,
    openaiConfigured,
    openaiVideoConfigured,
    warnings,
  };
}

export function validateStartupAIConfig(): AIConfig {
  const cfg = loadAIConfig();
  console.log(
    `AI Config validated — LLM: ${cfg.llmProvider}, Image: ${cfg.imageProvider}, Video: ${cfg.videoProvider}, Timeout: ${cfg.requestTimeoutSec}s, Retries: ${cfg.maxRetries}`
  );
  for (const warn of cfg.warnings) {
    console.warn(`[AI Config Warning] ${warn}`);
  }
  return cfg;
}
