import { ThinkingLevel, Type } from '@google/genai';
import { getAiClient } from '../../../providers/aiClient.ts';
import {
  ProviderConfigurationError,
  ProviderTimeoutError,
  ProviderUnavailableError,
  SchemaValidationError,
} from '../../exceptions.ts';
import { hasGeminiKey } from '../../config.ts';
import type {
  ExtractedSceneDTO,
  LLMExtractScenesRequest,
  LLMExtractScenesResponse,
  LLMGenerateScriptRequest,
  LLMImproveScriptRequest,
  LLMProvider,
  LLMProviderCapabilities,
  LLMScriptResponse,
} from '../../interfaces/llmProvider.ts';
import { extractedScenesArraySchema } from '../../schemas.ts';

function mapGeminiError(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.toLowerCase().includes('abort') || msg.toLowerCase().includes('timeout')) {
    throw new ProviderTimeoutError(`Gemini request timed out: ${msg}`, 'gemini');
  }
  if (msg.includes('GEMINI_API_KEY')) {
    throw new ProviderConfigurationError(msg, 'gemini');
  }
  throw new ProviderUnavailableError(msg, 'gemini', true);
}

export class GeminiLLMProvider implements LLMProvider {
  readonly name = 'gemini';
  readonly capabilities: LLMProviderCapabilities = {
    name: 'gemini',
    isMock: false,
    supportsSearchGrounding: true,
    supportsStructuredJson: true,
    limitations: [
      'Deep scene extraction uses gemini-4-carbon (requires billing-enabled GEMINI_API_KEY for high-reasoning tier).',
      'Does not accept sampling overrides (temperature/topP/topK) on Gemini 4 models.',
    ],
  };

  private readonly timeoutMs: number;

  constructor(timeoutMs = 120_000) {
    this.timeoutMs = timeoutMs;
  }

