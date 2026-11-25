import { ThinkingLevel, Type } from '@google/genai';
import { getAiClient } from './aiClient.ts';

export interface ScriptGenerateInput {
  title: string;
  brandName: string;
  targetAudience: string;
  platform: string;
  targetDurationSec: number;
  language: string;
  toneOfVoice: string;
  marketingObjective: string;
  brief?: string;
  useSearchGrounding?: boolean;
  provider?: 'gemini' | 'mock';
}

export interface ScriptGenerateResult {
  content: string;
  aiModelUsed: string;
  aiNotes: string;
  groundingSources: Array<{ title: string; uri: string }>;
}

export async function generateScriptWithAI(
  input: ScriptGenerateInput
): Promise<ScriptGenerateResult> {
  if (input.provider === 'mock') {
    return {
      content: [
        `[00:00 - 00:05] HOOK`,
        `Visual: Tight macro shot of ${input.brandName || 'the flagship product'} under warm studio rim lighting.`,
        `Voiceover: Still settling for ordinary workflows? Meet ${input.brandName || input.title} — engineered for ${input.targetAudience || 'modern creators'}.`,
        ``,
        `[00:05 - 00:15] PROBLEM & REVEAL`,
        `Visual: Fast dynamic transition into real-world usage on ${input.platform}.`,
        `Voiceover: Every second counts when launching a campaign. Designed with a ${input.toneOfVoice.toLowerCase()} edge, it turns complex production into effortless flow.`,
        ``,
        `[00:15 - 00:${String(input.targetDurationSec).padStart(2, '0')}] PROOF & CALL TO ACTION`,
        `Visual: Clean product lockup with subtle amber light sweep and brand wordmark.`,
        `Voiceover: Built to achieve ${input.marketingObjective}. Start creating today with ${input.brandName || input.title}.`,
      ].join('\n'),
      aiModelUsed: 'mock-script-provider',
      aiNotes: 'Generated locally via Mock Script Provider for offline/deterministic testing.',
      groundingSources: [],
    };
  }

  const ai = getAiClient();
  const model = 'gemini-4-hydrogen';

  const prompt = [
    `Write a high-converting ${input.targetDurationSec}-second marketing video script in ${input.language}.`,
    `Title: ${input.title}`,
    `Brand / Product: ${input.brandName || 'N/A'}`,
    `Target Audience: ${input.targetAudience || 'General creators and buyers'}`,
    `Target Platform: ${input.platform}`,
    `Tone of Voice: ${input.toneOfVoice}`,
    `Marketing Objective: ${input.marketingObjective}`,
    input.brief ? `Creative Brief / Key Points: ${input.brief}` : '',
    `Format cleanly with timestamped beats (e.g. [00:00 - 00:05] HOOK), clear Visual cues, and crisp Voiceover narration tailored to ${input.platform}.`,
  ]
    .filter(Boolean)
    .join('\n');

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction:
        'You are an award-winning commercial video director and marketing copywriter. Deliver clean, production-ready scripts without filler commentary.',
      ...(input.useSearchGrounding ? { tools: [{ googleSearch: {} }] } : {}),
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

  return {
    content: (response.text ?? '').trim(),
    aiModelUsed: input.useSearchGrounding ? `${model}+googleSearch` : model,
    aiNotes: input.useSearchGrounding
      ? `Generated with ${model} and live Google Search Grounding (${groundingSources.length} web sources).`
      : `Generated with ${model}.`,
    groundingSources,
  };
}

export interface ScriptReviseInput {
  currentContent: string;
  action: 'rewrite' | 'grammar' | 'tone' | 'expand' | 'shorten' | 'alternative';
  targetTone?: string;
  instructions?: string;
  platform: string;
  language: string;
  provider?: 'gemini' | 'mock';
}

