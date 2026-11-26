import { Router } from 'express';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import { projects, scriptRevisions } from '../../db/schema.ts';
import { AuthRequest, requireAuth } from '../../middleware/auth.ts';
import { AIProviderError } from '../ai/exceptions.ts';
import { extractAndSaveScenes } from '../ai/services/sceneExtractionService.ts';
import { generateAndSaveScriptRevision } from '../ai/services/scriptGenerationService.ts';
import { improveAndSaveScriptRevision } from '../ai/services/scriptImprovementService.ts';
import { logUserActivity } from '../services/activityService.ts';

export const scriptsRouter = Router();
scriptsRouter.use(requireAuth);

async function ensureProjectOwner(projectId: string, userId: string) {
  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);
  return rows[0] || null;
}

async function getNextVersionNumber(projectId: string): Promise<number> {
  const rows = await db
    .select({ maxVer: sql<number>`coalesce(max(${scriptRevisions.versionNumber}), 0)::int` })
    .from(scriptRevisions)
    .where(eq(scriptRevisions.projectId, projectId));
  return (rows[0]?.maxVer ?? 0) + 1;
}

const saveScriptSchema = z.object({
  title: z.string().trim().min(1).max(200),
  brandName: z.string().trim().max(120).optional().default(''),
  targetAudience: z.string().trim().max(240).optional().default(''),
  platform: z.string().trim().max(60).optional().default('YouTube'),
  targetDurationSec: z.number().int().min(5).max(600).optional().default(30),
  language: z.string().trim().max(60).optional().default('English'),
  toneOfVoice: z.string().trim().max(80).optional().default('Energetic'),
  marketingObjective: z.string().trim().max(120).optional().default('Brand Awareness'),
  topic: z.string().trim().max(300).optional().default(''),
  contentType: z
    .enum(['YouTube', 'advertisement', 'educational', 'promotional', 'social_media'])
    .optional()
    .default('YouTube'),
  content: z.string().trim().min(1),
  aiNotes: z.string().optional(),
});

scriptsRouter.post('/projects/:projectId/scripts', async (req: AuthRequest, res) => {
  const parsed = saveScriptSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Invalid script payload.' });
  }

  try {
    const project = await ensureProjectOwner(req.params.projectId, req.dbUser!.id);
    if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });

    const created = await db.transaction(async (tx) => {
      const nextVer = await getNextVersionNumber(project.id);
      const [rev] = await tx
        .insert(scriptRevisions)
        .values({
          projectId: project.id,
          versionNumber: nextVer,
          ...parsed.data,
          aiModelUsed: 'manual',
          aiNotes: parsed.data.aiNotes || `Manual save v${nextVer}`,
          createdByUid: req.dbUser!.uid,
        })
        .returning();

      await tx
        .update(projects)
        .set({ activeScriptRevisionId: rev.id, updatedAt: new Date() })
        .where(eq(projects.id, project.id));

      return rev;
    });

    await logUserActivity({
      userId: req.dbUser!.id,
      activityType: 'script_saved',
      description: `Saved script revision v${created.versionNumber} for "${project.title}".`,
      relatedProjectId: project.id,
    });

    res.status(201).json({
      success: true,
      message: `Saved immutable script revision v${created.versionNumber}`,
      data: created,
    });
  } catch (error) {
    console.error('Save script error:', error);
    res.status(500).json({ success: false, message: 'Failed to save script revision.' });
  }
});

scriptsRouter.get('/projects/:projectId/scripts', async (req: AuthRequest, res) => {
  try {
    const project = await ensureProjectOwner(req.params.projectId, req.dbUser!.id);
    if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });

    const revisions = await db
      .select()
      .from(scriptRevisions)
      .where(eq(scriptRevisions.projectId, project.id))
      .orderBy(desc(scriptRevisions.versionNumber));

    res.json({ success: true, data: revisions });
  } catch (error) {
    console.error('Get scripts error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch script revisions.' });
  }
});

scriptsRouter.get('/scripts/:scriptId/revisions', async (req: AuthRequest, res) => {
  try {
    const targetRows = await db
      .select()
      .from(scriptRevisions)
      .where(eq(scriptRevisions.id, req.params.scriptId))
      .limit(1);
    const target = targetRows[0];
    if (!target) return res.status(404).json({ success: false, message: 'Script not found.' });

    const project = await ensureProjectOwner(target.projectId, req.dbUser!.id);
    if (!project) return res.status(403).json({ success: false, message: 'Forbidden.' });

    const revisions = await db
      .select()
      .from(scriptRevisions)
      .where(eq(scriptRevisions.projectId, target.projectId))
      .orderBy(desc(scriptRevisions.versionNumber));

    res.json({ success: true, data: revisions });
  } catch (error) {
    console.error('Get revisions error:', error);
    res.status(500).json({ success: false, message: 'Failed to load revisions.' });
  }
});

