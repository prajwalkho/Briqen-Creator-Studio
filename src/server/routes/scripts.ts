import { Router } from 'express';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import { projects, scenes, scriptRevisions } from '../../db/schema.ts';
import { AuthRequest, requireAuth } from '../../middleware/auth.ts';
import {
  extractScenesWithAI,
  generateScriptWithAI,
  reviseScriptWithAI,
} from '../providers/scriptService.ts';

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
  title: z.string().trim().min(1).max(200),
  brandName: z.string().trim().max(120).optional().default(''),
  targetAudience: z.string().trim().max(240).optional().default(''),
  platform: z.string().trim().max(60).optional().default('YouTube'),
  targetDurationSec: z.number().int().min(5).max(300).optional().default(30),
  language: z.string().trim().max(60).optional().default('English'),
  toneOfVoice: z.string().trim().max(80).optional().default('Energetic'),
  marketingObjective: z.string().trim().max(120).optional().default('Brand Awareness'),
  brief: z.string().trim().max(2000).optional(),
  useSearchGrounding: z.boolean().optional().default(false),
  provider: z.enum(['gemini', 'mock']).optional().default('gemini'),
});

scriptsRouter.post('/projects/:projectId/scripts/generate', async (req: AuthRequest, res) => {
  const parsed = generateScriptSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Invalid script generation request.' });
  }

  try {
    const project = await ensureProjectOwner(req.params.projectId, req.dbUser!.id);
    if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });

    const aiResult = await generateScriptWithAI(parsed.data);

    const created = await db.transaction(async (tx) => {
      const nextVer = await getNextVersionNumber(project.id);
      const [rev] = await tx
        .insert(scriptRevisions)
        .values({
          projectId: project.id,
          versionNumber: nextVer,
          title: parsed.data.title,
          brandName: parsed.data.brandName,
          targetAudience: parsed.data.targetAudience,
          platform: parsed.data.platform,
          targetDurationSec: parsed.data.targetDurationSec,
          language: parsed.data.language,
          toneOfVoice: parsed.data.toneOfVoice,
          marketingObjective: parsed.data.marketingObjective,
          content: aiResult.content,
          aiModelUsed: aiResult.aiModelUsed,
          aiNotes: aiResult.aiNotes,
          groundingSources: aiResult.groundingSources,
          createdByUid: req.dbUser!.uid,
        })
        .returning();

      await tx
        .update(projects)
        .set({ activeScriptRevisionId: rev.id, updatedAt: new Date() })
        .where(eq(projects.id, project.id));

      return rev;
    });

    res.status(201).json({
      success: true,
      message: `Generated script revision v${created.versionNumber}`,
      data: created,
    });
  } catch (error: unknown) {
    console.error('Generate script error:', error);
    const msg = error instanceof Error ? error.message : 'Script generation failed.';
    res.status(502).json({ success: false, message: msg });
  }
});

const reviseScriptSchema = z.object({
  title: z.string().trim().min(1).max(200),
  brandName: z.string().trim().max(120).optional().default(''),
  targetAudience: z.string().trim().max(240).optional().default(''),
  platform: z.string().trim().max(60).optional().default('YouTube'),
  targetDurationSec: z.number().int().min(5).max(300).optional().default(30),
  language: z.string().trim().max(60).optional().default('English'),
  toneOfVoice: z.string().trim().max(80).optional().default('Energetic'),
  marketingObjective: z.string().trim().max(120).optional().default('Brand Awareness'),
  currentContent: z.string().trim().min(1),
  action: z.enum(['rewrite', 'grammar', 'tone', 'expand', 'shorten', 'alternative']),
  targetTone: z.string().trim().max(80).optional(),
  instructions: z.string().trim().max(500).optional(),
  provider: z.enum(['gemini', 'mock']).optional().default('gemini'),
});

