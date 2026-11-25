import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import multer from 'multer';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import {
  assets,
  generationActions,
  generationAttempts,
  generationJobs,
  projects,
  scenes,
} from '../../db/schema.ts';
import { AuthRequest, requireAuth } from '../../middleware/auth.ts';
import { AIProviderError } from '../ai/exceptions.ts';
import { queueSceneImageGeneration } from '../ai/services/imageGenerationService.ts';
import { queueSceneVideoGeneration } from '../ai/services/videoGenerationService.ts';
import { analyzeMediaWithNeon } from '../providers/scriptService.ts';
import { createSignedMediaUrl } from '../storage.ts';
import {
  cancelGenerationJob,
  enqueueMediaGenerationJob,
  retryGenerationJob,
} from '../workers/jobWorker.ts';

export const generationRouter = Router();
generationRouter.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

async function getOwnedScene(sceneId: string, userId: string) {
  const sceneRows = await db.select().from(scenes).where(eq(scenes.id, sceneId)).limit(1);
  const scene = sceneRows[0];
  if (!scene) return null;
  const projRows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, scene.projectId), eq(projects.userId, userId)))
    .limit(1);
  if (!projRows[0]) return null;
  return { scene, project: projRows[0] };
}

const imageGenSchema = z.object({
  provider: z.enum(['gemini', 'openai', 'mock']).optional(),
  model: z.string().optional(),
  prompt: z.string().trim().min(1).max(2000),
  aspectRatio: z.enum(['16:9', '9:16', '1:1', '4:3', '3:4']).optional().default('16:9'),
  resolution: z.enum(['1K', '2K', '4K']).optional().default('1K'),
  style: z.string().trim().max(200).optional(),
  useSearchGrounding: z.boolean().optional().default(false),
  referenceAssetId: z.string().uuid().optional(),
  referenceImageBase64: z.string().optional(),
  referenceImageMimeType: z.string().optional(),
  idempotencyKey: z.string().trim().max(128).optional(),
});

generationRouter.post('/scenes/:sceneId/generate-image', async (req: AuthRequest, res) => {
  const parsed = imageGenSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Invalid image generation request.' });
  }

  try {
    const owned = await getOwnedScene(req.params.sceneId, req.dbUser!.id);
    if (!owned) return res.status(404).json({ success: false, message: 'Scene not found.' });

    const result = await queueSceneImageGeneration({
      projectId: owned.project.id,
      sceneId: owned.scene.id,
      userId: req.dbUser!.id,
      ...parsed.data,
    });

    res.status(202).json({
      success: true,
      message: result.isDuplicate ? 'Existing generation job returned' : 'Image generation job created',
      data: {
        job_id: result.job.id,
        action_id: result.action.id,
        provider: result.action.provider,
        status: result.job.status,
        progress: result.job.progress,
        status_url: `/api/v1/jobs/${result.job.id}`,
      },
    });
  } catch (error: unknown) {
    console.error('Enqueue image generation error:', error);
    if (error instanceof AIProviderError) {
      return res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
    }
    const msg = error instanceof Error ? error.message : 'Failed to queue image generation.';
    res.status(400).json({ success: false, message: msg });
  }
});