const generateScriptSchema = z.object({
  topic: z.string().trim().max(300).optional().default(''),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().default(''),
  brandName: z.string().trim().max(120).optional().default(''),
  targetAudience: z.string().trim().max(240).optional().default(''),
  platform: z.string().trim().max(60).optional().default('YouTube'),
  contentType: z
    .enum(['YouTube', 'advertisement', 'educational', 'promotional', 'social_media'])
    .optional()
    .default('YouTube'),
  targetDurationSec: z.number().int().min(5).max(600).optional().default(30),
  language: z.string().trim().max(60).optional().default('English'),
  toneOfVoice: z.string().trim().max(80).optional().default('Energetic'),
  marketingObjective: z.string().trim().max(120).optional().default('Brand Awareness'),
  brief: z.string().trim().max(2000).optional(),
  useSearchGrounding: z.boolean().optional().default(false),
  provider: z.enum(['gemini', 'openai', 'mock']).optional(),
});

scriptsRouter.post('/projects/:projectId/scripts/generate', async (req: AuthRequest, res) => {
  const parsed = generateScriptSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Invalid script generation request.' });
  }

  try {
    const project = await ensureProjectOwner(req.params.projectId, req.dbUser!.id);
    if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });

    const result = await generateAndSaveScriptRevision({
      projectId: project.id,
      userUid: req.dbUser!.uid,
      ...parsed.data,
    });

    await logUserActivity({
      userId: req.dbUser!.id,
      activityType: 'script_generated',
      description: `Generated script revision v${result.revision.versionNumber} using ${result.provider}.`,
      relatedProjectId: project.id,
      metadata: { provider: result.provider, isMock: result.isMock },
    });

    res.status(201).json({
      success: true,
      message: `Generated script revision v${result.revision.versionNumber}`,
      data: result.revision,
      meta: {
        provider: result.provider,
        isMock: result.isMock,
        usage: result.usage,
      },
    });
  } catch (error: unknown) {
    console.error('Generate script error:', error);
    if (error instanceof AIProviderError) {
      return res.status(error.statusCode).json({
        success: false,
        code: error.code,
        provider: error.provider,
        message: error.message,
      });
    }
    const msg = error instanceof Error ? error.message : 'Script generation failed.';
    res.status(502).json({ success: false, message: msg });
  }
});

const reviseScriptSchema = z.object({
  title: z.string().trim().min(1).max(200),
  brandName: z.string().trim().max(120).optional().default(''),
  targetAudience: z.string().trim().max(240).optional().default(''),
  platform: z.string().trim().max(60).optional().default('YouTube'),
  targetDurationSec: z.number().int().min(5).max(600).optional().default(30),
  language: z.string().trim().max(60).optional().default('English'),
  toneOfVoice: z.string().trim().max(80).optional().default('Energetic'),
  marketingObjective: z.string().trim().max(120).optional().default('Brand Awareness'),
  currentContent: z.string().trim().min(1),
  action: z.enum([
    'rewrite',
    'grammar',
    'clarity',
    'engaging',
    'tone',
    'expand',
    'shorten',
    'alternative',
  ]),
  targetTone: z.string().trim().max(80).optional(),
  instructions: z.string().trim().max(600).optional(),
  provider: z.enum(['gemini', 'openai', 'mock']).optional(),
});

scriptsRouter.post('/projects/:projectId/scripts/revise', async (req: AuthRequest, res) => {
  const parsed = reviseScriptSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Invalid script revision payload.' });
  }

  try {
    const project = await ensureProjectOwner(req.params.projectId, req.dbUser!.id);
    if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });

    const result = await improveAndSaveScriptRevision({
      projectId: project.id,
      userUid: req.dbUser!.uid,
      ...parsed.data,
    });

    await logUserActivity({
      userId: req.dbUser!.id,
      activityType: 'script_improved',
      description: `Improved script (${parsed.data.action}) as revision v${result.revision.versionNumber}.`,
      relatedProjectId: project.id,
      metadata: { action: parsed.data.action, provider: result.provider },
    });

    res.status(201).json({
      success: true,
      message: `Created script revision v${result.revision.versionNumber}`,
      data: result.revision,
      meta: {
        provider: result.provider,
        isMock: result.isMock,
        usage: result.usage,
      },
    });
  } catch (error: unknown) {
    console.error('Revise script error:', error);
    if (error instanceof AIProviderError) {
      return res.status(error.statusCode).json({
        success: false,
        code: error.code,
        provider: error.provider,
        message: error.message,
      });
    }
    const msg = error instanceof Error ? error.message : 'Script revision failed.';
    res.status(502).json({ success: false, message: msg });
  }
});

