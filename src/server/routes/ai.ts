import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import {
  assets,
  generationAttempts,
  generationJobs,
  projects,
  scenes,
  scriptRevisions,
} from '../../db/schema.ts';
import { AuthRequest, requireAuth } from '../../middleware/auth.ts';
import { AIProviderError } from '../ai/exceptions.ts';
import { getProviderOverview } from '../ai/factory.ts';
import {
  imageGenerateSchema,
  scriptGenerateRequestSchema,
  scriptImproveRequestSchema,
  videoGenerateSchema,
} from '../ai/schemas.ts';
import { queueSceneImageGeneration } from '../ai/services/imageGenerationService.ts';
import { extractAndSaveScenes } from '../ai/services/sceneExtractionService.ts';
import { generateAndSaveScriptRevision } from '../ai/services/scriptGenerationService.ts';
import { improveAndSaveScriptRevision } from '../ai/services/scriptImprovementService.ts';
import { queueSceneVideoGeneration } from '../ai/services/videoGenerationService.ts';
import { createSignedMediaUrl } from '../storage.ts';
import {
  acceptAssetForScene,
  cancelGenerationJob,
  rejectAssetForScene,
  retryGenerationJob,
} from '../workers/jobWorker.ts';

export const aiRouter = Router();
aiRouter.use(requireAuth);

async function ensureOwnedProject(projectId: string, userId: string) {
  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);
  return rows[0] || null;
}

async function ensureOwnedScene(sceneId: string, userId: string) {
  const sceneRows = await db.select().from(scenes).where(eq(scenes.id, sceneId)).limit(1);
  const scene = sceneRows[0];
  if (!scene) return null;
  const project = await ensureOwnedProject(scene.projectId, userId);
  if (!project) return null;
  return { scene, project };
}

function sendAIError(res: import('express').Response, err: unknown, fallbackMessage: string) {
  if (err instanceof AIProviderError) {
    return res.status(err.statusCode).json({
      success: false,
      code: err.code,
      provider: err.provider,
      retryable: err.retryable,
      message: err.message,
    });
  }
  const msg = err instanceof Error ? err.message : fallbackMessage;
  const lower = msg.toLowerCase();
  const status = lower.includes('not found') ? 404 : lower.includes('forbidden') ? 403 : 400;
  return res.status(status).json({ success: false, message: msg });
}

aiRouter.get('/ai/providers', (_req: AuthRequest, res) => {
  res.json({ success: true, data: getProviderOverview() });
});

const aiGenerateScriptBodySchema = scriptGenerateRequestSchema.extend({
  projectId: z.string().uuid(),
});

aiRouter.post('/ai/scripts/generate', async (req: AuthRequest, res) => {
  const parsed = aiGenerateScriptBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: parsed.error.issues[0]?.message || 'Invalid script generation payload.',
    });
  }

  try {
    const project = await ensureOwnedProject(parsed.data.projectId, req.dbUser!.id);
    if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });

    const result = await generateAndSaveScriptRevision({
      projectId: project.id,
      userUid: req.dbUser!.uid,
      topic: parsed.data.topic,
      title: parsed.data.title,
      description: parsed.data.description,
      brandName: parsed.data.brandName,
      targetAudience: parsed.data.targetAudience,
      platform: parsed.data.platform,
      contentType: parsed.data.contentType,
      targetDurationSec: parsed.data.targetDurationSec,
      language: parsed.data.language,
      toneOfVoice: parsed.data.toneOfVoice,
      marketingObjective: parsed.data.marketingObjective,
      brief: parsed.data.brief,
      useSearchGrounding: parsed.data.useSearchGrounding,
      provider: parsed.data.provider,
    });

    res.status(201).json({
      success: true,
      message: `Generated script revision v${result.revision.versionNumber} (${result.provider}${result.isMock ? ' - mock mode' : ''})`,
      data: result.revision,
      meta: {
        provider: result.provider,
        isMock: result.isMock,
        usage: result.usage,
        sections: result.sections,
      },
    });
  } catch (err) {
    return sendAIError(res, err, 'Script generation failed.');
  }
});

aiRouter.post('/ai/scripts/:scriptId/improve', async (req: AuthRequest, res) => {
  const parsed = scriptImproveRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: parsed.error.issues[0]?.message || 'Invalid script improvement payload.',
    });
  }

  try {
    const revRows = await db
      .select()
      .from(scriptRevisions)
      .where(eq(scriptRevisions.id, req.params.scriptId))
      .limit(1);
    const baseRev = revRows[0];
    if (!baseRev) return res.status(404).json({ success: false, message: 'Script revision not found.' });

    const project = await ensureOwnedProject(baseRev.projectId, req.dbUser!.id);
    if (!project) return res.status(403).json({ success: false, message: 'Forbidden.' });

    const result = await improveAndSaveScriptRevision({
      projectId: project.id,
      userUid: req.dbUser!.uid,
      baseRevision: baseRev,
      ...parsed.data,
    });

    res.status(201).json({
      success: true,
      message: `Saved improved script as revision v${result.revision.versionNumber} (original v${baseRev.versionNumber} preserved)`,
      data: result.revision,
      meta: {
        provider: result.provider,
        isMock: result.isMock,
        usage: result.usage,
        preservedRevisionId: baseRev.id,
      },
    });
  } catch (err) {
    return sendAIError(res, err, 'Script improvement failed.');
  }
});

