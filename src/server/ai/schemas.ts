import { z } from 'zod';

export const contentTypeSchema = z
  .enum(['YouTube', 'advertisement', 'educational', 'promotional', 'social_media'])
  .default('YouTube');

export const scriptGenerateRequestSchema = z.object({
  topic: z.string().trim().max(300).optional().default(''),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().default(''),
  brandName: z.string().trim().max(120).optional().default(''),
  targetAudience: z.string().trim().max(240).optional().default(''),
  platform: z.string().trim().max(60).optional().default('YouTube'),
  contentType: contentTypeSchema.optional().default('YouTube'),
  targetDurationSec: z.number().int().min(5).max(600).optional().default(30),
  language: z.string().trim().max(60).optional().default('English'),
  toneOfVoice: z.string().trim().max(80).optional().default('Energetic'),
  marketingObjective: z.string().trim().max(120).optional().default('Brand Awareness'),
  brief: z.string().trim().max(2000).optional(),
  useSearchGrounding: z.boolean().optional().default(false),
  provider: z.enum(['gemini', 'openai', 'mock']).optional(),
});

export const structuredScriptOutputSchema = z.object({
  introduction: z.string().min(1),
  mainContent: z.string().min(1),
  conclusion: z.string().min(1),
  fullScript: z.string().min(1),
});

export const scriptImproveActionSchema = z.enum([
  'rewrite',
  'grammar',
  'clarity',
  'engaging',
  'tone',
  'expand',
  'shorten',
  'alternative',
]);

export const scriptImproveRequestSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  brandName: z.string().trim().max(120).optional(),
  targetAudience: z.string().trim().max(240).optional(),
  platform: z.string().trim().max(60).optional(),
  targetDurationSec: z.number().int().min(5).max(600).optional(),
  language: z.string().trim().max(60).optional(),
  toneOfVoice: z.string().trim().max(80).optional(),
  marketingObjective: z.string().trim().max(120).optional(),
  currentContent: z.string().trim().min(1).optional(),
  action: scriptImproveActionSchema,
  targetTone: z.string().trim().max(80).optional(),
  instructions: z.string().trim().max(600).optional(),
  provider: z.enum(['gemini', 'openai', 'mock']).optional(),
});

export const extractedSceneItemSchema = z.object({
  sceneNumber: z.number().int().min(1).optional(),
  title: z.string().trim().min(1).max(160),
  narration: z.string().default(''),
  visualDescription: z.string().default(''),
  imagePrompt: z.string().default(''),
  videoPrompt: z.string().default(''),
  durationSec: z.number().int().min(2).max(30).default(5),
  transition: z.enum(['fade', 'dissolve', 'wipeleft', 'none']).default('fade'),
  mediaPreference: z.enum(['image', 'video']).default('image'),
});

export const extractedScenesArraySchema = z.array(extractedSceneItemSchema).min(1).max(12);

export const imageGenerateSchema = z.object({
  sceneId: z.string().uuid(),
  provider: z.enum(['gemini', 'openai', 'mock']).optional(),
  model: z.string().trim().max(100).optional(),
  prompt: z.string().trim().min(1).max(2000),
  aspectRatio: z.enum(['16:9', '9:16', '1:1']).optional().default('16:9'),
  resolution: z.enum(['1K', '2K', '4K']).optional().default('1K'),
  style: z.string().trim().max(200).optional(),
  useSearchGrounding: z.boolean().optional().default(false),
  referenceAssetId: z.string().uuid().optional(),
  referenceImageBase64: z.string().optional(),
  referenceImageMimeType: z.string().optional(),
  idempotencyKey: z.string().trim().max(128).optional(),
});

export const videoGenerateSchema = z.object({
  sceneId: z.string().uuid(),
  provider: z.enum(['gemini', 'openai', 'mock']).optional(),
  prompt: z.string().trim().min(1).max(2000),
  aspectRatio: z.enum(['16:9', '9:16']).optional().default('16:9'),
  resolution: z.enum(['360p', '720p', '1080p', '4k']).optional().default('720p'),
  style: z.string().trim().max(200).optional(),
  durationSec: z.number().int().min(3).max(15).optional().default(6),
  referenceAssetId: z.string().uuid().optional(),
  referenceImageBase64: z.string().optional(),
  referenceImageMimeType: z.string().optional(),
  idempotencyKey: z.string().trim().max(128).optional(),
});