scriptsRouter.post('/projects/:projectId/scripts/:revisionId/restore', async (req: AuthRequest, res) => {
  try {
    const project = await ensureProjectOwner(req.params.projectId, req.dbUser!.id);
    if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });

    const oldRows = await db
      .select()
      .from(scriptRevisions)
      .where(
        and(eq(scriptRevisions.id, req.params.revisionId), eq(scriptRevisions.projectId, project.id))
      )
      .limit(1);
    const oldRev = oldRows[0];
    if (!oldRev) return res.status(404).json({ success: false, message: 'Revision not found.' });

    const restored = await db.transaction(async (tx) => {
      const nextVer = await getNextVersionNumber(project.id);
      const [rev] = await tx
        .insert(scriptRevisions)
        .values({
          projectId: project.id,
          versionNumber: nextVer,
          title: oldRev.title,
          brandName: oldRev.brandName,
          targetAudience: oldRev.targetAudience,
          platform: oldRev.platform,
          targetDurationSec: oldRev.targetDurationSec,
          language: oldRev.language,
          toneOfVoice: oldRev.toneOfVoice,
          marketingObjective: oldRev.marketingObjective,
          topic: oldRev.topic,
          contentType: oldRev.contentType,
          content: oldRev.content,
          aiModelUsed: 'restore',
          aiNotes: `Restored from immutable revision v${oldRev.versionNumber}`,
          groundingSources: oldRev.groundingSources,
          createdByUid: req.dbUser!.uid,
        })
        .returning();

      await tx
        .update(projects)
        .set({ activeScriptRevisionId: rev.id, updatedAt: new Date() })
        .where(eq(projects.id, project.id));

      return rev;
    });

    await logUserActivity({
      userId: req.dbUser!.id,
      activityType: 'script_restored',
      description: `Restored script v${oldRev.versionNumber} as v${restored.versionNumber}.`,
      relatedProjectId: project.id,
    });

    res.status(201).json({
      success: true,
      message: `Restored v${oldRev.versionNumber} as new revision v${restored.versionNumber}`,
      data: restored,
    });
  } catch (error) {
    console.error('Restore script error:', error);
    res.status(500).json({ success: false, message: 'Failed to restore revision.' });
  }
});

const extractScenesSchema = z.object({
  scriptRevisionId: z.string().uuid().optional(),
  content: z.string().trim().min(1),
  replaceExisting: z.boolean().optional().default(true),
  provider: z.enum(['gemini', 'openai', 'mock']).optional(),
});

scriptsRouter.post('/projects/:projectId/scripts/extract-scenes', async (req: AuthRequest, res) => {
  const parsed = extractScenesSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Invalid scene extraction payload.' });
  }

  try {
    const project = await ensureProjectOwner(req.params.projectId, req.dbUser!.id);
    if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });

    const result = await extractAndSaveScenes({
      projectId: project.id,
      aspectRatio: project.aspectRatio,
      platform: project.platform,
      activeScriptRevisionId: project.activeScriptRevisionId,
      scriptRevisionId: parsed.data.scriptRevisionId,
      content: parsed.data.content,
      replaceExisting: parsed.data.replaceExisting,
      provider: parsed.data.provider,
    });

    await logUserActivity({
      userId: req.dbUser!.id,
      activityType: 'scenes_extracted',
      description: `Extracted ${result.scenes.length} storyboard scenes for "${project.title}".`,
      relatedProjectId: project.id,
      metadata: { sceneCount: result.scenes.length, provider: result.provider },
    });

    res.status(201).json({
      success: true,
      message: `Extracted ${result.scenes.length} scenes using ${result.modelUsed}`,
      data: result.scenes,
      meta: {
        provider: result.provider,
        modelUsed: result.modelUsed,
        isMock: result.isMock,
        usage: result.usage,
      },
    });
  } catch (error: unknown) {
    console.error('Extract scenes error:', error);
    if (error instanceof AIProviderError) {
      return res.status(error.statusCode).json({
        success: false,
        code: error.code,
        provider: error.provider,
        message: error.message,
      });
    }
    const msg = error instanceof Error ? error.message : 'Failed to extract scenes.';
    res.status(502).json({ success: false, message: msg });
  }
});