aiRouter.get('/ai/scripts/:scriptId/revisions', async (req: AuthRequest, res) => {
  try {
    const revRows = await db
      .select()
      .from(scriptRevisions)
      .where(eq(scriptRevisions.id, req.params.scriptId))
      .limit(1);
    const target = revRows[0];
    if (!target) return res.status(404).json({ success: false, message: 'Script not found.' });

    const project = await ensureOwnedProject(target.projectId, req.dbUser!.id);
    if (!project) return res.status(403).json({ success: false, message: 'Forbidden.' });

    const revisions = await db
      .select()
      .from(scriptRevisions)
      .where(eq(scriptRevisions.projectId, target.projectId))
      .orderBy(desc(scriptRevisions.versionNumber));

    res.json({ success: true, data: revisions });
  } catch (err) {
    console.error('AI revisions fetch error:', err);
    res.status(500).json({ success: false, message: 'Failed to load script revisions.' });
  }
});

const aiExtractScenesSchema = z.object({
  projectId: z.string().uuid(),
  scriptRevisionId: z.string().uuid().optional(),
  content: z.string().trim().min(1).optional(),
  replaceExisting: z.boolean().optional().default(true),
  provider: z.enum(['gemini', 'openai', 'mock']).optional(),
});

aiRouter.post('/ai/scenes/extract', async (req: AuthRequest, res) => {
  const parsed = aiExtractScenesSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Invalid scene extraction payload.' });
  }

  try {
    const project = await ensureOwnedProject(parsed.data.projectId, req.dbUser!.id);
    if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });

    let content = parsed.data.content?.trim() || '';
    const revId = parsed.data.scriptRevisionId || project.activeScriptRevisionId;
    if (!content && revId) {
      const revRows = await db
        .select()
        .from(scriptRevisions)
        .where(and(eq(scriptRevisions.id, revId), eq(scriptRevisions.projectId, project.id)))
        .limit(1);
      content = revRows[0]?.content || '';
    }
    if (!content) {
      return res.status(400).json({
        success: false,
        message: 'Script content or valid scriptRevisionId is required for scene extraction.',
      });
    }

    const result = await extractAndSaveScenes({
      projectId: project.id,
      aspectRatio: project.aspectRatio,
      platform: project.platform,
      activeScriptRevisionId: project.activeScriptRevisionId,
      scriptRevisionId: parsed.data.scriptRevisionId,
      content,
      replaceExisting: parsed.data.replaceExisting,
      provider: parsed.data.provider,
    });

    res.status(201).json({
      success: true,
      message: `Extracted ${result.scenes.length} structured scenes using ${result.modelUsed}`,
      data: result.scenes,
      meta: {
        provider: result.provider,
        modelUsed: result.modelUsed,
        isMock: result.isMock,
        usage: result.usage,
      },
    });
  } catch (err) {
    return sendAIError(res, err, 'Scene extraction failed.');
  }
});

const patchSceneSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    narration: z.string(),
    visualDescription: z.string(),
    imagePrompt: z.string(),
    videoPrompt: z.string(),
    durationSec: z.number().int().min(1).max(60),
    transition: z.enum(['fade', 'dissolve', 'wipeleft', 'none']),
    mediaPreference: z.enum(['image', 'video']),
    selectedAssetId: z.string().uuid().nullable(),
    voiceoverAssetId: z.string().uuid().nullable(),
  })
  .partial();

aiRouter.patch('/ai/scenes/:sceneId', async (req: AuthRequest, res) => {
  const parsed = patchSceneSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Invalid scene update payload.' });
  }

  try {
    const owned = await ensureOwnedScene(req.params.sceneId, req.dbUser!.id);
    if (!owned) return res.status(404).json({ success: false, message: 'Scene not found.' });

    const [updated] = await db
      .update(scenes)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(scenes.id, owned.scene.id))
      .returning();

    res.json({ success: true, message: 'Scene updated', data: updated });
  } catch (err) {
    console.error('AI patch scene error:', err);
    res.status(500).json({ success: false, message: 'Failed to update scene.' });
  }
});