const videoGenSchema = z.object({
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

generationRouter.post('/scenes/:sceneId/generate-video', async (req: AuthRequest, res) => {
  const parsed = videoGenSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Invalid video generation request.' });
  }

  try {
    const owned = await getOwnedScene(req.params.sceneId, req.dbUser!.id);
    if (!owned) return res.status(404).json({ success: false, message: 'Scene not found.' });

    const result = await queueSceneVideoGeneration({
      projectId: owned.project.id,
      sceneId: owned.scene.id,
      userId: req.dbUser!.id,
      ...parsed.data,
    });

    res.status(202).json({
      success: true,
      message: result.isDuplicate ? 'Existing generation job returned' : 'Video generation job created',
      data: {
        job_id: result.job.id,
        action_id: result.action.id,
        provider: result.action.provider,
        status: result.job.status,
        progress: result.job.progress,
        status_url: `/api/v1/jobs/${result.job.id}`,
      },
    });
  } catch (error: unknown) {
    console.error('Enqueue video generation error:', error);
    if (error instanceof AIProviderError) {
      return res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
    }
    const msg = error instanceof Error ? error.message : 'Failed to queue video generation.';
    res.status(400).json({ success: false, message: msg });
  }
});

const ttsSchema = z.object({
  provider: z.enum(['gemini', 'mock']).optional().default('gemini'),
  prompt: z.string().trim().min(1).max(3000),
  voiceName: z.enum(['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr']).optional().default('Kore'),
  voiceStyle: z.string().trim().max(200).optional().default('Clear, warm commercial narrator'),
  secondSpeakerText: z.string().trim().max(2000).optional(),
  secondSpeakerVoice: z.enum(['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr']).optional().default('Puck'),
});

generationRouter.post('/scenes/:sceneId/generate-tts', async (req: AuthRequest, res) => {
  const parsed = ttsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Invalid TTS payload.' });
  }

  try {
    const owned = await getOwnedScene(req.params.sceneId, req.dbUser!.id);
    if (!owned) return res.status(404).json({ success: false, message: 'Scene not found.' });

    const result = await enqueueMediaGenerationJob({
      projectId: owned.project.id,
      sceneId: owned.scene.id,
      userId: req.dbUser!.id,
      request: {
        mediaType: 'audio_tts',
        provider: parsed.data.provider,
        model: parsed.data.provider === 'mock' ? 'mock-tts-v1' : 'gemini-3.8-flash-tts',
        prompt: parsed.data.prompt,
        voiceName: parsed.data.voiceName,
        voiceStyle: parsed.data.voiceStyle,
        secondSpeakerText: parsed.data.secondSpeakerText,
        secondSpeakerVoice: parsed.data.secondSpeakerVoice,
      },
    });

    res.status(202).json({
      success: true,
      message: 'Voiceover generation job created',
      data: {
        job_id: result.job.id,
        action_id: result.action.id,
        status: result.job.status,
        progress: result.job.progress,
        status_url: `/api/v1/jobs/${result.job.id}`,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to queue TTS.';
    res.status(400).json({ success: false, message: msg });
  }
});

const musicSchema = z.object({
  provider: z.enum(['gemini', 'mock']).optional().default('gemini'),
  model: z.enum(['lyria-3-clip-preview', 'lyria-3-pro-preview']).optional().default('lyria-3-clip-preview'),
  prompt: z.string().trim().min(1).max(1500),
  referenceImageBase64: z.string().optional(),
  referenceImageMimeType: z.string().optional(),
});

generationRouter.post('/projects/:projectId/generate-music', async (req: AuthRequest, res) => {
  const parsed = musicSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Invalid music generation request.' });
  }

  try {
    const projRows = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, req.params.projectId), eq(projects.userId, req.dbUser!.id)))
      .limit(1);
    if (!projRows[0]) return res.status(404).json({ success: false, message: 'Project not found.' });

    const result = await enqueueMediaGenerationJob({
      projectId: projRows[0].id,
      sceneId: null,
      userId: req.dbUser!.id,
      request: {
        mediaType: 'audio_music',
        provider: parsed.data.provider,
        model: parsed.data.provider === 'mock' ? 'mock-music-v1' : parsed.data.model,
        prompt: parsed.data.prompt,
        referenceImageBase64: parsed.data.referenceImageBase64,
        referenceImageMimeType: parsed.data.referenceImageMimeType,
      },
    });

    res.status(202).json({
      success: true,
      message: 'Music generation job created',
      data: {
        job_id: result.job.id,
        action_id: result.action.id,
        status: result.job.status,
        progress: result.job.progress,
        status_url: `/api/v1/jobs/${result.job.id}`,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to queue music generation.';
    res.status(400).json({ success: false, message: msg });
  }
});

// Deliberate regeneration creates a brand-new action_id
generationRouter.post('/scenes/:sceneId/regenerate', async (req: AuthRequest, res) => {
  try {
    const owned = await getOwnedScene(req.params.sceneId, req.dbUser!.id);
    if (!owned) return res.status(404).json({ success: false, message: 'Scene not found.' });

    const mediaType =
      req.body?.mediaType === 'video'
        ? 'video'
        : req.body?.mediaType === 'image'
          ? 'image'
          : owned.scene.mediaPreference === 'video'
            ? 'video'
            : 'image';

    const provider =
      req.body?.provider === 'mock' || req.body?.provider === 'openai' || req.body?.provider === 'gemini'
        ? req.body.provider
        : undefined;

    const prompt =
      mediaType === 'video'
        ? req.body?.prompt || owned.scene.videoPrompt || owned.scene.visualDescription || owned.scene.title
        : req.body?.prompt || owned.scene.imagePrompt || owned.scene.visualDescription || owned.scene.title;

    const result =
      mediaType === 'video'
        ? await queueSceneVideoGeneration({
            projectId: owned.project.id,
            sceneId: owned.scene.id,
            userId: req.dbUser!.id,
            provider,
            prompt,
            aspectRatio: owned.project.aspectRatio === '9:16' ? '9:16' : '16:9',
            durationSec: owned.scene.durationSec,
          })
        : await queueSceneImageGeneration({
            projectId: owned.project.id,
            sceneId: owned.scene.id,
            userId: req.dbUser!.id,
            provider,
            prompt,
            aspectRatio:
              owned.project.aspectRatio === '9:16'
                ? '9:16'
                : owned.project.aspectRatio === '1:1'
                  ? '1:1'
                  : '16:9',
          });

    res.status(202).json({
      success: true,
      message: 'Regeneration job created with new action ID',
      data: {
        job_id: result.job.id,
        action_id: result.action.id,
        provider: result.action.provider,
        status: result.job.status,
        progress: result.job.progress,
        status_url: `/api/v1/jobs/${result.job.id}`,
      },
    });
  } catch (error: unknown) {
    if (error instanceof AIProviderError) {
      return res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
    }
    const msg = error instanceof Error ? error.message : 'Regeneration failed.';
    res.status(400).json({ success: false, message: msg });
  }
});

generationRouter.get('/jobs/:jobId', async (req: AuthRequest, res) => {
  try {
    const jobRows = await db
      .select()
      .from(generationJobs)
      .where(and(eq(generationJobs.id, req.params.jobId), eq(generationJobs.userId, req.dbUser!.id)))
      .limit(1);
    const job = jobRows[0];
    if (!job) return res.status(404).json({ success: false, message: 'Job not found.' });

    const attempts = await db
      .select()
      .from(generationAttempts)
      .where(eq(generationAttempts.jobId, job.id))
      .orderBy(desc(generationAttempts.attemptNumber));

    let asset = null;
    if (job.resultAssetId) {
      const aRows = await db.select().from(assets).where(eq(assets.id, job.resultAssetId)).limit(1);
      if (aRows[0]) {
        asset = {
          ...aRows[0],
          signedUrl: createSignedMediaUrl(aRows[0].storageKey),
          downloadUrl: `${createSignedMediaUrl(aRows[0].storageKey)}&download=1`,
        };
      }
    }

    res.json({
      success: true,
      data: {
        ...job,
        attempts,
        asset,
      },
    });
  } catch (error) {
    console.error('Get job error:', error);
    res.status(500).json({ success: false, message: 'Failed to inspect job.' });
  }
});

generationRouter.get('/projects/:projectId/jobs', async (req: AuthRequest, res) => {
  try {
    const jobs = await db
      .select({
        id: generationJobs.id,
        actionId: generationJobs.actionId,
        sceneId: generationJobs.sceneId,
        status: generationJobs.status,
        progress: generationJobs.progress,
        providerJobId: generationJobs.providerJobId,
        attemptCount: generationJobs.attemptCount,
        errorMessage: generationJobs.errorMessage,
        resultAssetId: generationJobs.resultAssetId,
        startedAt: generationJobs.startedAt,
        createdAt: generationJobs.createdAt,
        completedAt: generationJobs.completedAt,
        mediaType: generationActions.mediaType,
        provider: generationActions.provider,
        model: generationActions.model,
        actionStatus: generationActions.status,
      })
      .from(generationJobs)
      .innerJoin(generationActions, eq(generationJobs.actionId, generationActions.id))
      .where(
        and(
          eq(generationJobs.projectId, req.params.projectId),
          eq(generationJobs.userId, req.dbUser!.id)
        )
      )
      .orderBy(desc(generationJobs.createdAt))
      .limit(50);

    res.json({ success: true, data: jobs });
  } catch (error) {
    console.error('List project jobs error:', error);
    res.status(500).json({ success: false, message: 'Failed to load jobs.' });
  }
});

// Retry reuses original action_id without double charging
generationRouter.post('/jobs/:jobId/retry', async (req: AuthRequest, res) => {
  try {
    const prep = await retryGenerationJob(req.params.jobId, req.dbUser!.id);
    res.status(202).json({
      success: true,
      message: `Retrying job using original action ${prep.action.id} (no duplicate charge)`,
      data: {
        job_id: prep.job.id,
        action_id: prep.action.id,
        attempt_number: prep.attempt.attemptNumber,
        status: prep.job.status,
        progress: prep.job.progress,
        status_url: `/api/v1/jobs/${prep.job.id}`,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Retry failed.';
    res.status(400).json({ success: false, message: msg });
  }
});

generationRouter.post('/jobs/:jobId/cancel', async (req: AuthRequest, res) => {
  try {
    const updated = await cancelGenerationJob(req.params.jobId, req.dbUser!.id);
    res.json({
      success: true,
      message: 'Generation job cancelled',
      data: updated,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Cancel failed.';
    res.status(400).json({ success: false, message: msg });
  }
});

// Multimodal Image & Video Analysis via Gemini 4 Neon
generationRouter.post('/analyze/image', upload.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload an image file.' });
    }
    if (!req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ success: false, message: 'File must be an image.' });
    }
    const question = typeof req.body?.question === 'string' ? req.body.question : undefined;
    const result = await analyzeMediaWithNeon(req.file.buffer, req.file.mimetype, 'image', question);
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    console.error('Image analysis error:', error);
    const msg = error instanceof Error ? error.message : 'Image analysis failed.';
    res.status(502).json({ success: false, message: msg });
  }
});

generationRouter.post('/analyze/video', upload.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload a video file.' });
    }
    if (!req.file.mimetype.startsWith('video/')) {
      return res.status(400).json({ success: false, message: 'File must be a video.' });
    }
    const question = typeof req.body?.question === 'string' ? req.body.question : undefined;
    const result = await analyzeMediaWithNeon(req.file.buffer, req.file.mimetype, 'video', question);
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    console.error('Video analysis error:', error);
    const msg = error instanceof Error ? error.message : 'Video analysis failed.';
    res.status(502).json({ success: false, message: msg });
  }
});
