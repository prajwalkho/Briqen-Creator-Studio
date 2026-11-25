export interface AIUsageStats {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  provider: string;
  isMock: boolean;
  providerRequestId?: string;
}

export interface LLMGenerateScriptRequest {
  topic?: string;
  title: string;
  description?: string;
  brandName: string;
  targetAudience: string;
  platform: string;
  contentType: 'YouTube' | 'advertisement' | 'educational' | 'promotional' | 'social_media';
  targetDurationSec: number;
  language: string;
  toneOfVoice: string;
  marketingObjective: string;
  brief?: string;
  useSearchGrounding?: boolean;
}

export interface LLMImproveScriptRequest {
  currentContent: string;
  action:
    | 'rewrite'
    | 'grammar'
    | 'clarity'
    | 'engaging'
    | 'tone'
    | 'expand'
    | 'shorten'
    | 'alternative';
  targetTone?: string;
  instructions?: string;
  platform: string;
  language: string;
}

export interface LLMScriptResponse {
  content: string;
  sections?: {
    introduction: string;
    mainContent: string;
    conclusion: string;
  };
  aiModelUsed: string;
  aiNotes: string;
  groundingSources: Array<{ title: string; uri: string }>;
  usage: AIUsageStats;
}

export interface LLMExtractScenesRequest {
  scriptContent: string;
  aspectRatio: string;
  platform: string;
}

export interface ExtractedSceneDTO {
  sceneNumber: number;
  title: string;
  narration: string;
  visualDescription: string;
  imagePrompt: string;
  videoPrompt: string;
  durationSec: number;
  transition: 'fade' | 'dissolve' | 'wipeleft' | 'none';
  mediaPreference: 'image' | 'video';
}

export interface LLMExtractScenesResponse {
  scenes: ExtractedSceneDTO[];
  modelUsed: string;
  usage: AIUsageStats;
}

export interface LLMProviderCapabilities {
  name: string;
  isMock: boolean;
  supportsSearchGrounding: boolean;
  supportsStructuredJson: boolean;
  limitations: string[];
}

export interface LLMProvider {
  readonly name: string;
  readonly capabilities: LLMProviderCapabilities;
  generateScript(request: LLMGenerateScriptRequest): Promise<LLMScriptResponse>;
  improveScript(request: LLMImproveScriptRequest): Promise<LLMScriptResponse>;
  extractScenes(request: LLMExtractScenesRequest): Promise<LLMExtractScenesResponse>;
}