scriptsRouter.post('/projects/:projectId/scripts/revise', async (req: AuthRequest, res) => {
  const parsed = reviseScriptSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Invalid script revision payload.' });
  }

  try {
    const project = await ensureProjectOwner(req.params.projectId, req.dbUser!.id);
    if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });

    const aiResult = await reviseScriptWithAI({
      currentContent: parsed.data.currentContent,
      action: parsed.data.action,
      targetTone: parsed.data.targetTone,
      instructions: parsed.data.instructions,
      platform: parsed.data.platform,
      language: parsed.data.language,
      provider: parsed.data.provider,
    });

    const created = await db.transaction(async (tx) => {
      const nextVer = await getNextVersionNumber(project.id);
      const [rev] = await tx
        .insert(scriptRevisions)
        .values({
          projectId: project.id,
          versionNumber: nextVer,
          title: parsed.data.title,
          brandName: parsed.data.brandName,
          targetAudience: parsed.data.targetAudience,
          platform: parsed.data.platform,
          targetDurationSec: parsed.data.targetDurationSec,
          language: parsed.data.language,
          toneOfVoice: parsed.data.targetTone || parsed.data.toneOfVoice,
          marketingObjective: parsed.data.marketingObjective,
          content: aiResult.content,
          aiModelUsed: aiResult.aiModelUsed,
          aiNotes: aiResult.aiNotes,
          createdByUid: req.dbUser!.uid,
        })
        .returning();

      await tx
        .update(projects)
        .set({ activeScriptRevisionId: rev.id, updatedAt: new Date() })
        .where(eq(projects.id, project.id));

      return rev;
    });

    res.status(201).json({
      success: true,
      message: `Created script revision v${created.versionNumber}`,
      data: created,
    });
  } catch (error: unknown) {
    console.error('Revise script error:', error);
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
  provider: z.enum(['gemini', 'mock']).optional().default('gemini'),
});

scriptsRouter.post('/projects/:projectId/scripts/extract-scenes', async (req: AuthRequest, res) => {
  const parsed = extractScenesSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Invalid scene extraction payload.' });
  }

  try {
    const project = await ensureProjectOwner(req.params.projectId, req.dbUser!.id);
    if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });

    const { scenes: extracted, modelUsed } = await extractScenesWithAI(
      parsed.data.content,
      project.aspectRatio,
      project.platform,
      parsed.data.provider
    );

    const savedScenes = await db.transaction(async (tx) => {
      let startOrder = 0;
      if (parsed.data.replaceExisting) {
        await tx.delete(scenes).where(eq(scenes.projectId, project.id));
      } else {
        const existingMax = await tx
          .select({ maxOrd: sql<number>`coalesce(max(${scenes.sceneOrder}), -1)::int` })
          .from(scenes)
          .where(eq(scenes.projectId, project.id));
        startOrder = (existingMax[0]?.maxOrd ?? -1) + 1;
      }

      const inserted = [];
      for (let i = 0; i < extracted.length; i++) {
        const item = extracted[i];
        const [row] = await tx
          .insert(scenes)
          .values({
            projectId: project.id,
            scriptRevisionId: parsed.data.scriptRevisionId ?? project.activeScriptRevisionId ?? null,
            sceneOrder: startOrder + i,
            title: item.title,
            narration: item.narration,
            visualDescription: item.visualDescription,
            imagePrompt: item.imagePrompt,
            videoPrompt: item.videoPrompt,
            durationSec: item.durationSec,
            transition: item.transition,
            mediaPreference: item.mediaPreference,
          })
          .returning();
        inserted.push(row);
      }

      await tx
        .update(projects)
        .set({ updatedAt: new Date() })
        .where(eq(projects.id, project.id));

      return inserted;
    });

    res.status(201).json({
      success: true,
      message: `Extracted ${savedScenes.length} scenes using ${modelUsed}`,
      data: savedScenes,
    });
  } catch (error: unknown) {
    console.error('Extract scenes error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to extract scenes.';
    res.status(502).json({ success: false, message: msg });
  }
});