  async generateScript(request: LLMGenerateScriptRequest): Promise<LLMScriptResponse> {
    if (!hasGeminiKey()) {
      throw new ProviderConfigurationError(
        'GEMINI_API_KEY is not configured. Add it in Settings > Secrets or switch LLM_PROVIDER=mock.',
        'gemini'
      );
    }

    const ai = getAiClient();
    const model = 'gemini-4-hydrogen';

    const prompt = [
      `Write a high-converting ${request.targetDurationSec}-second ${request.contentType.replace('_', ' ')} video script in ${request.language}.`,
      request.topic ? `Topic: ${request.topic}` : '',
      `Title: ${request.title}`,
      request.description ? `Description: ${request.description}` : '',
      `Brand / Product: ${request.brandName || 'N/A'}`,
      `Target Audience: ${request.targetAudience || 'General creators and buyers'}`,
      `Target Platform: ${request.platform}`,
      `Tone of Voice: ${request.toneOfVoice}`,
      `Marketing Objective: ${request.marketingObjective}`,
      request.brief ? `Creative Brief / Key Points: ${request.brief}` : '',
      `Structure clearly into 3 sections: INTRODUCTION (hook), MAIN CONTENT (body/proof), and CONCLUSION (CTA) with timestamped beats (e.g. [00:00 - 00:05]), Visual cues, and Voiceover lines.`,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          abortSignal: AbortSignal.timeout(this.timeoutMs),
          systemInstruction:
            'You are an award-winning commercial video director and marketing copywriter. Deliver clean, production-ready scripts without filler commentary.',
          ...(request.useSearchGrounding ? { tools: [{ googleSearch: {} }] } : {}),
        },
      });

      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const groundingSources: Array<{ title: string; uri: string }> = [];
      for (const chunk of chunks) {
        if (chunk.web?.uri) {
          groundingSources.push({
            title: chunk.web.title || chunk.web.uri,
            uri: chunk.web.uri,
          });
        }
      }

      const meta = response.usageMetadata;
      return {
        content: (response.text ?? '').trim(),
        aiModelUsed: request.useSearchGrounding ? `${model}+googleSearch` : model,
        aiNotes: request.useSearchGrounding
          ? `Generated with ${model} and live Google Search Grounding (${groundingSources.length} web sources).`
          : `Generated with ${model}.`,
        groundingSources,
        usage: {
          promptTokens: meta?.promptTokenCount,
          completionTokens: meta?.candidatesTokenCount,
          totalTokens: meta?.totalTokenCount,
          provider: 'gemini',
          isMock: false,
          providerRequestId: response.responseId,
        },
      };
    } catch (err) {
      mapGeminiError(err);
    }
  }

  async improveScript(request: LLMImproveScriptRequest): Promise<LLMScriptResponse> {
    if (!hasGeminiKey()) {
      throw new ProviderConfigurationError(
        'GEMINI_API_KEY is not configured. Add it in Settings > Secrets or switch LLM_PROVIDER=mock.',
        'gemini'
      );
    }

    const ai = getAiClient();
    const isFast = request.action === 'grammar' || request.action === 'shorten';
    const model = isFast ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen';

    const actionInstructions: Record<LLMImproveScriptRequest['action'], string> = {
      rewrite: 'Completely rewrite the script for stronger narrative momentum and clearer hooks while keeping core facts.',
      grammar: 'Fix all grammar, punctuation, cadence, and phrasing issues while preserving structure and meaning.',
      clarity: 'Improve clarity, scannability, and spoken-word readability so every sentence lands naturally on camera.',
      engaging: 'Make the script noticeably more engaging with sharper curiosity hooks, vivid visuals, and rhythm.',
      tone: `Adapt the tone of voice to be ${request.targetTone || 'confident and modern'} while preserving key product facts.`,
      expand: 'Expand the script with richer visual direction, stronger sensory language, and an extra mid-roll proof beat.',
      shorten: 'Tighten and condense the script by ~30% for punchy pacing without losing the call to action.',
      alternative: 'Create a bold alternative creative angle and opening hook for A/B testing on the same brief.',
    };

    const prompt = [
      actionInstructions[request.action],
      `Platform: ${request.platform} | Language: ${request.language}`,
      request.instructions ? `Extra user direction: ${request.instructions}` : '',
      '',
      'Original Script:',
      request.currentContent,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          abortSignal: AbortSignal.timeout(this.timeoutMs),
          systemInstruction:
            'Return only the improved production script in clean timestamped format with Visual and Voiceover lines. Do not wrap in markdown fences.',
        },
      });

      const meta = response.usageMetadata;
      return {
        content: (response.text ?? '').trim(),
        aiModelUsed: model,
        aiNotes: `AI improvement (${request.action}) completed using ${model}.`,
        groundingSources: [],
        usage: {
          promptTokens: meta?.promptTokenCount,
          completionTokens: meta?.candidatesTokenCount,
          totalTokens: meta?.totalTokenCount,
          provider: 'gemini',
          isMock: false,
          providerRequestId: response.responseId,
        },
      };
    } catch (err) {
      mapGeminiError(err);
    }
  }

  async extractScenes(request: LLMExtractScenesRequest): Promise<LLMExtractScenesResponse> {
    if (!hasGeminiKey()) {
      throw new ProviderConfigurationError(
        'GEMINI_API_KEY is not configured. Add it in Settings > Secrets or switch LLM_PROVIDER=mock.',
        'gemini'
      );
    }

    const ai = getAiClient();
    const model = 'gemini-4-carbon';

    try {
      const response = await ai.models.generateContent({
        model,
        contents: [
          `Analyze the following marketing video script and split it into 3 to 6 cohesive, production-ready scenes for ${request.platform} (${request.aspectRatio}).`,
          `Return a JSON array where each element includes:`,
          `- sceneNumber (1-based integer)`,
          `- title (concise title)`,
          `- narration (spoken voiceover)`,
          `- visualDescription (camera & visual direction)`,
          `- imagePrompt (detailed prompt optimized for AI image generation)`,
          `- videoPrompt (dynamic motion prompt optimized for AI video generation)`,
          `- durationSec (integer 3 to 15 seconds)`,
          `- transition ('fade', 'dissolve', 'wipeleft', or 'none')`,
          `- mediaPreference ('image' or 'video')`,
          '',
          'Script:',
          request.scriptContent,
        ].join('\n'),
        config: {
          abortSignal: AbortSignal.timeout(this.timeoutMs),
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                sceneNumber: { type: Type.INTEGER },
                title: { type: Type.STRING },
                narration: { type: Type.STRING },
                visualDescription: { type: Type.STRING },
                imagePrompt: { type: Type.STRING },
                videoPrompt: { type: Type.STRING },
                durationSec: { type: Type.INTEGER },
                transition: { type: Type.STRING },
                mediaPreference: { type: Type.STRING },
              },
              required: [
                'sceneNumber',
                'title',
                'narration',
                'visualDescription',
                'imagePrompt',
                'videoPrompt',
                'durationSec',
                'transition',
                'mediaPreference',
              ],
            },
          },
        },
      });

      const rawText = (response.text ?? '[]').trim();
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(rawText);
      } catch {
        throw new SchemaValidationError('Gemini returned invalid JSON for scene extraction.', 'gemini');
      }

      const validTransitions = new Set(['fade', 'dissolve', 'wipeleft', 'none']);
      const normalizedInput = Array.isArray(parsedJson)
        ? parsedJson.map((item: Record<string, unknown>, idx: number) => ({
            sceneNumber: Number(item.sceneNumber) || idx + 1,
            title: String(item.title || `Scene ${idx + 1}`),
            narration: String(item.narration || ''),
            visualDescription: String(item.visualDescription || ''),
            imagePrompt: String(item.imagePrompt || item.visualDescription || ''),
            videoPrompt: String(item.videoPrompt || item.visualDescription || ''),
            durationSec: Math.min(15, Math.max(3, Number(item.durationSec) || 5)),
            transition: validTransitions.has(String(item.transition)) ? String(item.transition) : 'fade',
            mediaPreference: item.mediaPreference === 'video' ? 'video' : 'image',
          }))
        : [];

      const validated = extractedScenesArraySchema.safeParse(normalizedInput);
      if (!validated.success) {
        throw new SchemaValidationError(
          `Extracted scenes failed schema validation: ${validated.error.issues[0]?.message || 'invalid array'}`,
          'gemini'
        );
      }

      const scenes: ExtractedSceneDTO[] = validated.data.map((s, idx) => ({
        sceneNumber: s.sceneNumber ?? idx + 1,
        title: s.title,
        narration: s.narration,
        visualDescription: s.visualDescription,
        imagePrompt: s.imagePrompt,
        videoPrompt: s.videoPrompt,
        durationSec: s.durationSec,
        transition: s.transition,
        mediaPreference: s.mediaPreference,
      }));

      const meta = response.usageMetadata;
      return {
        scenes,
        modelUsed: model,
        usage: {
          promptTokens: meta?.promptTokenCount,
          completionTokens: meta?.candidatesTokenCount,
          totalTokens: meta?.totalTokenCount,
          provider: 'gemini',
          isMock: false,
          providerRequestId: response.responseId,
        },
      };
    } catch (err) {
      if (err instanceof SchemaValidationError) throw err;
      mapGeminiError(err);
    }
  }
}