export async function reviseScriptWithAI(
  input: ScriptReviseInput
): Promise<ScriptGenerateResult> {
  if (input.provider === 'mock') {
    return {
      content: `${input.currentContent}\n\n[MOCK REVISION: ${input.action.toUpperCase()}] Refined for ${input.platform} (${input.targetTone || 'default tone'}).`,
      aiModelUsed: 'mock-script-provider',
      aiNotes: `Mock revision (${input.action}) applied locally.`,
      groundingSources: [],
    };
  }

  const ai = getAiClient();
  const isFast = input.action === 'grammar' || input.action === 'shorten';
  const model = isFast ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen';

  const actionInstructions: Record<string, string> = {
    rewrite: 'Completely rewrite the script for stronger narrative momentum and clearer hooks while keeping the core message.',
    grammar: 'Fix all grammar, punctuation, cadence, and phrasing issues while preserving structure and meaning.',
    tone: `Adapt the tone of voice to be ${input.targetTone || 'confident and modern'} while preserving key product facts.`,
    expand: 'Expand the script with richer visual direction, stronger sensory language, and an extra mid-roll proof beat.',
    shorten: 'Tighten and condense the script by ~30% for punchy, rapid-fire pacing without losing the CTA.',
    alternative: 'Create a bold alternative creative angle and opening hook for A/B testing on the same brief.',
  };

  const prompt = [
    actionInstructions[input.action] || actionInstructions.rewrite,
    `Platform: ${input.platform} | Language: ${input.language}`,
    input.instructions ? `Extra user direction: ${input.instructions}` : '',
    '',
    'Original Script:',
    input.currentContent,
  ]
    .filter(Boolean)
    .join('\n');

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction:
        'Return only the revised production script in clean timestamped format with Visual and Voiceover lines. Do not wrap in markdown fences.',
    },
  });

  return {
    content: (response.text ?? '').trim(),
    aiModelUsed: model,
    aiNotes: `AI revision (${input.action}) completed using ${model}.`,
    groundingSources: [],
  };
}

export interface ExtractedScene {
  title: string;
  narration: string;
  visualDescription: string;
  imagePrompt: string;
  videoPrompt: string;
  durationSec: number;
  transition: 'fade' | 'dissolve' | 'wipeleft' | 'none';
  mediaPreference: 'image' | 'video';
}

export async function extractScenesWithAI(
  scriptContent: string,
  aspectRatio: string,
  platform: string,
  provider: 'gemini' | 'mock' = 'gemini'
): Promise<{ scenes: ExtractedScene[]; modelUsed: string }> {
  if (provider === 'mock') {
    const paragraphs = scriptContent
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    const chunks = paragraphs.length >= 2 ? paragraphs.slice(0, 6) : [scriptContent];
    const scenes: ExtractedScene[] = chunks.map((block, idx) => ({
      title: `Scene ${idx + 1}: ${idx === 0 ? 'Opening Hook' : idx === chunks.length - 1 ? 'Closing CTA' : `Story Beat ${idx}`}`,
      narration: block.replace(/\[.*?\]/g, '').trim().slice(0, 260),
      visualDescription: `Cinematic ${aspectRatio} frame tailored for ${platform}, balanced studio lighting.`,
      imagePrompt: `High-contrast commercial photography frame, ${aspectRatio} composition, dramatic studio lighting: ${block.slice(0, 140)}`,
      videoPrompt: `Smooth slow push-in camera motion, crisp commercial cinematography: ${block.slice(0, 140)}`,
      durationSec: 5,
      transition: idx === 0 ? 'fade' : 'dissolve',
      mediaPreference: idx % 2 === 0 ? 'image' : 'video',
    }));
    return { scenes, modelUsed: 'mock-scene-extractor' };
  }

  const ai = getAiClient();
  // Use gemini-4-carbon with ThinkingLevel.HIGH and NO maxOutputTokens for deep script-to-scene breakdown
  const model = 'gemini-4-carbon';

  const response = await ai.models.generateContent({
    model,
    contents: [
      `Analyze the following marketing video script and split it into 3 to 6 cohesive, production-ready scenes for ${platform} (${aspectRatio}).`,
      `For each scene, craft:`,
      `- concise title`,
      `- spoken narration`,
      `- visualDescription for the director`,
      `- detailed imagePrompt optimized for AI image generation`,
      `- dynamic motion videoPrompt optimized for AI video generation`,
      `- durationSec (integer 3 to 10 seconds)`,
      `- transition ('fade', 'dissolve', 'wipeleft', or 'none')`,
      `- mediaPreference ('image' or 'video')`,
      '',
      'Script:',
      scriptContent,
    ].join('\n'),
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
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

  const parsed = JSON.parse((response.text ?? '[]').trim()) as Array<Partial<ExtractedScene>>;
  const validTransitions = new Set(['fade', 'dissolve', 'wipeleft', 'none']);

  const scenes: ExtractedScene[] = parsed.map((item, idx) => ({
    title: item.title || `Scene ${idx + 1}`,
    narration: item.narration || '',
    visualDescription: item.visualDescription || '',
    imagePrompt: item.imagePrompt || item.visualDescription || '',
    videoPrompt: item.videoPrompt || item.visualDescription || '',
    durationSec: Math.min(15, Math.max(3, Number(item.durationSec) || 5)),
    transition: validTransitions.has(String(item.transition))
      ? (item.transition as ExtractedScene['transition'])
      : 'fade',
    mediaPreference: item.mediaPreference === 'video' ? 'video' : 'image',
  }));

  return { scenes, modelUsed: model };
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
