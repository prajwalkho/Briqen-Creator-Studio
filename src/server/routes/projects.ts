import { Router } from 'express';
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import { billingTransactions, generationJobs, projects, scriptRevisions } from '../../db/schema.ts';
import { AuthRequest, requireAuth } from '../../middleware/auth.ts';
import { logUserActivity } from '../services/activityService.ts';

export const projectsRouter = Router();

projectsRouter.use(requireAuth);

projectsRouter.get('/billing/ledger', async (req: AuthRequest, res) => {
  try {
    const rows = await db
      .select()
      .from(billingTransactions)
      .where(eq(billingTransactions.userId, req.dbUser!.id))
      .orderBy(desc(billingTransactions.createdAt))
      .limit(100);

    res.json({
      success: true,
      data: {
        creditsBalance: req.dbUser!.creditsBalance,
        transactions: rows,
      },
    });
  } catch (error) {
    console.error('Failed to fetch billing ledger:', error);
    res.status(500).json({ success: false, message: 'Failed to load billing ledger.' });
  }
});

const initialScriptSchema = z.object({
  title: z.string().trim().min(1).max(200),
  targetDurationSec: z.number().int().min(5).max(300).optional().default(30),
  language: z.string().trim().max(60).optional().default('English'),
  toneOfVoice: z.string().trim().max(80).optional().default('Energetic'),
  marketingObjective: z.string().trim().max(120).optional().default('Brand Awareness'),
  content: z.string().trim().min(1).max(20000),
  aiNotes: z.string().trim().max(300).optional(),
});

const createProjectSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).optional().default(''),
  brandName: z.string().trim().max(120).optional().default(''),
  targetAudience: z.string().trim().max(240).optional().default(''),
  platform: z.enum(['YouTube', 'Instagram', 'TikTok', 'LinkedIn', 'Facebook', 'Web']).optional().default('YouTube'),
  aspectRatio: z.enum(['16:9', '9:16', '1:1', '4:3']).optional().default('16:9'),
  thumbnailUrl: z
    .string()
    .trim()
    .max(500)
    .refine(
      (val) => val.startsWith('/src/assets/') || val.startsWith('https://'),
      'Invalid thumbnail URL.'
    )
    .optional(),
  initialScript: initialScriptSchema.optional(),
});

const updateProjectSchema = createProjectSchema.omit({ initialScript: true }).partial().extend({
  status: z.enum(['draft', 'processing', 'completed', 'failed']).optional(),
  selectedMusicAssetId: z.string().uuid().nullable().optional(),
});

projectsRouter.post('/projects', async (req: AuthRequest, res) => {
  const parsed = createProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: 'Invalid project payload.',
      errors: parsed.error.flatten(),
    });
  }

  try {
    const { initialScript, ...projectFields } = parsed.data;

    const created = await db.transaction(async (tx) => {
      const [proj] = await tx
        .insert(projects)
        .values({
          userId: req.dbUser!.id,
          ...projectFields,
        })
        .returning();

      if (initialScript) {
        const [rev] = await tx
          .insert(scriptRevisions)
          .values({
            projectId: proj.id,
            versionNumber: 1,
            title: initialScript.title,
            brandName: projectFields.brandName,
            targetAudience: projectFields.targetAudience,
            platform: projectFields.platform,
            targetDurationSec: initialScript.targetDurationSec,
            language: initialScript.language,
            toneOfVoice: initialScript.toneOfVoice,
            marketingObjective: initialScript.marketingObjective,
            content: initialScript.content,
            aiModelUsed: 'template',
            aiNotes: initialScript.aiNotes || 'Initialized from project template',
            createdByUid: req.dbUser!.uid,
          })
          .returning();

        const [updatedProj] = await tx
          .update(projects)
          .set({ activeScriptRevisionId: rev.id, updatedAt: new Date() })
          .where(eq(projects.id, proj.id))
          .returning();

        return updatedProj;
      }

      return proj;
    });

    await logUserActivity({
      userId: req.dbUser!.id,
      activityType: 'project_created',
      description: `Created project "${created.title}".`,
      relatedProjectId: created.id,
      metadata: { platform: created.platform, aspectRatio: created.aspectRatio },
    });

    res.status(201).json({
      success: true,
      message: 'Project created',
      data: created,
    });
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ success: false, message: 'Failed to create project.' });
  }
});

projectsRouter.get('/projects', async (req: AuthRequest, res) => {
  try {
    const userId = req.dbUser!.id;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : 'all';
    const sort = typeof req.query.sort === 'string' ? req.query.sort : 'updated_desc';

    const conditions = [eq(projects.userId, userId)];
    if (status !== 'all' && ['draft', 'processing', 'completed', 'failed'].includes(status)) {
      conditions.push(eq(projects.status, status));
    }
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(or(ilike(projects.title, pattern), ilike(projects.brandName, pattern), ilike(projects.description, pattern))!);
    }

    const orderBy =
      sort === 'created_desc'
        ? desc(projects.createdAt)
        : sort === 'title_asc'
          ? asc(projects.title)
          : desc(projects.updatedAt);

    const list = await db
      .select()
      .from(projects)
      .where(and(...conditions))
      .orderBy(orderBy);

    // Dashboard summary stats
    const allUserProjects = await db
      .select({ status: projects.status })
      .from(projects)
      .where(eq(projects.userId, userId));

    const failedJobsCountRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(generationJobs)
      .where(and(eq(generationJobs.userId, userId), eq(generationJobs.status, 'failed')));

    const stats = {
      totalProjects: allUserProjects.length,
      completedProjects: allUserProjects.filter((p) => p.status === 'completed').length,
      processingProjects: allUserProjects.filter((p) => p.status === 'processing').length,
      failedJobs: failedJobsCountRows[0]?.count ?? 0,
    };

    res.json({
      success: true,
      data: {
        projects: list,
        stats,
      },
    });
  } catch (error) {
    console.error('List projects error:', error);
    res.status(500).json({ success: false, message: 'Failed to load projects.' });
  }
});

projectsRouter.get('/projects/:projectId', async (req: AuthRequest, res) => {
  try {
    const { projectId } = req.params;
    const rows = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, req.dbUser!.id)))
      .limit(1);

    if (!rows[0]) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({ success: false, message: 'Failed to load project.' });
  }
});

projectsRouter.patch('/projects/:projectId', async (req: AuthRequest, res) => {
  const parsed = updateProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: 'Invalid project update.',
      errors: parsed.error.flatten(),
    });
  }

  try {
    const { projectId } = req.params;
    const updated = await db
      .update(projects)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(projects.id, projectId), eq(projects.userId, req.dbUser!.id)))
      .returning();

    if (!updated[0]) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    await logUserActivity({
      userId: req.dbUser!.id,
      activityType: 'project_updated',
      description: `Updated project settings for "${updated[0].title}".`,
      relatedProjectId: updated[0].id,
    });

    res.json({ success: true, message: 'Project updated', data: updated[0] });
  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({ success: false, message: 'Failed to update project.' });
  }
});

projectsRouter.delete('/projects/:projectId', async (req: AuthRequest, res) => {
  try {
    const { projectId } = req.params;
    const deleted = await db
      .delete(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, req.dbUser!.id)))
      .returning();

    if (!deleted[0]) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    await logUserActivity({
      userId: req.dbUser!.id,
      activityType: 'project_deleted',
      description: `Deleted project "${deleted[0].title}".`,
    });

    res.json({ success: true, message: 'Project deleted' });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete project.' });
  }
});