aiRouter.post('/ai/images/generate', async (req: AuthRequest, res) => {
  const parsed = imageGenerateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: parsed.error.issues[0]?.message || 'Invalid image generation payload.',
    });
  }

  try {
    const owned = await ensureOwnedScene(parsed.data.sceneId, req.dbUser!.id);
    if (!owned) return res.status(404).json({ success: false, message: 'Scene not found.' });

    const result = await queueSceneImageGeneration({
      projectId: owned.project.id,
      sceneId: owned.scene.id,
      userId: req.dbUser!.id,
      provider: parsed.data.provider,
      model: parsed.data.model,
      prompt: parsed.data.prompt,
      aspectRatio: parsed.data.aspectRatio,
      resolution: parsed.data.resolution,
      style: parsed.data.style,
      useSearchGrounding: parsed.data.useSearchGrounding,
      referenceAssetId: parsed.data.referenceAssetId,
      referenceImageBase64: parsed.data.referenceImageBase64,
      referenceImageMimeType: parsed.data.referenceImageMimeType,
      idempotencyKey: parsed.data.idempotencyKey,
    });

    res.status(202).json({
      success: true,
      message: result.isDuplicate
        ? 'Existing image generation job returned'
        : `Image generation queued (${result.action.provider})`,
      data: {
        job_id: result.job.id,
        action_id: result.action.id,
        provider: result.action.provider,
        model: result.action.model,
        status: result.job.status,
        progress: result.job.progress,
        status_url: `/api/v1/ai/images/jobs/${result.job.id}`,
      },
    });
  } catch (err) {
    return sendAIError(res, err, 'Failed to queue image generation.');
  }
});

aiRouter.post('/ai/videos/generate', async (req: AuthRequest, res) => {
  const parsed = videoGenerateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: parsed.error.issues[0]?.message || 'Invalid video generation payload.',
    });
  }

  try {
    const owned = await ensureOwnedScene(parsed.data.sceneId, req.dbUser!.id);
    if (!owned) return res.status(404).json({ success: false, message: 'Scene not found.' });

    const result = await queueSceneVideoGeneration({
      projectId: owned.project.id,
      sceneId: owned.scene.id,
      userId: req.dbUser!.id,
      provider: parsed.data.provider,
      prompt: parsed.data.prompt,
      aspectRatio: parsed.data.aspectRatio,
      resolution: parsed.data.resolution,
      style: parsed.data.style,
      durationSec: parsed.data.durationSec,
      referenceAssetId: parsed.data.referenceAssetId,
      referenceImageBase64: parsed.data.referenceImageBase64,
      referenceImageMimeType: parsed.data.referenceImageMimeType,
      idempotencyKey: parsed.data.idempotencyKey,
    });

    res.status(202).json({
      success: true,
      message: result.isDuplicate
        ? 'Existing video generation job returned'
        : `Video generation queued (${result.action.provider})`,
      data: {
        job_id: result.job.id,
        action_id: result.action.id,
        provider: result.action.provider,
        model: result.action.model,
        status: result.job.status,
        progress: result.job.progress,
        status_url: `/api/v1/ai/videos/jobs/${result.job.id}`,
      },
    });
  } catch (err) {
    return sendAIError(res, err, 'Failed to queue video generation.');
  }
});

async function handleGetJobStatus(req: AuthRequest, res: import('express').Response) {
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
  } catch (err) {
    console.error('AI get job error:', err);
    res.status(500).json({ success: false, message: 'Failed to load job status.' });
  }
}

aiRouter.get('/ai/images/jobs/:jobId', handleGetJobStatus);
aiRouter.get('/ai/videos/jobs/:jobId', handleGetJobStatus);
aiRouter.get('/ai/jobs/:jobId', handleGetJobStatus);

aiRouter.post('/ai/jobs/:jobId/retry', async (req: AuthRequest, res) => {
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
        status_url: `/api/v1/ai/jobs/${prep.job.id}`,
      },
    });
  } catch (err) {
    return sendAIError(res, err, 'Failed to retry job.');
  }
});

aiRouter.post('/ai/jobs/:jobId/cancel', async (req: AuthRequest, res) => {
  try {
    const updated = await cancelGenerationJob(req.params.jobId, req.dbUser!.id);
    res.json({
      success: true,
      message: 'Generation job cancelled',
      data: updated,
    });
  } catch (err) {
    return sendAIError(res, err, 'Failed to cancel job.');
  }
});

aiRouter.post('/ai/assets/:assetId/accept', async (req: AuthRequest, res) => {
  try {
    const sceneId = typeof req.body?.sceneId === 'string' ? req.body.sceneId : undefined;
    const updated = await acceptAssetForScene(req.params.assetId, req.dbUser!.id, sceneId);
    res.json({
      success: true,
      message: 'Asset accepted for scene',
      data: {
        ...updated,
        signedUrl: createSignedMediaUrl(updated.storageKey),
        downloadUrl: `${createSignedMediaUrl(updated.storageKey)}&download=1`,
      },
    });
  } catch (err) {
    return sendAIError(res, err, 'Failed to accept asset.');
  }
});

aiRouter.post('/ai/assets/:assetId/reject', async (req: AuthRequest, res) => {
  try {
    const result = await rejectAssetForScene(req.params.assetId, req.dbUser!.id);
    res.json({
      success: true,
      message: result.fallbackAssetId
        ? 'Asset rejected; reverted scene to previous accepted asset'
        : 'Asset rejected',
      data: {
        ...result.asset,
        fallbackAssetId: result.fallbackAssetId,
      },
    });
  } catch (err) {
    return sendAIError(res, err, 'Failed to reject asset.');
  }
});
