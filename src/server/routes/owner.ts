import crypto from 'crypto';
import {
  and,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import {
  adminAuditLogs,
  adminPermissions,
  assets,
  billingTransactions,
  exportsTable,
  generationActions,
  generationAttempts,
  generationJobs,
  notificationPreferences,
  permissions,
  platformSettings,
  projects,
  refreshTokens,
  scenes,
  scriptRevisions,
  userActivities,
  userBanHistory,
  userPreferences,
  users,
} from '../../db/schema.ts';
import { getUserById, toPublicUser } from '../../db/users.ts';
import { type AuthRequest, requireAuth } from '../../middleware/auth.ts';
import { loadAIConfig } from '../ai/config.ts';
import {
  ALL_PERMISSION_NAMES,
  DEFAULT_ADMIN_PERMISSIONS,
  getAllAdminsPermissionMap,
  getUserPermissions,
  isValidPermissionName,
  listPermissionsCatalogWithCounts,
  type PermissionName,
  setAdminPermissions,
} from '../auth/permissions.ts';
import { normalizeRole, requireRole } from '../auth/rbac.ts';
import { hashPassword, validatePasswordComplexity } from '../auth/security.ts';
import { getDemoConfig } from '../seeders/demoConfig.ts';
import { logUserActivity, recordAdminAuditLog } from '../services/activityService.ts';

export const ownerRouter = Router();

const ownerActionBuckets = new Map<string, { count: number; resetAt: number }>();
function ownerMutationLimiter(req: AuthRequest, res: Response, next: NextFunction) {
  const actor = req.dbUser?.id || req.ip || 'anon';
  const key = `owner:${req.method}:${req.path}:${actor}`;
  const now = Date.now();
  const entry = ownerActionBuckets.get(key);
  if (!entry || now > entry.resetAt) {
    ownerActionBuckets.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return next();
  }
  entry.count += 1;
  if (entry.count > 100) {
    const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    res.setHeader('Retry-After', String(retryAfterSec));
    return res.status(429).json({
      success: false,
      message: 'Too many owner management actions. Please wait briefly and try again.',
    });
  }
  return next();
}

const recoveryBuckets = new Map<string, { count: number; resetAt: number }>();
function recoveryLimiter(req: Request, res: Response, next: NextFunction) {
  const key = `recover:${req.ip || 'local'}`;
  const now = Date.now();
  const entry = recoveryBuckets.get(key);
  if (!entry || now > entry.resetAt) {
    recoveryBuckets.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return next();
  }
  entry.count += 1;
  if (entry.count > 8) {
    return res.status(429).json({
      success: false,
      message: 'Too many owner recovery attempts. Try again later.',
    });
  }
  return next();
}

const uuidSchema = z.string().uuid();
function parseUuid(val: string | undefined): string | null {
  if (!val) return null;
  const res = uuidSchema.safeParse(val);
  return res.success ? res.data : null;
}

function escapeCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

async function countActiveSuperAdmins(): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(
      and(
        eq(users.role, 'super_admin'),
        eq(users.isActive, true),
        eq(users.accountStatus, 'active'),
        isNull(users.deletedAt)
      )
    );
  return rows[0]?.count ?? 0;
}

type Granularity = 'daily' | 'weekly' | 'monthly' | 'yearly';

function parseAnalyticsWindow(query: Request['query']): {
  since: Date | null;
  until: Date;
  granularity: Granularity;
  rangeLabel: string;
} {
  const rangeRaw = typeof query.range === 'string' ? query.range.trim().toLowerCase() : '30d';
  const granRaw = typeof query.granularity === 'string' ? query.granularity.trim().toLowerCase() : 'daily';
  const granularity: Granularity =
    granRaw === 'weekly' || granRaw === 'monthly' || granRaw === 'yearly' ? granRaw : 'daily';

  const now = new Date();
  let until = now;
  if (typeof query.to === 'string' && query.to.trim()) {
    const parsedTo = new Date(query.to);
    if (!Number.isNaN(parsedTo.getTime())) {
      until = parsedTo;
    }
  }

  let since: Date | null = null;
  if (typeof query.from === 'string' && query.from.trim()) {
    const parsedFrom = new Date(query.from);
    if (!Number.isNaN(parsedFrom.getTime())) {
      since = parsedFrom;
      return { since, until, granularity, rangeLabel: 'custom' };
    }
  }

  switch (rangeRaw) {
    case '7d':
      since = new Date(until.getTime() - 7 * 24 * 3600 * 1000);
      return { since, until, granularity, rangeLabel: '7d' };
    case '90d':
      since = new Date(until.getTime() - 90 * 24 * 3600 * 1000);
      return { since, until, granularity, rangeLabel: '90d' };
    case '365d':
    case '1y':
      since = new Date(until.getTime() - 365 * 24 * 3600 * 1000);
      return { since, until, granularity, rangeLabel: '365d' };
    case 'all':
      return { since: null, until, granularity, rangeLabel: 'all' };
    default:
      since = new Date(until.getTime() - 30 * 24 * 3600 * 1000);
      return { since, until, granularity, rangeLabel: '30d' };
  }
}

function periodSqlExpr(column: any, granularity: Granularity) {
  switch (granularity) {
    case 'weekly':
      return sql<string>`to_char(date_trunc('week', ${column}), 'YYYY-MM-DD')`;
    case 'monthly':
      return sql<string>`to_char(date_trunc('month', ${column}), 'YYYY-MM')`;
    case 'yearly':
      return sql<string>`to_char(date_trunc('year', ${column}), 'YYYY')`;
    default:
      return sql<string>`to_char(date_trunc('day', ${column}), 'YYYY-MM-DD')`;
  }
}

function periodTruncExpr(column: any, granularity: Granularity) {
  switch (granularity) {
    case 'weekly':
      return sql`date_trunc('week', ${column})`;
    case 'monthly':
      return sql`date_trunc('month', ${column})`;
    case 'yearly':
      return sql`date_trunc('year', ${column})`;
    default:
      return sql`date_trunc('day', ${column})`;
  }
}

const DEFAULT_SYSTEM_SETTINGS = {
  general: {
    platformName: 'Briqen Creator Studio',
    supportEmail: 'support@briqen.studio',
    maintenanceMode: false,
    registrationEnabled: true,
    requireEmailVerification: false,
    defaultStartingCredits: 1000,
  },
  aiDefaults: {
    scriptModelTier: 'balanced',
    maxScenesPerStoryboard: 12,
    defaultAspectRatio: '16:9',
    allowMockFallback: true,
  },
  security: {
    sessionTimeoutMinutes: 1440,
    maxActiveSessionsPerUser: 10,
    enforceStrongPasswords: true,
    auditRetentionDays: 365,
  },
  featureFlags: {
    quickDraftExport: true,
    projectTemplates: true,
    aiImageGeneration: true,
    aiVideoGeneration: true,
    aiAudioGeneration: true,
  },
  billing: {
    billingImplemented: false,
    currency: 'USD',
    plansSummary: [
      { id: 'free', name: 'Starter', monthlyCredits: 1000, priceUsd: 0 },
      { id: 'pro', name: 'Creator Pro (Planned)', monthlyCredits: 10000, priceUsd: 29 },
      { id: 'studio', name: 'Studio Team (Planned)', monthlyCredits: 50000, priceUsd: 99 },
    ],
  },
};

async function getMergedSystemSettings() {
  const rows = await db.select().from(platformSettings);
  const map = new Map(rows.map((r) => [r.key, r.valueJson]));
  return {
    general: { ...DEFAULT_SYSTEM_SETTINGS.general, ...(map.get('general') || {}) },
    aiDefaults: { ...DEFAULT_SYSTEM_SETTINGS.aiDefaults, ...(map.get('aiDefaults') || {}) },
    security: { ...DEFAULT_SYSTEM_SETTINGS.security, ...(map.get('security') || {}) },
    featureFlags: { ...DEFAULT_SYSTEM_SETTINGS.featureFlags, ...(map.get('featureFlags') || {}) },
    billing: { ...DEFAULT_SYSTEM_SETTINGS.billing, ...(map.get('billing') || {}) },
    updatedAtMap: Object.fromEntries(rows.map((r) => [r.key, r.updatedAt.toISOString()])),
  };
}

// ============================================================================
// 0. Secure Owner Recovery Endpoints (env-backed OWNER_RECOVERY_KEY only)
// ============================================================================
ownerRouter.get('/recovery-status', async (_req, res) => {
  try {
    const recoveryKey = process.env.OWNER_RECOVERY_KEY?.trim() || '';
    const activeSuperAdmins = await countActiveSuperAdmins();
    return res.json({
      success: true,
      data: {
        recoveryConfigured: recoveryKey.length >= 16,
        activeSuperAdmins,
      },
    });
  } catch (error) {
    console.error('Owner recovery status error:', error);
    return res.status(500).json({ success: false, message: 'Failed to inspect owner recovery status.' });
  }
});

