import { hasOpenAIKey } from '../../config.ts';
import {
  ProviderConfigurationError,
  ProviderTimeoutError,
  ProviderUnavailableError,
  SchemaValidationError,
} from '../../exceptions.ts';
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

interface OpenAIChatResponse {
  id?: string;
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string };
}

export class OpenAILLMProvider implements LLMProvider {
  readonly name = 'openai';
  readonly capabilities: LLMProviderCapabilities = {
    name: 'openai',
    isMock: false,
    supportsSearchGrounding: false,
    supportsStructuredJson: true,
    limitations: [
      'Requires OPENAI_API_KEY configured in server environment variables.',
      'Google Search Grounding is Gemini-specific and not executed on OpenAI.',
    ],
  };

  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(timeoutMs = 120_000, model?: string) {
    this.timeoutMs = timeoutMs;
    this.model = model || process.env.OPENAI_LLM_MODEL || 'gpt-4o-mini';
  }

  private async chatCompletion(
    messages: Array<{ role: 'system' | 'user'; content: string }>,
    jsonMode = false
  ): Promise<OpenAIChatResponse> {
    if (!hasOpenAIKey()) {
      throw new ProviderConfigurationError(
        'OPENAI_API_KEY is not configured. Set OPENAI_API_KEY on the server or switch LLM_PROVIDER.',
        'openai'
      );
    }

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
        }),
      });

      const payload = (await res.json()) as OpenAIChatResponse;
      if (!res.ok) {
        throw new ProviderUnavailableError(
          payload.error?.message || `OpenAI API returned HTTP ${res.status}.`,
          'openai',
          res.status >= 500 || res.status === 429
        );
      }
      return payload;
    } catch (err) {
      if (err instanceof ProviderConfigurationError || err instanceof ProviderUnavailableError) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('abort') || msg.toLowerCase().includes('timeout')) {
        throw new ProviderTimeoutError(`OpenAI request timed out: ${msg}`, 'openai');
      }
      throw new ProviderUnavailableError(msg, 'openai', true);
    }
  }

  async generateScript(request: LLMGenerateScriptRequest): Promise<LLMScriptResponse> {
    const prompt = [
      `Write a ${request.targetDurationSec}-second ${request.contentType.replace('_', ' ')} video script in ${request.language}.`,
      request.topic ? `Topic: ${request.topic}` : '',
      `Title: ${request.title}`,
      request.description ? `Description: ${request.description}` : '',
      `Brand / Product: ${request.brandName || 'N/A'}`,
      `Target Audience: ${request.targetAudience || 'General buyers'}`,
      `Platform: ${request.platform}`,
      `Tone: ${request.toneOfVoice}`,
      `Objective: ${request.marketingObjective}`,
      request.brief ? `Brief: ${request.brief}` : '',
      'Include clear INTRODUCTION, MAIN CONTENT, and CONCLUSION sections with timestamped beats, Visual cues, and Voiceover narration.',
    ]
      .filter(Boolean)
      .join('\n');

    const data = await this.chatCompletion([
      {
        role: 'system',
        content: 'You are a senior commercial video director. Output only the clean production script.',
      },
      { role: 'user', content: prompt },
    ]);

    return {
      content: (data.choices?.[0]?.message?.content || '').trim(),
      aiModelUsed: data.model || this.model,
      aiNotes: `Generated using OpenAI (${data.model || this.model}).`,
      groundingSources: [],
      usage: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        totalTokens: data.usage?.total_tokens,
        provider: 'openai',
        isMock: false,
        providerRequestId: data.id,
      },
    };
  }

  async improveScript(request: LLMImproveScriptRequest): Promise<LLMScriptResponse> {
    const data = await this.chatCompletion([
      {
        role: 'system',
        content: 'Return only the improved script without markdown code fences or commentary.',
      },
      {
        role: 'user',
        content: [
          `Improvement action: ${request.action}.`,
          `Platform: ${request.platform} | Language: ${request.language}`,
          request.targetTone ? `Target tone: ${request.targetTone}` : '',
          request.instructions ? `Instructions: ${request.instructions}` : '',
          '',
          request.currentContent,
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ]);

    return {
      content: (data.choices?.[0]?.message?.content || '').trim(),
      aiModelUsed: data.model || this.model,
      aiNotes: `Improved (${request.action}) via OpenAI (${data.model || this.model}).`,
      groundingSources: [],
      usage: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        totalTokens: data.usage?.total_tokens,
        provider: 'openai',
        isMock: false,
        providerRequestId: data.id,
      },
    };
  }

  async extractScenes(request: LLMExtractScenesRequest): Promise<LLMExtractScenesResponse> {
    const data = await this.chatCompletion(
      [
        {
          role: 'system',
          content:
            'Return strictly JSON: { "scenes": [{ "sceneNumber": number, "title": string, "narration": string, "visualDescription": string, "imagePrompt": string, "videoPrompt": string, "durationSec": number, "transition": "fade"|"dissolve"|"wipeleft"|"none", "mediaPreference": "image"|"video" }] }',
        },
        {
          role: 'user',
          content: `Split this ${request.platform} (${request.aspectRatio}) script into 3 to 6 scenes:\n\n${request.scriptContent}`,
        },
      ],
      true
    );

    const raw = (data.choices?.[0]?.message?.content || '{}').trim();
    let parsedObj: { scenes?: unknown[] };
    try {
      parsedObj = JSON.parse(raw) as { scenes?: unknown[] };
    } catch {
      throw new SchemaValidationError('OpenAI returned invalid JSON during scene extraction.', 'openai');
    }

    const validated = extractedScenesArraySchema.safeParse(parsedObj.scenes);
    if (!validated.success) {
      throw new SchemaValidationError(
        `OpenAI scene extraction failed schema validation: ${validated.error.issues[0]?.message}`,
        'openai'
      );
    }

    const scenes: ExtractedSceneDTO[] = validated.data.map((s, idx) => ({
      sceneNumber: s.sceneNumber ?? idx + 1,
      title: s.title,
      narration: s.narration,
      visualDescription: s.visualDescription,
      imagePrompt: s.imagePrompt || s.visualDescription,
      videoPrompt: s.videoPrompt || s.visualDescription,
      durationSec: s.durationSec,
      transition: s.transition,
      mediaPreference: s.mediaPreference,
    }));

    return {
      scenes,
      modelUsed: data.model || this.model,
      usage: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        totalTokens: data.usage?.total_tokens,
        provider: 'openai',
        isMock: false,
        providerRequestId: data.id,
      },
    };
  }
}
