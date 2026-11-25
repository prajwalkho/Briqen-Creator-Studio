import { getAiClient } from './aiClient.ts';
import type { LLMProviderName } from '../ai/config.ts';
import { getLLMProvider } from '../ai/factory.ts';
import type { AIUsageStats, ExtractedSceneDTO } from '../ai/interfaces/llmProvider.ts';

export interface ScriptGenerateInput {
  topic?: string;
  title: string;
  description?: string;
  brandName: string;
  targetAudience: string;
  platform: string;
  contentType?: 'YouTube' | 'advertisement' | 'educational' | 'promotional' | 'social_media';
  targetDurationSec: number;
  language: string;
  toneOfVoice: string;
  marketingObjective: string;
  brief?: string;
  useSearchGrounding?: boolean;
  provider?: LLMProviderName;
}

export interface ScriptGenerateResult {
  content: string;
  aiModelUsed: string;
  aiNotes: string;
  groundingSources: Array<{ title: string; uri: string }>;
  usage?: AIUsageStats;
}

export async function generateScriptWithAI(
  input: ScriptGenerateInput
): Promise<ScriptGenerateResult> {
  const llm = getLLMProvider(input.provider);
  const res = await llm.generateScript({
    topic: input.topic,
    title: input.title,
    description: input.description,
    brandName: input.brandName,
    targetAudience: input.targetAudience,
    platform: input.platform,
    contentType: input.contentType || 'YouTube',
    targetDurationSec: input.targetDurationSec,
    language: input.language,
    toneOfVoice: input.toneOfVoice,
    marketingObjective: input.marketingObjective,
    brief: input.brief,
    useSearchGrounding: input.useSearchGrounding,
  });

  return {
    content: res.content,
    aiModelUsed: res.aiModelUsed,
    aiNotes: res.aiNotes,
    groundingSources: res.groundingSources,
    usage: res.usage,
  };
}

export interface ScriptReviseInput {
  currentContent: string;
  action: 'rewrite' | 'grammar' | 'clarity' | 'engaging' | 'tone' | 'expand' | 'shorten' | 'alternative';
  targetTone?: string;
  instructions?: string;
  platform: string;
  language: string;
  provider?: LLMProviderName;
}

export async function reviseScriptWithAI(
  input: ScriptReviseInput
): Promise<ScriptGenerateResult> {
  const llm = getLLMProvider(input.provider);
  const res = await llm.improveScript({
    currentContent: input.currentContent,
    action: input.action,
    targetTone: input.targetTone,
    instructions: input.instructions,
    platform: input.platform,
    language: input.language,
  });

  return {
    content: res.content,
    aiModelUsed: res.aiModelUsed,
    aiNotes: res.aiNotes,
    groundingSources: res.groundingSources,
    usage: res.usage,
  };
}

export type ExtractedScene = ExtractedSceneDTO;

export async function extractScenesWithAI(
  scriptContent: string,
  aspectRatio: string,
  platform: string,
  provider: LLMProviderName = 'gemini'
): Promise<{ scenes: ExtractedScene[]; modelUsed: string; usage?: AIUsageStats }> {
  const llm = getLLMProvider(provider);
  const res = await llm.extractScenes({
    scriptContent,
    aspectRatio,
    platform,
  });
  return {
    scenes: res.scenes,
    modelUsed: res.modelUsed,
    usage: res.usage,
  };
}

export async function analyzeMediaWithNeon(
  mediaBuffer: Buffer,
  mimeType: string,
  mediaKind: 'image' | 'video',
  userQuestion?: string
): Promise<{ analysis: string; modelUsed: string }> {
  const ai = getAiClient();
  const model = 'gemini-4-neon';

  const defaultPrompt =
    mediaKind === 'image'
      ? 'Analyze this image for video marketing production. Break down: (1) Subject & Composition, (2) Lighting & Color Palette, (3) Brand Fit & Mood, and (4) A ready-to-use camera motion prompt to animate this image into a video.'
      : 'Analyze this video clip thoroughly. Provide: (1) Scene-by-scene summary & key visual moments with timestamps, (2) Pacing & cinematography critique, (3) Spoken/on-screen messaging takeaways, and (4) Actionable editing recommendations.';

  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        {
          inlineData: {
            mimeType,
            data: mediaBuffer.toString('base64'),
          },
        },
        {
          text: userQuestion?.trim() ? userQuestion.trim() : defaultPrompt,
        },
      ],
    },
  });

  return {
    analysis: (response.text ?? '').trim(),
    modelUsed: model,
  };
}