const recoverOwnerSchema = z.object({
  recoveryKey: z.string().min(16, 'Valid owner recovery key required.'),
  email: z.string().trim().email('Valid Super Admin email required.'),
  newPassword: z.string().min(8).max(128).optional(),
});

ownerRouter.post('/recover', recoveryLimiter, async (req, res) => {
  const configuredKey = process.env.OWNER_RECOVERY_KEY?.trim() || '';
  if (configuredKey.length < 16) {
    return res.status(503).json({
      success: false,
      message:
        'Owner recovery is not configured on this server. Set a 16+ character OWNER_RECOVERY_KEY environment variable to enable emergency owner recovery.',
    });
  }

  const parsed = recoverOwnerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: parsed.error.issues[0]?.message || 'Invalid owner recovery payload.',
    });
  }

  const providedBuf = Buffer.from(parsed.data.recoveryKey.trim(), 'utf8');
  const configuredBuf = Buffer.from(configuredKey, 'utf8');
  if (providedBuf.length !== configuredBuf.length || !crypto.timingSafeEqual(providedBuf, configuredBuf)) {
    return res.status(403).json({
      success: false,
      message: 'Invalid owner recovery key.',
    });
  }

  if (parsed.data.newPassword) {
    const complexity = validatePasswordComplexity(parsed.data.newPassword);
    if (!complexity.valid) {
      return res.status(400).json({ success: false, message: complexity.reason });
    }
  }

  try {
    const normalizedEmail = parsed.data.email.toLowerCase();
    const targetRows = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${normalizedEmail}`)
      .limit(1);
    const target = targetRows[0];

    if (!target) {
      return res.status(404).json({ success: false, message: 'Target account not found.' });
    }

    const activeSuperCount = await countActiveSuperAdmins();
    if (normalizeRole(target.role) !== 'super_admin' && activeSuperCount > 0) {
      return res.status(403).json({
        success: false,
        message: 'Recovery can only restore an existing Super Admin account while active owners exist.',
      });
    }

    const nextHash = parsed.data.newPassword ? await hashPassword(parsed.data.newPassword) : undefined;
    const now = new Date();
    const [restored] = await db.transaction(async (tx) => {
      await tx
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(and(eq(refreshTokens.userId, target.id), isNull(refreshTokens.revokedAt)));

      return tx
        .update(users)
        .set({
          role: 'super_admin',
          accountStatus: 'active',
          isActive: true,
          deletedAt: null,
          banReason: null,
          banExpiresAt: null,
          bannedAt: null,
          bannedBy: null,
          ...(nextHash ? { passwordHash: nextHash, passwordChangedAt: now } : {}),
          tokenVersion: sql`${users.tokenVersion} + 1`,
          updatedAt: now,
        })
        .where(eq(users.id, target.id))
        .returning();
    });

    await Promise.all([
      recordAdminAuditLog({
        adminId: restored.id,
        targetUserId: restored.id,
        action: 'owner_recovery',
        entityType: 'user',
        entityId: restored.id,
        outcome: 'success',
        newValues: { role: 'super_admin', passwordReset: Boolean(nextHash) },
        ipAddress: req.ip,
      }),
      logUserActivity({
        userId: restored.id,
        activityType: 'owner_recovery',
        description: 'Super Admin access restored via OWNER_RECOVERY_KEY.',
      }),
    ]);

    return res.json({
      success: true,
      message: 'Super Admin access restored. Please sign in with your updated credentials.',
      data: { email: restored.email, role: 'super_admin' },
    });
  } catch (error) {
    console.error('Owner recovery error:', error);
    return res.status(500).json({ success: false, message: 'Failed to execute owner recovery.' });
  }
});

// All routes below require authenticated Super Admin (Platform Owner)
ownerRouter.use(requireAuth, requireRole('super_admin'));

// ============================================================================
// 1. Owner Platform Overview
// ============================================================================
ownerRouter.get('/overview', async (_req: AuthRequest, res) => {
  try {
    const demoCfg = getDemoConfig();
    const [
      userRows,
      projStatusRows,
      scriptCountRows,
      sceneCountRows,
      genActionRows,
      jobStatusRows,
      assetAggRows,
      exportAggRows,
      billingAggRows,
      scriptCostRows,
      attemptCostRows,
      recentAuditRows,
      recentActivityRows,
      recentUserRows,
    ] = await Promise.all([
      db
        .select({
          id: users.id,
          role: users.role,
          accountStatus: users.accountStatus,
          isActive: users.isActive,
          isVerified: users.isVerified,
          isDemoAccount: users.isDemoAccount,
          creditsBalance: users.creditsBalance,
          deletedAt: users.deletedAt,
        })
        .from(users),
      db
        .select({
          status: projects.status,
          count: sql<number>`count(*)::int`,
        })
        .from(projects)
        .groupBy(projects.status),
      db.select({ count: sql<number>`count(*)::int` }).from(scriptRevisions),
      db.select({ count: sql<number>`count(*)::int` }).from(scenes),
      db
        .select({
          mediaType: generationActions.mediaType,
          count: sql<number>`count(*)::int`,
        })
        .from(generationActions)
        .groupBy(generationActions.mediaType),
      db
        .select({
          status: generationJobs.status,
          count: sql<number>`count(*)::int`,
        })
        .from(generationJobs)
        .groupBy(generationJobs.status),
      db
        .select({
          count: sql<number>`count(*)::int`,
          totalBytes: sql<number>`coalesce(sum(${assets.fileSizeBytes}), 0)::bigint`,
        })
        .from(assets),
      db
        .select({
          status: exportsTable.status,
          count: sql<number>`count(*)::int`,
          totalBytes: sql<number>`coalesce(sum(${exportsTable.fileSizeBytes}), 0)::bigint`,
        })
        .from(exportsTable)
        .groupBy(exportsTable.status),
      db
        .select({
          status: billingTransactions.status,
          estimatedCredits: sql<number>`coalesce(sum(${billingTransactions.estimatedCredits}), 0)::int`,
          actualCredits: sql<number>`coalesce(sum(${billingTransactions.actualCredits}), 0)::int`,
        })
        .from(billingTransactions)
        .groupBy(billingTransactions.status),
      db
        .select({
          totalCost: sql<number>`coalesce(sum((${scriptRevisions.usageJson}->>'estimatedCostUsd')::numeric), 0)::float8`,
        })
        .from(scriptRevisions),
      db
        .select({
          totalCost: sql<number>`coalesce(sum((${generationAttempts.usageJson}->>'estimatedCostUsd')::numeric), 0)::float8`,
        })
        .from(generationAttempts),
      db
        .select()
        .from(adminAuditLogs)
        .orderBy(desc(adminAuditLogs.createdAt))
        .limit(12),
      db
        .select({
          id: userActivities.id,
          userId: userActivities.userId,
          activityType: userActivities.activityType,
          description: userActivities.description,
          createdAt: userActivities.createdAt,
          userEmail: users.email,
          userFullName: users.fullName,
        })
        .from(userActivities)
        .leftJoin(users, eq(userActivities.userId, users.id))
        .orderBy(desc(userActivities.createdAt))
        .limit(12),
      db.select().from(users).orderBy(desc(users.createdAt)).limit(8),
    ]);

    let activeUsers = 0;
    let bannedUsers = 0;
    let suspendedUsers = 0;
    let deletedUsers = 0;
    let verifiedUsers = 0;
    let unverifiedUsers = 0;
    let totalSuperAdmins = 0;
    let totalAdmins = 0;
    let totalRegularUsers = 0;
    let demoUsers = 0;
    let realUsers = 0;
    let totalCreditsBalance = 0;

    for (const u of userRows) {
      const role = normalizeRole(u.role);
      if (role === 'super_admin') totalSuperAdmins += 1;
      else if (role === 'admin') totalAdmins += 1;
      else totalRegularUsers += 1;

      if (u.deletedAt !== null) deletedUsers += 1;
      else if (u.accountStatus === 'banned') bannedUsers += 1;
      else if (u.accountStatus === 'suspended' || !u.isActive) suspendedUsers += 1;
      else activeUsers += 1;

      if (u.isVerified) verifiedUsers += 1;
      else unverifiedUsers += 1;

      if (u.isDemoAccount) demoUsers += 1;
      else realUsers += 1;

      totalCreditsBalance += u.creditsBalance ?? 0;
    }

    const projectsByStatus: Record<string, number> = {
      draft: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    };
    let totalProjects = 0;
    for (const r of projStatusRows) {
      projectsByStatus[r.status] = r.count;
      totalProjects += r.count;
    }

    const genMap = new Map(genActionRows.map((r) => [r.mediaType, r.count]));
    const imageGenerations = genMap.get('image') ?? 0;
    const videoGenerations = genMap.get('video') ?? 0;
    const audioGenerations = (genMap.get('audio_tts') ?? 0) + (genMap.get('audio_music') ?? 0);
    const totalGenerations = imageGenerations + videoGenerations + audioGenerations;

    const jobMap = new Map(jobStatusRows.map((r) => [r.status, r.count]));
    const failedJobs = (jobMap.get('failed') ?? 0) + (jobMap.get('timed_out') ?? 0);
    const succeededJobs = jobMap.get('succeeded') ?? 0;
    const activeJobs = (jobMap.get('queued') ?? 0) + (jobMap.get('processing') ?? 0) + (jobMap.get('retrying') ?? 0);

    let totalExports = 0;
    let completedExports = 0;
    let exportStorageBytes = 0;
    for (const r of exportAggRows) {
      totalExports += r.count;
      if (r.status === 'succeeded') completedExports += r.count;
      exportStorageBytes += Number(r.totalBytes || 0);
    }

    const billingMap = new Map(billingAggRows.map((r) => [r.status, r]));
    const totalCreditsSettled = billingMap.get('settled')?.actualCredits ?? 0;
    const totalCreditsReserved = billingMap.get('reserved')?.estimatedCredits ?? 0;
    const totalCreditsRefunded = billingMap.get('refunded')?.estimatedCredits ?? 0;

    const estimatedAiCostUsd = Number(
      ((scriptCostRows[0]?.totalCost ?? 0) + (attemptCostRows[0]?.totalCost ?? 0)).toFixed(4)
    );

    const auditActors = new Set<string>();
    for (const log of recentAuditRows) {
      if (log.adminId) auditActors.add(log.adminId);
      if (log.targetUserId) auditActors.add(log.targetUserId);
    }
    const actorEmailMap = new Map<string, string>();
    if (auditActors.size > 0) {
      const actorRows = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(inArray(users.id, Array.from(auditActors)));
      for (const a of actorRows) actorEmailMap.set(a.id, a.email);
    }

    return res.json({
      success: true,
      data: {
        totalUsers: userRows.length,
        activeUsers,
        bannedUsers,
        suspendedUsers,
        deletedUsers,
        verifiedUsers,
        unverifiedUsers,
        totalSuperAdmins,
        totalAdmins,
        totalRegularUsers,
        demoUsers,
        realUsers,
        demoModeEnabled: !demoCfg.isProduction && demoCfg.demoAccountsEnabled,
        totalProjects,
        projectsByStatus,
        totalScripts: scriptCountRows[0]?.count ?? 0,
        totalScenes: sceneCountRows[0]?.count ?? 0,
        totalGenerations,
        imageGenerations,
        videoGenerations,
        audioGenerations,
        failedJobs,
        succeededJobs,
        activeJobs,
        totalAssets: assetAggRows[0]?.count ?? 0,
        totalStorageBytes: Number(assetAggRows[0]?.totalBytes ?? 0) + exportStorageBytes,
        totalExports,
        completedExports,
        totalCreditsBalance,
        totalCreditsSettled,
        totalCreditsReserved,
        totalCreditsRefunded,
        estimatedAiCostUsd,
        billingImplemented: false,
        confirmedRevenueUsd: null,
        recentUsers: recentUserRows.map((u) => toPublicUser(u)),
        recentActivities: recentActivityRows,
        recentAuditLogs: recentAuditRows.map((l) => ({
          ...l,
          adminEmail: l.adminId ? actorEmailMap.get(l.adminId) ?? null : null,
          targetEmail: l.targetUserId ? actorEmailMap.get(l.targetUserId) ?? null : null,
        })),
      },
    });
  } catch (error) {
    console.error('Owner overview error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load owner platform overview.' });
  }
});

// ============================================================================
// 2. Owner Deep Analytics (Real SQL aggregations + time-series + CSV export)
// ============================================================================
async function computeOwnerAnalytics(query: Request['query']) {
  const { since, until, granularity, rangeLabel } = parseAnalyticsWindow(query);

  const userDateConds = [lte(users.createdAt, until)];
  if (since) userDateConds.push(gte(users.createdAt, since));

  const actDateConds = [lte(userActivities.createdAt, until)];
  if (since) actDateConds.push(gte(userActivities.createdAt, since));

  const projDateConds = [lte(projects.createdAt, until)];
  if (since) projDateConds.push(gte(projects.createdAt, since));

  const genDateConds = [lte(generationActions.createdAt, until)];
  if (since) genDateConds.push(gte(generationActions.createdAt, since));

  const scriptDateConds = [lte(scriptRevisions.createdAt, until)];
  if (since) scriptDateConds.push(gte(scriptRevisions.createdAt, since));

  const exportDateConds = [lte(exportsTable.createdAt, until)];
  if (since) exportDateConds.push(gte(exportsTable.createdAt, since));

  const billingDateConds = [lte(billingTransactions.createdAt, until)];
  if (since) billingDateConds.push(gte(billingTransactions.createdAt, since));

  const userPeriodExpr = periodSqlExpr(users.createdAt, granularity);
  const userTruncExpr = periodTruncExpr(users.createdAt, granularity);
  const actPeriodExpr = periodSqlExpr(userActivities.createdAt, granularity);
  const actTruncExpr = periodTruncExpr(userActivities.createdAt, granularity);
  const projPeriodExpr = periodSqlExpr(projects.createdAt, granularity);
  const projTruncExpr = periodTruncExpr(projects.createdAt, granularity);
  const genPeriodExpr = periodSqlExpr(generationActions.createdAt, granularity);
  const genTruncExpr = periodTruncExpr(generationActions.createdAt, granularity);
  const scriptPeriodExpr = periodSqlExpr(scriptRevisions.createdAt, granularity);
  const scriptTruncExpr = periodTruncExpr(scriptRevisions.createdAt, granularity);
  const exportPeriodExpr = periodSqlExpr(exportsTable.createdAt, granularity);
  const exportTruncExpr = periodTruncExpr(exportsTable.createdAt, granularity);
  const billingPeriodExpr = periodSqlExpr(billingTransactions.createdAt, granularity);
  const billingTruncExpr = periodTruncExpr(billingTransactions.createdAt, granularity);

  const d7 = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const d30 = new Date(Date.now() - 30 * 24 * 3600 * 1000);

  const [
    allUserStatsRows,
    regTrendRows,
    actTrendRows,
    retentionRows,
    projTrendRows,
    projStatusRows,
    projPlatformRows,
    projAspectRows,
    topProjectUsersRows,
    genTrendRows,
    scriptTrendRows,
    providerRows,
    modelRows,
    jobStatusRows,
    attemptAggRows,
    attemptCostByProviderRows,
    assetTypeRows,
    exportTrendRows,
    creditTrendRows,
    creditSummaryRows,
    scriptCostByProviderRows,
  ] = await Promise.all([
    db
      .select({
        role: users.role,
        accountStatus: users.accountStatus,
        isActive: users.isActive,
        isVerified: users.isVerified,
        deletedAt: users.deletedAt,
        creditsBalance: users.creditsBalance,
      })
      .from(users),
    db
      .select({
        period: userPeriodExpr,
        count: sql<number>`count(*)::int`,
        demoCount: sql<number>`count(*) filter (where ${users.isDemoAccount} = true)::int`,
        realCount: sql<number>`count(*) filter (where ${users.isDemoAccount} = false)::int`,
      })
      .from(users)
      .where(and(...userDateConds))
      .groupBy(userTruncExpr, userPeriodExpr)
      .orderBy(userTruncExpr),
    db
      .select({
        period: actPeriodExpr,
        count: sql<number>`count(*)::int`,
      })
      .from(userActivities)
      .where(and(...actDateConds))
      .groupBy(actTruncExpr, actPeriodExpr)
      .orderBy(actTruncExpr),
    db
      .select({
        active7d: sql<number>`count(*) filter (where ${users.lastLoginAt} >= ${d7} and ${users.deletedAt} is null)::int`,
        active30d: sql<number>`count(*) filter (where ${users.lastLoginAt} >= ${d30} and ${users.deletedAt} is null)::int`,
        totalActive: sql<number>`count(*) filter (where ${users.deletedAt} is null and ${users.isActive} = true)::int`,
      })
      .from(users),
    db
      .select({
        period: projPeriodExpr,
        count: sql<number>`count(*)::int`,
      })
      .from(projects)
      .where(and(...projDateConds))
      .groupBy(projTruncExpr, projPeriodExpr)
      .orderBy(projTruncExpr),
    db
      .select({
        status: projects.status,
        count: sql<number>`count(*)::int`,
      })
      .from(projects)
      .where(and(...projDateConds))
      .groupBy(projects.status),
    db
      .select({
        platform: projects.platform,
        count: sql<number>`count(*)::int`,
      })
      .from(projects)
      .where(and(...projDateConds))
      .groupBy(projects.platform)
      .orderBy(desc(sql`count(*)`)),
    db
      .select({
        aspectRatio: projects.aspectRatio,
        count: sql<number>`count(*)::int`,
      })
      .from(projects)
      .where(and(...projDateConds))
      .groupBy(projects.aspectRatio),
    db
      .select({
        userId: users.id,
        email: users.email,
        fullName: users.fullName,
        isDemoAccount: users.isDemoAccount,
        projectCount: sql<number>`count(${projects.id})::int`,
        completedCount: sql<number>`count(*) filter (where ${projects.status} = 'completed')::int`,
      })
      .from(projects)
      .innerJoin(users, eq(projects.userId, users.id))
      .groupBy(users.id, users.email, users.fullName, users.isDemoAccount)
      .orderBy(desc(sql`count(${projects.id})`))
      .limit(10),
    db
      .select({
        period: genPeriodExpr,
        mediaType: generationActions.mediaType,
        count: sql<number>`count(*)::int`,
      })
      .from(generationActions)
      .where(and(...genDateConds))
      .groupBy(genTruncExpr, genPeriodExpr, generationActions.mediaType)
      .orderBy(genTruncExpr),
    db
      .select({
        period: scriptPeriodExpr,
        count: sql<number>`count(*)::int`,
      })
      .from(scriptRevisions)
      .where(and(...scriptDateConds))
      .groupBy(scriptTruncExpr, scriptPeriodExpr)
      .orderBy(scriptTruncExpr),
    db
      .select({
        provider: generationJobs.provider,
        total: sql<number>`count(*)::int`,
        succeeded: sql<number>`count(*) filter (where ${generationJobs.status} = 'succeeded')::int`,
        failed: sql<number>`count(*) filter (where ${generationJobs.status} in ('failed', 'timed_out'))::int`,
      })
      .from(generationJobs)
      .where(
        and(
          lte(generationJobs.createdAt, until),
          ...(since ? [gte(generationJobs.createdAt, since)] : [])
        )
      )
      .groupBy(generationJobs.provider),
    db
      .select({
        model: generationActions.model,
        provider: generationActions.provider,
        count: sql<number>`count(*)::int`,
      })
      .from(generationActions)
      .where(and(...genDateConds))
      .groupBy(generationActions.model, generationActions.provider)
      .orderBy(desc(sql`count(*)`))
      .limit(12),
    db
      .select({
        status: generationJobs.status,
        count: sql<number>`count(*)::int`,
      })
      .from(generationJobs)
      .where(
        and(
          lte(generationJobs.createdAt, until),
          ...(since ? [gte(generationJobs.createdAt, since)] : [])
        )
      )
      .groupBy(generationJobs.status),
    db
      .select({
        totalAttempts: sql<number>`count(*)::int`,
        retriedJobs: sql<number>`count(distinct ${generationAttempts.jobId}) filter (where ${generationAttempts.attemptNumber} > 1)::int`,
        avgDurationMs: sql<number>`coalesce(round(avg(${generationAttempts.durationMs})), 0)::int`,
      })
      .from(generationAttempts)
      .where(
        and(
          lte(generationAttempts.createdAt, until),
          ...(since ? [gte(generationAttempts.createdAt, since)] : [])
        )
      ),
    db
      .select({
        provider: generationActions.provider,
        avgDurationMs: sql<number>`coalesce(round(avg(${generationAttempts.durationMs})), 0)::int`,
        estimatedCostUsd: sql<number>`coalesce(sum((${generationAttempts.usageJson}->>'estimatedCostUsd')::numeric), 0)::float8`,
      })
      .from(generationAttempts)
      .innerJoin(generationActions, eq(generationAttempts.actionId, generationActions.id))
      .where(
        and(
          lte(generationAttempts.createdAt, until),
          ...(since ? [gte(generationAttempts.createdAt, since)] : [])
        )
      )
      .groupBy(generationActions.provider),
    db
      .select({
        assetType: assets.assetType,
        count: sql<number>`count(*)::int`,
        totalBytes: sql<number>`coalesce(sum(${assets.fileSizeBytes}), 0)::bigint`,
      })
      .from(assets)
      .groupBy(assets.assetType),
    db
      .select({
        period: exportPeriodExpr,
        total: sql<number>`count(*)::int`,
        succeeded: sql<number>`count(*) filter (where ${exportsTable.status} = 'succeeded')::int`,
        failed: sql<number>`count(*) filter (where ${exportsTable.status} = 'failed')::int`,
      })
      .from(exportsTable)
      .where(and(...exportDateConds))
      .groupBy(exportTruncExpr, exportPeriodExpr)
      .orderBy(exportTruncExpr),
    db
      .select({
        period: billingPeriodExpr,
        settledCredits: sql<number>`coalesce(sum(case when ${billingTransactions.status} = 'settled' then coalesce(${billingTransactions.actualCredits}, ${billingTransactions.estimatedCredits}) else 0 end), 0)::int`,
        reservedCredits: sql<number>`coalesce(sum(case when ${billingTransactions.status} = 'reserved' then ${billingTransactions.estimatedCredits} else 0 end), 0)::int`,
        refundedCredits: sql<number>`coalesce(sum(case when ${billingTransactions.status} = 'refunded' then ${billingTransactions.estimatedCredits} else 0 end), 0)::int`,
      })
      .from(billingTransactions)
      .where(and(...billingDateConds))
      .groupBy(billingTruncExpr, billingPeriodExpr)
      .orderBy(billingTruncExpr),
    db
      .select({
        provider: billingTransactions.provider,
        settledCredits: sql<number>`coalesce(sum(case when ${billingTransactions.status} = 'settled' then coalesce(${billingTransactions.actualCredits}, ${billingTransactions.estimatedCredits}) else 0 end), 0)::int`,
        reservedCredits: sql<number>`coalesce(sum(case when ${billingTransactions.status} = 'reserved' then ${billingTransactions.estimatedCredits} else 0 end), 0)::int`,
        refundedCredits: sql<number>`coalesce(sum(case when ${billingTransactions.status} = 'refunded' then ${billingTransactions.estimatedCredits} else 0 end), 0)::int`,
      })
      .from(billingTransactions)
      .groupBy(billingTransactions.provider),
    db
      .select({
        provider: sql<string>`coalesce(${scriptRevisions.usageJson}->>'provider', 'unknown')`,
        estimatedCostUsd: sql<number>`coalesce(sum((${scriptRevisions.usageJson}->>'estimatedCostUsd')::numeric), 0)::float8`,
      })
      .from(scriptRevisions)
      .groupBy(sql`coalesce(${scriptRevisions.usageJson}->>'provider', 'unknown')`),
  ]);

  const statusCounts = { Active: 0, Suspended: 0, Banned: 0, 'Soft-Deleted': 0 };
  const roleCounts = { 'Super Admin': 0, Admin: 0, User: 0 };
  const verifCounts = { Verified: 0, Unverified: 0 };
  let totalCreditsBalance = 0;

  for (const u of allUserStatsRows) {
    if (u.deletedAt !== null) statusCounts['Soft-Deleted'] += 1;
    else if (u.accountStatus === 'banned') statusCounts.Banned += 1;
    else if (u.accountStatus === 'suspended' || !u.isActive) statusCounts.Suspended += 1;
    else statusCounts.Active += 1;

    const r = normalizeRole(u.role);
    if (r === 'super_admin') roleCounts['Super Admin'] += 1;
    else if (r === 'admin') roleCounts.Admin += 1;
    else roleCounts.User += 1;

    if (u.isVerified) verifCounts.Verified += 1;
    else verifCounts.Unverified += 1;

    totalCreditsBalance += u.creditsBalance ?? 0;
  }

  const totalProjectsInWindow = projStatusRows.reduce((s, r) => s + r.count, 0);
  const completedProjectsInWindow = projStatusRows.find((r) => r.status === 'completed')?.count ?? 0;

  // Merge generation + script trends by period
  const genPeriodMap = new Map<
    string,
    { period: string; image: number; video: number; audio: number; script: number }
  >();
  const ensureGenPeriod = (period: string) => {
    let entry = genPeriodMap.get(period);
    if (!entry) {
      entry = { period, image: 0, video: 0, audio: 0, script: 0 };
      genPeriodMap.set(period, entry);
    }
    return entry;
  };
  for (const row of genTrendRows) {
    const entry = ensureGenPeriod(row.period);
    if (row.mediaType === 'image') entry.image += row.count;
    else if (row.mediaType === 'video') entry.video += row.count;
    else entry.audio += row.count;
  }
  for (const row of scriptTrendRows) {
    const entry = ensureGenPeriod(row.period);
    entry.script += row.count;
  }
  const generationTrend = Array.from(genPeriodMap.values()).sort((a, b) =>
    a.period.localeCompare(b.period)
  );

  const attemptCostMap = new Map(attemptCostByProviderRows.map((r) => [r.provider, r]));
  const scriptCostMap = new Map(scriptCostByProviderRows.map((r) => [r.provider, r.estimatedCostUsd]));
  const creditByProviderMap = new Map(creditSummaryRows.map((r) => [r.provider, r]));

  const providerComparison = providerRows.map((p) => {
    const att = attemptCostMap.get(p.provider);
    const sCost = scriptCostMap.get(p.provider) ?? 0;
    return {
      provider: p.provider,
      total: p.total,
      succeeded: p.succeeded,
      failed: p.failed,
      avgDurationMs: att?.avgDurationMs ?? 0,
      estimatedCostUsd: Number(((att?.estimatedCostUsd ?? 0) + sCost).toFixed(4)),
    };
  });

  const allProviders = Array.from(
    new Set([...providerRows.map((p) => p.provider), ...creditSummaryRows.map((c) => c.provider)])
  );
  const estimatedCostByProvider = allProviders.map((prov) => {
    const attCost = attemptCostMap.get(prov)?.estimatedCostUsd ?? 0;
    const sCost = scriptCostMap.get(prov) ?? 0;
    const cred = creditByProviderMap.get(prov);
    return {
      provider: prov,
      estimatedCostUsd: Number((attCost + sCost).toFixed(4)),
      settledCredits: cred?.settledCredits ?? 0,
      refundedCredits: cred?.refundedCredits ?? 0,
    };
  });

  const totalSettled = creditSummaryRows.reduce((s, r) => s + r.settledCredits, 0);
  const totalReserved = creditSummaryRows.reduce((s, r) => s + r.reservedCredits, 0);
  const totalRefunded = creditSummaryRows.reduce((s, r) => s + r.refundedCredits, 0);
  const totalEstimatedCostUsd = Number(
    estimatedCostByProvider.reduce((s, r) => s + r.estimatedCostUsd, 0).toFixed(4)
  );

  const ret = retentionRows[0] ?? { active7d: 0, active30d: 0, totalActive: 0 };

  return {
    meta: {
      range: rangeLabel,
      granularity,
      from: since ? since.toISOString() : null,
      to: until.toISOString(),
      generatedAt: new Date().toISOString(),
    },
    users: {
      registrationTrend: regTrendRows,
      activityTrend: actTrendRows,
      statusDistribution: Object.entries(statusCounts).map(([label, value]) => ({ label, value })),
      roleDistribution: Object.entries(roleCounts).map(([label, value]) => ({ label, value })),
      verificationDistribution: Object.entries(verifCounts).map(([label, value]) => ({
        label,
        value,
      })),
      retention: {
        activeLast7d: ret.active7d,
        activeLast30d: ret.active30d,
        totalActiveAccounts: ret.totalActive,
        retention7dPct: ret.totalActive > 0 ? Math.round((ret.active7d / ret.totalActive) * 100) : 0,
        retention30dPct: ret.totalActive > 0 ? Math.round((ret.active30d / ret.totalActive) * 100) : 0,
      },
    },
    projects: {
      createdTrend: projTrendRows,
      statusDistribution: projStatusRows.map((r) => ({ label: r.status, value: r.count })),
      platformDistribution: projPlatformRows.map((r) => ({ label: r.platform, value: r.count })),
      aspectRatioDistribution: projAspectRows.map((r) => ({ label: r.aspectRatio, value: r.count })),
      completionRatePct:
        totalProjectsInWindow > 0
          ? Math.round((completedProjectsInWindow / totalProjectsInWindow) * 100)
          : 0,
      topUsersByProjects: topProjectUsersRows,
    },
    ai: {
      generationTrend,
      providerComparison,
      modelComparison: modelRows,
      jobStatusDistribution: jobStatusRows.map((r) => ({ label: r.status, value: r.count })),
      retryStats: attemptAggRows[0] ?? { totalAttempts: 0, retriedJobs: 0, avgDurationMs: 0 },
      estimatedCostByProvider,
    },
    media: {
      assetTypeDistribution: assetTypeRows.map((r) => ({
        assetType: r.assetType,
        count: r.count,
        totalBytes: Number(r.totalBytes || 0),
      })),
      exportTrend: exportTrendRows,
      totalStorageBytes: assetTypeRows.reduce((s, r) => s + Number(r.totalBytes || 0), 0),
    },
    financial: {
      billingImplemented: false,
      confirmedRevenueUsd: null,
      note: 'Subscription invoicing and Stripe gateway are not enabled. Metrics reflect real PostgreSQL credit reservations, settlements, refunds, and estimated AI operating costs.',
      creditTrend: creditTrendRows,
      creditsSummary: {
        totalBalance: totalCreditsBalance,
        totalSettled,
        totalReserved,
        totalRefunded,
        estimatedAiCostUsd: totalEstimatedCostUsd,
      },
    },
  };
}

ownerRouter.get('/analytics', async (req: AuthRequest, res) => {
  try {
    const data = await computeOwnerAnalytics(req.query);
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Owner analytics error:', error);
    return res.status(500).json({ success: false, message: 'Failed to compute platform analytics.' });
  }
});

ownerRouter.get('/analytics/export', async (req: AuthRequest, res) => {
  try {
    const exportType = typeof req.query.type === 'string' ? req.query.type.trim() : 'overview';
    const analytics = await computeOwnerAnalytics(req.query);

    let rows: string[][] = [];
    let filename = 'briqen-owner-analytics.csv';

    if (exportType === 'users') {
      filename = 'briqen-owner-user-analytics.csv';
      rows = [
        ['period', 'new_registrations', 'demo_accounts', 'real_accounts'],
        ...analytics.users.registrationTrend.map((r) => [
          r.period,
          String(r.count),
          String(r.demoCount),
          String(r.realCount),
        ]),
      ];
    } else if (exportType === 'projects') {
      filename = 'briqen-owner-project-analytics.csv';
      rows = [
        ['period', 'projects_created'],
        ...analytics.projects.createdTrend.map((r) => [r.period, String(r.count)]),
      ];
    } else if (exportType === 'ai') {
      filename = 'briqen-owner-ai-analytics.csv';
      rows = [
        ['provider', 'total_jobs', 'succeeded', 'failed', 'avg_duration_ms', 'estimated_cost_usd'],
        ...analytics.ai.providerComparison.map((p) => [
          p.provider,
          String(p.total),
          String(p.succeeded),
          String(p.failed),
          String(p.avgDurationMs),
          String(p.estimatedCostUsd),
        ]),
      ];
    } else if (exportType === 'financial') {
      filename = 'briqen-owner-financial-credits.csv';
      rows = [
        ['period', 'settled_credits', 'reserved_credits', 'refunded_credits'],
        ...analytics.financial.creditTrend.map((r) => [
          r.period,
          String(r.settledCredits),
          String(r.reservedCredits),
          String(r.refundedCredits),
        ]),
      ];
    } else {
      rows = [
        ['metric', 'value'],
        ['range', analytics.meta.range],
        ['granularity', analytics.meta.granularity],
        ['retention_7d_pct', String(analytics.users.retention.retention7dPct)],
        ['retention_30d_pct', String(analytics.users.retention.retention30dPct)],
        ['project_completion_rate_pct', String(analytics.projects.completionRatePct)],
        ['total_credits_settled', String(analytics.financial.creditsSummary.totalSettled)],
        ['estimated_ai_cost_usd', String(analytics.financial.creditsSummary.estimatedAiCostUsd)],
        ['confirmed_revenue_usd', 'not_implemented'],
      ];
    }

    await recordAdminAuditLog({
      adminId: req.dbUser!.id,
      action: 'owner_export_analytics',
      entityType: 'analytics',
      entityId: exportType,
      outcome: 'success',
      newValues: { exportType, range: analytics.meta.range, granularity: analytics.meta.granularity },
      ipAddress: req.ip,
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(rows.map((r) => r.map(escapeCsvCell).join(',')).join('\n'));
  } catch (error) {
    console.error('Owner analytics CSV export error:', error);
    return res.status(500).json({ success: false, message: 'Failed to export owner analytics.' });
  }
});

// ============================================================================
// 3. Permissions Catalog & Admin Account Management
// ============================================================================
ownerRouter.get('/permissions', async (_req: AuthRequest, res) => {
  try {
    const catalog = await listPermissionsCatalogWithCounts();
    return res.json({ success: true, data: catalog });
  } catch (error) {
    console.error('Owner list permissions error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load permissions catalog.' });
  }
});

ownerRouter.get('/admins', async (_req: AuthRequest, res) => {
  try {
    const adminRows = await db
      .select()
      .from(users)
      .where(or(eq(users.role, 'admin'), eq(users.role, 'super_admin'), eq(users.role, 'moderator')))
      .orderBy(desc(users.role), users.email);

    const adminIds = adminRows.map((a) => a.id);
    const permMap = await getAllAdminsPermissionMap(adminIds);

    const [auditAggRows, banAggRows, sessionAggRows] =
      adminIds.length > 0
        ? await Promise.all([
            db
              .select({
                adminId: adminAuditLogs.adminId,
                totalActions: sql<number>`count(*)::int`,
                deniedActions: sql<number>`count(*) filter (where ${adminAuditLogs.outcome} = 'denied')::int`,
                lastActionAt: sql<Date | null>`max(${adminAuditLogs.createdAt})`,
              })
              .from(adminAuditLogs)
              .where(inArray(adminAuditLogs.adminId, adminIds))
              .groupBy(adminAuditLogs.adminId),
            db
              .select({
                performedBy: userBanHistory.performedBy,
                banActions: sql<number>`count(*)::int`,
              })
              .from(userBanHistory)
              .where(inArray(userBanHistory.performedBy, adminIds))
              .groupBy(userBanHistory.performedBy),
            db
              .select({
                userId: refreshTokens.userId,
                activeSessions: sql<number>`count(*)::int`,
              })
              .from(refreshTokens)
              .where(
                and(
                  inArray(refreshTokens.userId, adminIds),
                  isNull(refreshTokens.revokedAt),
                  sql`${refreshTokens.expiresAt} > now()`
                )
              )
              .groupBy(refreshTokens.userId),
          ])
        : [[], [], []];

    const auditMap = new Map(auditAggRows.map((r) => [r.adminId, r]));
    const banMap = new Map(banAggRows.map((r) => [r.performedBy, r.banActions]));
    const sessionMap = new Map(sessionAggRows.map((r) => [r.userId, r.activeSessions]));

    const items = adminRows.map((row) => {
      const role = normalizeRole(row.role);
      const perms = role === 'super_admin' ? [...ALL_PERMISSION_NAMES] : permMap[row.id] ?? [];
      const audit = auditMap.get(row.id);
      return {
        ...toPublicUser(row, perms),
        permissionCount: perms.length,
        totalActionsPerformed: audit?.totalActions ?? 0,
        deniedAttempts: audit?.deniedActions ?? 0,
        lastAdminActionAt: audit?.lastActionAt ?? null,
        banOperationsCount: banMap.get(row.id) ?? 0,
        activeSessionCount: sessionMap.get(row.id) ?? 0,
      };
    });

    return res.json({ success: true, data: items });
  } catch (error) {
    console.error('Owner list admins error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load administrators.' });
  }
});

const createAdminSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
  username: z
    .string()
    .trim()
    .max(32)
    .refine((v) => v === '' || /^[a-zA-Z0-9_.-]{3,32}$/.test(v), 'Invalid username format.')
    .optional(),
  permissions: z.array(z.string()).optional(),
});

ownerRouter.post('/admins', ownerMutationLimiter, async (req: AuthRequest, res) => {
  const parsed = createAdminSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: parsed.error.issues[0]?.message || 'Invalid Admin creation payload.',
    });
  }

  const complexity = validatePasswordComplexity(parsed.data.password);
  if (!complexity.valid) {
    return res.status(400).json({ success: false, message: complexity.reason });
  }

  const normalizedEmail = parsed.data.email.toLowerCase();
  const normalizedUsername = parsed.data.username?.trim().toLowerCase() || null;
  const passwordHash = await hashPassword(parsed.data.password);

  const requestedPermissions: PermissionName[] = parsed.data.permissions
    ? parsed.data.permissions.filter(isValidPermissionName)
    : [...DEFAULT_ADMIN_PERMISSIONS];

  try {
    const created = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${normalizedEmail}))`);
      const existing = await tx
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${normalizedEmail}`)
        .limit(1);
      if (existing.length > 0) return { status: 'email_taken' as const };

      if (normalizedUsername) {
        const unameConflict = await tx
          .select({ id: users.id })
          .from(users)
          .where(sql`lower(${users.username}) = ${normalizedUsername}`)
          .limit(1);
        if (unameConflict.length > 0) return { status: 'username_taken' as const };
      }

      const [adminRow] = await tx
        .insert(users)
        .values({
          uid: `local:${crypto.randomUUID()}`,
          email: normalizedEmail,
          fullName: parsed.data.fullName,
          displayName: parsed.data.fullName,
          username: normalizedUsername,
          passwordHash,
          passwordChangedAt: new Date(),
          role: 'admin',
          accountStatus: 'active',
          isActive: true,
          isVerified: true,
          isDemoAccount: false,
          creditsBalance: 2500,
          createdByAdminId: req.dbUser!.id,
        })
        .returning();

      await tx.insert(userPreferences).values({ userId: adminRow.id }).onConflictDoNothing();
      await tx.insert(notificationPreferences).values({ userId: adminRow.id }).onConflictDoNothing();

      return { status: 'ok' as const, user: adminRow };
    });

    if (created.status === 'email_taken') {
      return res.status(409).json({ success: false, message: 'Email is already registered.' });
    }
    if (created.status === 'username_taken') {
      return res.status(409).json({ success: false, message: 'Username is already taken.' });
    }

    const assignedPerms = await setAdminPermissions(
      created.user.id,
      requestedPermissions,
      req.dbUser!.id
    );

    await Promise.all([
      recordAdminAuditLog({
        adminId: req.dbUser!.id,
        targetUserId: created.user.id,
        action: 'create_admin',
        entityType: 'user',
        entityId: created.user.id,
        outcome: 'success',
        newValues: { email: created.user.email, role: 'admin', permissions: assignedPerms },
        ipAddress: req.ip,
      }),
      logUserActivity({
        userId: created.user.id,
        activityType: 'admin_created',
        description: `Administrator account created by Super Admin (${req.dbUser!.email}).`,
      }),
    ]);

    return res.status(201).json({
      success: true,
      message: 'Admin account created with assigned permissions.',
      data: toPublicUser(created.user, assignedPerms),
    });
  } catch (error) {
    console.error('Owner create admin error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create Admin account.' });
  }
});

ownerRouter.get('/admins/:adminId', async (req: AuthRequest, res) => {
  const adminId = parseUuid(req.params.adminId);
  if (!adminId) return res.status(400).json({ success: false, message: 'Invalid Admin ID.' });

  try {
    const adminRow = await getUserById(adminId);
    if (!adminRow) return res.status(404).json({ success: false, message: 'Administrator not found.' });

    const role = normalizeRole(adminRow.role);
    if (role !== 'admin' && role !== 'super_admin') {
      return res.status(400).json({ success: false, message: 'Account is not an Administrator.' });
    }

    const [perms, sessions, auditRows, banRows, createdUsersRows, activityRows] = await Promise.all([
      getUserPermissions(adminRow.id, role),
      db
        .select({
          id: refreshTokens.id,
          userAgent: refreshTokens.userAgent,
          ipAddress: refreshTokens.ipAddress,
          rememberMe: refreshTokens.rememberMe,
          createdAt: refreshTokens.createdAt,
          expiresAt: refreshTokens.expiresAt,
          revokedAt: refreshTokens.revokedAt,
        })
        .from(refreshTokens)
        .where(eq(refreshTokens.userId, adminId))
        .orderBy(desc(refreshTokens.createdAt))
        .limit(20),
      db
        .select()
        .from(adminAuditLogs)
        .where(eq(adminAuditLogs.adminId, adminId))
        .orderBy(desc(adminAuditLogs.createdAt))
        .limit(60),
      db
        .select({
          id: userBanHistory.id,
          userId: userBanHistory.userId,
          action: userBanHistory.action,
          banType: userBanHistory.banType,
          reason: userBanHistory.reason,
          createdAt: userBanHistory.createdAt,
          targetEmail: users.email,
        })
        .from(userBanHistory)
        .leftJoin(users, eq(userBanHistory.userId, users.id))
        .where(eq(userBanHistory.performedBy, adminId))
        .orderBy(desc(userBanHistory.createdAt))
        .limit(40),
      db
        .select({ id: users.id, email: users.email, fullName: users.fullName, createdAt: users.createdAt })
        .from(users)
        .where(eq(users.createdByAdminId, adminId))
        .orderBy(desc(users.createdAt))
        .limit(30),
      db
        .select()
        .from(userActivities)
        .where(eq(userActivities.userId, adminId))
        .orderBy(desc(userActivities.createdAt))
        .limit(40),
    ]);

    const targetIds = Array.from(
      new Set(auditRows.map((a) => a.targetUserId).filter((v): v is string => Boolean(v)))
    );
    const targetEmailMap = new Map<string, string>();
    if (targetIds.length > 0) {
      const targetUsers = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(inArray(users.id, targetIds));
      for (const tu of targetUsers) targetEmailMap.set(tu.id, tu.email);
    }

    const managedUserSet = new Set(targetIds);
    const banOps = banRows.filter((b) => b.action === 'ban' || b.action === 'suspend').length;
    const unbanOps = banRows.filter((b) => b.action === 'unban' || b.action === 'restore').length;
    const editOps = auditRows.filter((a) => a.action === 'edit_user' && a.outcome === 'success').length;
    const deniedOps = auditRows.filter((a) => a.outcome === 'denied').length;

    const now = new Date();
    return res.json({
      success: true,
      data: {
        admin: toPublicUser(adminRow, perms),
        permissions: perms,
        stats: {
          totalActions: auditRows.length,
          managedUsersCount: managedUserSet.size,
          createdUsersCount: createdUsersRows.length,
          banOperations: banOps,
          unbanOperations: unbanOps,
          profileEdits: editOps,
          deniedAttempts: deniedOps,
          activeSessions: sessions.filter((s) => !s.revokedAt && s.expiresAt > now).length,
        },
        sessions: sessions.map((s) => ({
          ...s,
          status: s.revokedAt ? 'revoked' : s.expiresAt <= now ? 'expired' : 'active',
        })),
        createdUsers: createdUsersRows,
        banOperations: banRows,
        auditLogs: auditRows.map((a) => ({
          ...a,
          targetEmail: a.targetUserId ? targetEmailMap.get(a.targetUserId) ?? null : null,
        })),
        activities: activityRows,
      },
    });
  } catch (error) {
    console.error('Owner get admin details error:', error);
    return res.status(500).json({ success: false, message: 'Failed to inspect administrator details.' });
  }
});

const updateAdminSchema = z.object({
  fullName: z.string().trim().min(2).max(100).optional(),
  accountStatus: z.enum(['active', 'suspended', 'banned']).optional(),
  role: z.enum(['user', 'admin', 'super_admin']).optional(),
  banReason: z.string().trim().max(500).optional(),
});

ownerRouter.patch('/admins/:adminId', ownerMutationLimiter, async (req: AuthRequest, res) => {
  const adminId = parseUuid(req.params.adminId);
  if (!adminId) return res.status(400).json({ success: false, message: 'Invalid Admin ID.' });

  const parsed = updateAdminSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: parsed.error.issues[0]?.message || 'Invalid admin update payload.',
    });
  }

  try {
    const target = await getUserById(adminId);
    if (!target) return res.status(404).json({ success: false, message: 'Administrator not found.' });

    const currentRole = normalizeRole(target.role);
    const nextRole = parsed.data.role ? normalizeRole(parsed.data.role) : currentRole;
    const nextStatus = parsed.data.accountStatus ?? target.accountStatus;

    // Self-lockout & last active Super Admin protection
    if (
      currentRole === 'super_admin' &&
      (nextRole !== 'super_admin' || nextStatus !== 'active')
    ) {
      if (target.id === req.dbUser!.id) {
        return res.status(409).json({
          success: false,
          message: 'Super Admin cannot demote, suspend, or ban their own active owner session.',
        });
      }
      const activeSupers = await countActiveSuperAdmins();
      if (activeSupers <= 1) {
        return res.status(409).json({
          success: false,
          message: 'Cannot demote or disable the last active Super Admin.',
        });
      }
    }

    const now = new Date();
    const shouldRevokeSessions =
      nextRole !== currentRole || nextStatus !== 'active';

    const [updated] = await db.transaction(async (tx) => {
      if (shouldRevokeSessions) {
        await tx
          .update(refreshTokens)
          .set({ revokedAt: now })
          .where(and(eq(refreshTokens.userId, adminId), isNull(refreshTokens.revokedAt)));
      }

      if (nextRole === 'user') {
        await tx.delete(adminPermissions).where(eq(adminPermissions.adminUserId, adminId));
      }

      return tx
        .update(users)
        .set({
          ...(parsed.data.fullName !== undefined
            ? { fullName: parsed.data.fullName, displayName: parsed.data.fullName }
            : {}),
          role: nextRole,
          accountStatus: nextStatus,
          isActive: nextStatus === 'active',
          ...(nextStatus === 'banned'
            ? {
                banReason: parsed.data.banReason || 'Restricted by Platform Owner.',
                bannedAt: now,
                bannedBy: req.dbUser!.id,
              }
            : nextStatus === 'active'
              ? { banReason: null, banExpiresAt: null, bannedAt: null, bannedBy: null }
              : {}),
          ...(shouldRevokeSessions ? { tokenVersion: sql`${users.tokenVersion} + 1` } : {}),
          updatedAt: now,
        })
        .where(eq(users.id, adminId))
        .returning();
    });

    await recordAdminAuditLog({
      adminId: req.dbUser!.id,
      targetUserId: adminId,
      action: 'owner_update_admin',
      entityType: 'user',
      entityId: adminId,
      outcome: 'success',
      previousValues: { role: currentRole, accountStatus: target.accountStatus },
      newValues: { role: nextRole, accountStatus: nextStatus },
      ipAddress: req.ip,
    });

    const perms = await getUserPermissions(updated.id, updated.role);
    return res.json({
      success: true,
      message: 'Administrator account updated.',
      data: toPublicUser(updated, perms),
    });
  } catch (error) {
    console.error('Owner update admin error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update administrator.' });
  }
});

const assignPermissionsSchema = z.object({
  permissions: z.array(z.string()),
  scopeJson: z.record(z.string(), z.unknown()).nullable().optional(),
});

ownerRouter.put('/admins/:adminId/permissions', ownerMutationLimiter, async (req: AuthRequest, res) => {
  const adminId = parseUuid(req.params.adminId);
  if (!adminId) return res.status(400).json({ success: false, message: 'Invalid Admin ID.' });

  const parsed = assignPermissionsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Invalid permissions payload.' });
  }

  try {
    const target = await getUserById(adminId);
    if (!target) return res.status(404).json({ success: false, message: 'Administrator not found.' });

    const role = normalizeRole(target.role);
    if (role === 'super_admin') {
      return res.status(400).json({
        success: false,
        message: 'Super Admin accounts inherently hold unrestricted platform permissions.',
      });
    }
    if (role !== 'admin') {
      return res.status(400).json({
        success: false,
        message: 'Granular permissions can only be assigned to Admin accounts.',
      });
    }

    const previousPerms = await getUserPermissions(adminId, role);
    const validNext = parsed.data.permissions.filter(isValidPermissionName);
    const updatedPerms = await setAdminPermissions(
      adminId,
      validNext,
      req.dbUser!.id,
      parsed.data.scopeJson ?? null
    );

    await Promise.all([
      recordAdminAuditLog({
        adminId: req.dbUser!.id,
        targetUserId: adminId,
        action: 'update_admin_permissions',
        entityType: 'admin_permissions',
        entityId: adminId,
        outcome: 'success',
        previousValues: { permissions: previousPerms },
        newValues: { permissions: updatedPerms },
        ipAddress: req.ip,
      }),
      logUserActivity({
        userId: adminId,
        activityType: 'permissions_updated',
        description: `Admin permissions updated (${updatedPerms.length} granted) by ${req.dbUser!.email}.`,
      }),
    ]);

    return res.json({
      success: true,
      message: 'Admin permissions updated.',
      data: {
        adminId,
        permissions: updatedPerms,
      },
    });
  } catch (error) {
    console.error('Owner assign permissions error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update admin permissions.' });
  }
});

// ============================================================================
// 4. Owner Projects Governance
// ============================================================================
ownerRouter.get('/projects', async (req: AuthRequest, res) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : 'all';
    const platform = typeof req.query.platform === 'string' ? req.query.platform.trim() : 'all';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const offset = (page - 1) * limit;

    const conditions = [];
    if (status && status !== 'all') conditions.push(eq(projects.status, status));
    if (platform && platform !== 'all') conditions.push(eq(projects.platform, platform));
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        or(ilike(projects.title, pattern), ilike(users.email, pattern), ilike(projects.brandName, pattern))!
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const [totalRows, rows] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(projects)
        .innerJoin(users, eq(projects.userId, users.id))
        .where(whereClause),
      db
        .select({
          id: projects.id,
          userId: projects.userId,
          userEmail: users.email,
          userFullName: users.fullName,
          isDemoAccount: users.isDemoAccount,
          title: projects.title,
          brandName: projects.brandName,
          platform: projects.platform,
          aspectRatio: projects.aspectRatio,
          status: projects.status,
          createdAt: projects.createdAt,
          updatedAt: projects.updatedAt,
        })
        .from(projects)
        .innerJoin(users, eq(projects.userId, users.id))
        .where(whereClause)
        .orderBy(desc(projects.updatedAt))
        .limit(limit)
        .offset(offset),
    ]);

    const total = totalRows[0]?.count ?? 0;
    return res.json({
      success: true,
      data: {
        items: rows,
        pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
      },
    });
  } catch (error) {
    console.error('Owner projects error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load platform projects.' });
  }
});

ownerRouter.delete('/projects/:projectId', ownerMutationLimiter, async (req: AuthRequest, res) => {
  const projectId = parseUuid(req.params.projectId);
  if (!projectId) return res.status(400).json({ success: false, message: 'Invalid project ID.' });

  try {
    const existingRows = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ success: false, message: 'Project not found.' });

    await db.delete(projects).where(eq(projects.id, projectId));

    await recordAdminAuditLog({
      adminId: req.dbUser!.id,
      targetUserId: existing.userId,
      action: 'owner_delete_project',
      entityType: 'project',
      entityId: projectId,
      outcome: 'success',
      previousValues: { title: existing.title, status: existing.status },
      ipAddress: req.ip,
    });

    return res.json({ success: true, message: `Deleted project "${existing.title}".` });
  } catch (error) {
    console.error('Owner delete project error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete project.' });
  }
});

// ============================================================================
// 5. System Configuration, AI Providers (Masked), Storage & Platform Health
// ============================================================================
ownerRouter.get('/system', async (_req: AuthRequest, res) => {
  try {
    const [settings, aiConfig, assetStorageRows, exportStorageRows, jobHealthRows] = await Promise.all([
      getMergedSystemSettings(),
      Promise.resolve(loadAIConfig()),
      db
        .select({
          count: sql<number>`count(*)::int`,
          bytes: sql<number>`coalesce(sum(${assets.fileSizeBytes}), 0)::bigint`,
        })
        .from(assets),
      db
        .select({
          count: sql<number>`count(*)::int`,
          bytes: sql<number>`coalesce(sum(${exportsTable.fileSizeBytes}), 0)::bigint`,
        })
        .from(exportsTable),
      db
        .select({
          status: generationJobs.status,
          count: sql<number>`count(*)::int`,
        })
        .from(generationJobs)
        .groupBy(generationJobs.status),
    ]);

    return res.json({
      success: true,
      data: {
        settings,
        aiProviders: {
          llmProvider: aiConfig.llmProvider,
          imageProvider: aiConfig.imageProvider,
          videoProvider: aiConfig.videoProvider,
          requestTimeoutSec: aiConfig.requestTimeoutSec,
          maxRetries: aiConfig.maxRetries,
          geminiConfigured: aiConfig.geminiConfigured,
          openaiConfigured: aiConfig.openaiConfigured,
          openaiVideoConfigured: aiConfig.openaiVideoConfigured,
          warnings: aiConfig.warnings,
        },
        storage: {
          assetsCount: assetStorageRows[0]?.count ?? 0,
          assetsBytes: Number(assetStorageRows[0]?.bytes ?? 0),
          exportsCount: exportStorageRows[0]?.count ?? 0,
          exportsBytes: Number(exportStorageRows[0]?.bytes ?? 0),
          totalBytes:
            Number(assetStorageRows[0]?.bytes ?? 0) + Number(exportStorageRows[0]?.bytes ?? 0),
        },
        health: {
          databaseConnected: true,
          ownerRecoveryConfigured: Boolean(
            process.env.OWNER_RECOVERY_KEY && process.env.OWNER_RECOVERY_KEY.trim().length >= 16
          ),
          jobsByStatus: Object.fromEntries(jobHealthRows.map((r) => [r.status, r.count])),
        },
      },
    });
  } catch (error) {
    console.error('Owner system config get error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load system settings.' });
  }
});

const updateSystemSchema = z.object({
  general: z
    .object({
      platformName: z.string().trim().min(2).max(120).optional(),
      supportEmail: z.string().trim().email().optional(),
      maintenanceMode: z.boolean().optional(),
      registrationEnabled: z.boolean().optional(),
      requireEmailVerification: z.boolean().optional(),
      defaultStartingCredits: z.number().int().min(0).max(100_000).optional(),
    })
    .optional(),
  aiDefaults: z
    .object({
      scriptModelTier: z.enum(['fast', 'balanced', 'quality']).optional(),
      maxScenesPerStoryboard: z.number().int().min(1).max(30).optional(),
      defaultAspectRatio: z.enum(['16:9', '9:16', '1:1', '4:3']).optional(),
      allowMockFallback: z.boolean().optional(),
    })
    .optional(),
  security: z
    .object({
      sessionTimeoutMinutes: z.number().int().min(15).max(43200).optional(),
      maxActiveSessionsPerUser: z.number().int().min(1).max(50).optional(),
      enforceStrongPasswords: z.boolean().optional(),
      auditRetentionDays: z.number().int().min(30).max(3650).optional(),
    })
    .optional(),
  featureFlags: z
    .object({
      quickDraftExport: z.boolean().optional(),
      projectTemplates: z.boolean().optional(),
      aiImageGeneration: z.boolean().optional(),
      aiVideoGeneration: z.boolean().optional(),
      aiAudioGeneration: z.boolean().optional(),
    })
    .optional(),
});

ownerRouter.patch('/system', ownerMutationLimiter, async (req: AuthRequest, res) => {
  const parsed = updateSystemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: parsed.error.issues[0]?.message || 'Invalid system settings payload.',
    });
  }

  try {
    const previous = await getMergedSystemSettings();
    const now = new Date();
    const sections = ['general', 'aiDefaults', 'security', 'featureFlags'] as const;

    await db.transaction(async (tx) => {
      for (const section of sections) {
        const incoming = parsed.data[section];
        if (!incoming) continue;
        const merged = { ...(previous[section] as Record<string, unknown>), ...incoming };
        await tx
          .insert(platformSettings)
          .values({
            key: section,
            valueJson: merged,
            updatedBy: req.dbUser!.id,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: platformSettings.key,
            set: {
              valueJson: merged,
              updatedBy: req.dbUser!.id,
              updatedAt: now,
            },
          });
      }
    });

    const nextSettings = await getMergedSystemSettings();

    await recordAdminAuditLog({
      adminId: req.dbUser!.id,
      action: 'owner_update_system_settings',
      entityType: 'platform_settings',
      entityId: 'global',
      outcome: 'success',
      previousValues: {
        general: previous.general,
        aiDefaults: previous.aiDefaults,
        security: previous.security,
        featureFlags: previous.featureFlags,
      },
      newValues: {
        general: nextSettings.general,
        aiDefaults: nextSettings.aiDefaults,
        security: nextSettings.security,
        featureFlags: nextSettings.featureFlags,
      },
      ipAddress: req.ip,
    });

    return res.json({
      success: true,
      message: 'Platform configuration saved.',
      data: nextSettings,
    });
  } catch (error) {
    console.error('Owner update system settings error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update platform settings.' });
  }
});

// ============================================================================
// 6. Complete Platform Audit Logs & Export
// ============================================================================
ownerRouter.get('/audit-logs', async (req: AuthRequest, res) => {
  try {
    const action = typeof req.query.action === 'string' ? req.query.action.trim() : 'all';
    const outcome = typeof req.query.outcome === 'string' ? req.query.outcome.trim() : 'all';
    const adminId = typeof req.query.adminId === 'string' ? parseUuid(req.query.adminId) : null;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 35));
    const offset = (page - 1) * limit;

    const conditions = [];
    if (action && action !== 'all') conditions.push(eq(adminAuditLogs.action, action));
    if (outcome && outcome !== 'all') conditions.push(eq(adminAuditLogs.outcome, outcome));
    if (adminId) conditions.push(eq(adminAuditLogs.adminId, adminId));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const [totalRows, logs] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(adminAuditLogs).where(whereClause),
      db
        .select()
        .from(adminAuditLogs)
        .where(whereClause)
        .orderBy(desc(adminAuditLogs.createdAt))
        .limit(limit)
        .offset(offset),
    ]);

    const actorIds = new Set<string>();
    for (const l of logs) {
      if (l.adminId) actorIds.add(l.adminId);
      if (l.targetUserId) actorIds.add(l.targetUserId);
    }
    const emailMap = new Map<string, string>();
    if (actorIds.size > 0) {
      const actorRows = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(inArray(users.id, Array.from(actorIds)));
      for (const r of actorRows) emailMap.set(r.id, r.email);
    }

    const total = totalRows[0]?.count ?? 0;
    return res.json({
      success: true,
      data: {
        items: logs.map((l) => ({
          ...l,
          adminEmail: l.adminId ? emailMap.get(l.adminId) ?? null : null,
          targetEmail: l.targetUserId ? emailMap.get(l.targetUserId) ?? null : null,
        })),
        pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
      },
    });
  } catch (error) {
    console.error('Owner audit logs error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load platform audit logs.' });
  }
});

ownerRouter.get('/audit-logs/export', async (req: AuthRequest, res) => {
  try {
    const logs = await db
      .select()
      .from(adminAuditLogs)
      .orderBy(desc(adminAuditLogs.createdAt))
      .limit(2500);

    const header = ['id', 'created_at', 'admin_id', 'target_user_id', 'action', 'entity_type', 'entity_id', 'outcome', 'ip_address'];
    const lines = logs.map((l) =>
      [
        l.id,
        l.createdAt.toISOString(),
        l.adminId || '',
        l.targetUserId || '',
        l.action,
        l.entityType,
        l.entityId || '',
        l.outcome,
        l.ipAddress || '',
      ]
        .map(escapeCsvCell)
        .join(',')
    );

    await recordAdminAuditLog({
      adminId: req.dbUser!.id,
      action: 'owner_export_audit_logs',
      entityType: 'audit_logs',
      entityId: 'csv',
      outcome: 'success',
      newValues: { rowCount: logs.length },
      ipAddress: req.ip,
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="briqen-owner-audit-logs.csv"');
    return res.send([header.map(escapeCsvCell).join(','), ...lines].join('\n'));
  } catch (error) {
    console.error('Owner audit export error:', error);
    return res.status(500).json({ success: false, message: 'Failed to export audit logs.' });
  }
});
