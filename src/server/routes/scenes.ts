import { Router } from 'express';
import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import { projects, scenes } from '../../db/schema.ts';
import { AuthRequest, requireAuth } from '../../middleware/auth.ts';

export const scenesRouter = Router();
scenesRouter.use(requireAuth);

async function ensureProjectOwner(projectId: string, userId: string) {
  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);
  return rows[0] || null;
}

const createSceneSchema = z.object({
  title: z.string().trim().min(1).max(160),
  narration: z.string().optional().default(''),
  visualDescription: z.string().optional().default(''),
  imagePrompt: z.string().optional().default(''),
  videoPrompt: z.string().optional().default(''),
  durationSec: z.number().int().min(1).max(60).optional().default(5),
  transition: z.enum(['fade', 'dissolve', 'wipeleft', 'none']).optional().default('fade'),
  mediaPreference: z.enum(['image', 'video']).optional().default('image'),
});

const updateSceneSchema = createSceneSchema.partial().extend({
  selectedAssetId: z.string().uuid().nullable().optional(),
  voiceoverAssetId: z.string().uuid().nullable().optional(),
});

scenesRouter.post('/projects/:projectId/scenes', async (req: AuthRequest, res) => {
  const parsed = createSceneSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Invalid scene payload.' });
  }

  try {
    const project = await ensureProjectOwner(req.params.projectId, req.dbUser!.id);
    if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });

    const maxOrderRows = await db
      .select({ maxOrd: sql<number>`coalesce(max(${scenes.sceneOrder}), -1)::int` })
      .from(scenes)
      .where(eq(scenes.projectId, project.id));

    const [created] = await db
      .insert(scenes)
      .values({
        projectId: project.id,
        sceneOrder: (maxOrderRows[0]?.maxOrd ?? -1) + 1,
        ...parsed.data,
      })
      .returning();

    res.status(201).json({ success: true, message: 'Scene added', data: created });
  } catch (error) {
    console.error('Create scene error:', error);
    res.status(500).json({ success: false, message: 'Failed to create scene.' });
  }
});

scenesRouter.get('/projects/:projectId/scenes', async (req: AuthRequest, res) => {
  try {
    const project = await ensureProjectOwner(req.params.projectId, req.dbUser!.id);
    if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });

    const list = await db
      .select()
      .from(scenes)
      .where(eq(scenes.projectId, project.id))
      .orderBy(asc(scenes.sceneOrder));

    res.json({ success: true, data: list });
  } catch (error) {
    console.error('List scenes error:', error);
    res.status(500).json({ success: false, message: 'Failed to load scenes.' });
  }
});

scenesRouter.patch('/scenes/:sceneId', async (req: AuthRequest, res) => {
  const parsed = updateSceneSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Invalid scene update.' });
  }

  try {
    const existingRows = await db.select().from(scenes).where(eq(scenes.id, req.params.sceneId)).limit(1);
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ success: false, message: 'Scene not found.' });

    const project = await ensureProjectOwner(existing.projectId, req.dbUser!.id);
    if (!project) return res.status(403).json({ success: false, message: 'Forbidden.' });

    const [updated] = await db
      .update(scenes)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(scenes.id, existing.id))
      .returning();

    res.json({ success: true, message: 'Scene updated', data: updated });
  } catch (error) {
    console.error('Update scene error:', error);
    res.status(500).json({ success: false, message: 'Failed to update scene.' });
  }
});

scenesRouter.post('/scenes/:sceneId/duplicate', async (req: AuthRequest, res) => {
  try {
    const existingRows = await db.select().from(scenes).where(eq(scenes.id, req.params.sceneId)).limit(1);
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ success: false, message: 'Scene not found.' });

    const project = await ensureProjectOwner(existing.projectId, req.dbUser!.id);
    if (!project) return res.status(403).json({ success: false, message: 'Forbidden.' });

    const created = await db.transaction(async (tx) => {
      // Shift following scenes by +1
      await tx
        .update(scenes)
        .set({ sceneOrder: sql`${scenes.sceneOrder} + 1` })
        .where(
          and(
            eq(scenes.projectId, existing.projectId),
            sql`${scenes.sceneOrder} > ${existing.sceneOrder}`
          )
        );

      const [dup] = await tx
        .insert(scenes)
        .values({
          projectId: existing.projectId,
          scriptRevisionId: existing.scriptRevisionId,
          sceneOrder: existing.sceneOrder + 1,
          title: `${existing.title} (Copy)`,
          narration: existing.narration,
          visualDescription: existing.visualDescription,
          imagePrompt: existing.imagePrompt,
          videoPrompt: existing.videoPrompt,
          durationSec: existing.durationSec,
          transition: existing.transition,
          mediaPreference: existing.mediaPreference,
          selectedAssetId: existing.selectedAssetId,
          voiceoverAssetId: existing.voiceoverAssetId,
          generationStatus: existing.selectedAssetId ? 'succeeded' : 'idle',
        })
        .returning();

      return dup;
    });

    res.status(201).json({ success: true, message: 'Scene duplicated', data: created });
  } catch (error) {
    console.error('Duplicate scene error:', error);
    res.status(500).json({ success: false, message: 'Failed to duplicate scene.' });
  }
});

scenesRouter.delete('/scenes/:sceneId', async (req: AuthRequest, res) => {
  try {
    const existingRows = await db.select().from(scenes).where(eq(scenes.id, req.params.sceneId)).limit(1);
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ success: false, message: 'Scene not found.' });

    const project = await ensureProjectOwner(existing.projectId, req.dbUser!.id);
    if (!project) return res.status(403).json({ success: false, message: 'Forbidden.' });

    await db.transaction(async (tx) => {
      await tx.delete(scenes).where(eq(scenes.id, existing.id));
      const remaining = await tx
        .select()
        .from(scenes)
        .where(eq(scenes.projectId, existing.projectId))
        .orderBy(asc(scenes.sceneOrder));
      for (let i = 0; i < remaining.length; i++) {
        await tx.update(scenes).set({ sceneOrder: i }).where(eq(scenes.id, remaining[i].id));
      }
    });

    res.json({ success: true, message: 'Scene deleted' });
  } catch (error) {
    console.error('Delete scene error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete scene.' });
  }
});

const reorderSchema = z.object({
  orderedSceneIds: z.array(z.string().uuid()).min(1),
});

scenesRouter.put('/projects/:projectId/scenes/reorder', async (req: AuthRequest, res) => {
  const parsed = reorderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Invalid scene ordering payload.' });
  }

  try {
    const project = await ensureProjectOwner(req.params.projectId, req.dbUser!.id);
    if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });

    const updated = await db.transaction(async (tx) => {
      for (let i = 0; i < parsed.data.orderedSceneIds.length; i++) {
        await tx
          .update(scenes)
          .set({ sceneOrder: i, updatedAt: new Date() })
          .where(
            and(
              eq(scenes.id, parsed.data.orderedSceneIds[i]),
              eq(scenes.projectId, project.id)
            )
          );
      }

      return tx
        .select()
        .from(scenes)
        .where(eq(scenes.projectId, project.id))
        .orderBy(asc(scenes.sceneOrder));
    });

    res.json({ success: true, message: 'Scene order saved', data: updated });
  } catch (error) {
    console.error('Reorder scenes error:', error);
    res.status(500).json({ success: false, message: 'Failed to reorder scenes.' });
  }
});
