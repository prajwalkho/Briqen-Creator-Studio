import { Router } from 'express';
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import { billingTransactions, generationJobs, projects } from '../../db/schema.ts';
import { AuthRequest, requireAuth } from '../../middleware/auth.ts';

export const projectsRouter = Router();

projectsRouter.use(requireAuth);

projectsRouter.get('/auth/me', (req: AuthRequest, res) => {
  res.json({
    success: true,
    data: req.dbUser,
  });
});

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

const createProjectSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).optional().default(''),
  brandName: z.string().trim().max(120).optional().default(''),
  targetAudience: z.string().trim().max(240).optional().default(''),
  platform: z.enum(['YouTube', 'Instagram', 'TikTok', 'LinkedIn', 'Facebook', 'Web']).optional().default('YouTube'),
  aspectRatio: z.enum(['16:9', '9:16', '1:1', '4:3']).optional().default('16:9'),
});

const updateProjectSchema = createProjectSchema.partial().extend({
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
    const [created] = await db
      .insert(projects)
      .values({
        userId: req.dbUser!.id,
        ...parsed.data,
      })
      .returning();

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

    res.json({ success: true, message: 'Project deleted' });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete project.' });
  }
});
