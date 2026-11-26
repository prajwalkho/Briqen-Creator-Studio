import crypto from 'crypto';
import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import {
  and,
  asc,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from 'drizzle-orm';
import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import {
  adminAuditLogs,
  assets,
  billingTransactions,
  emailVerificationTokens,
  exportJobs,
  exportsTable,
  generationActions,
  generationAttempts,
  generationJobs,
  notificationPreferences,
  passwordResetTokens,
  projects,
  refreshTokens,
  scenes,
  scriptRevisions,
  userActivities,
  userBanHistory,
  userPreferences,
  users,
} from '../../db/schema.ts';
import {
  getOrCreateNotificationPreferences,
  getOrCreateUserPreferences,
  getUserById,
  toPublicUser,
} from '../../db/users.ts';
import { type AuthRequest, requireAuth } from '../../middleware/auth.ts';
import { getAllAdminsPermissionMap } from '../auth/permissions.ts';
import {
  canBanTargetUser,
  canChangeTargetRole,
  canEditTargetUser,
  canSoftDeleteTargetUser,
  normalizeRole,
  requirePermission,
  requireRole,
} from '../auth/rbac.ts';
import {
  generateOpaqueToken,
  hashOpaqueToken,
  hashPassword,
  RESET_TOKEN_TTL_MS,
  validatePasswordComplexity,
  VERIFY_TOKEN_TTL_MS,
} from '../auth/security.ts';
import { getDemoConfig } from '../seeders/demoConfig.ts';
import {
  logUserActivity,
  recordAdminAuditLog,
  syncExpiredBanIfNeeded,
} from '../services/activityService.ts';
import { createSignedMediaUrl, deleteObject, saveObject } from '../storage.ts';
import { retryGenerationJob } from '../workers/jobWorker.ts';

const execFileAsync = promisify(execFile);

export const adminRouter = Router();

// Sliding-window rate limiter for sensitive administrative mutations
const adminActionBuckets = new Map<string, { count: number; resetAt: number }>();
function adminMutationLimiter(req: AuthRequest, res: Response, next: NextFunction) {
  const actor = req.dbUser?.id || req.ip || 'anon';
  const key = `${req.method}:${req.path}:${actor}`;
  const now = Date.now();
  const entry = adminActionBuckets.get(key);
  if (!entry || now > entry.resetAt) {
    adminActionBuckets.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return next();
  }
  entry.count += 1;
  if (entry.count > 120) {
    const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    res.setHeader('Retry-After', String(retryAfterSec));
    return res.status(429).json({
      success: false,
      message: 'Too many administrative actions in a short window. Please pause and retry.',
    });
  }
  return next();
}

const uuidParamSchema = z.string().uuid();
function parseUuidParam(val: string | undefined): string | null {
  if (!val) return null;
  const parsed = uuidParamSchema.safeParse(val);
  return parsed.success ? parsed.data : null;
}

function normalizeOptionalString(val: string | null | undefined): string | null | undefined {
  if (val === undefined) return undefined;
  if (val === null) return null;
  const trimmed = val.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function isValidHttpUrl(value: string, expectedHosts?: string[]): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    if (!url.hostname || !url.hostname.includes('.')) return false;
    if (expectedHosts && expectedHosts.length > 0) {
      const host = url.hostname.toLowerCase();
      return expectedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
    }
    return true;
  } catch {
    return false;
  }
}

const optionalUrlSchema = (label: string, expectedHosts?: string[]) =>
  z
    .string()
    .trim()
    .max(300, `${label} must be 300 characters or fewer.`)
    .refine(
      (val) => val === '' || isValidHttpUrl(val, expectedHosts),
      expectedHosts
        ? `${label} must be a valid ${expectedHosts[0]} URL starting with https:// or http://.`
        : `${label} must be a valid URL starting with https:// or http://.`
    )
    .nullable()
    .optional();

// Avatar upload handling for admin user management
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED_AVATAR_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const ALLOWED_AVATAR_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AVATAR_BYTES },
});

function handleAvatarMulter(req: Request, res: Response, next: NextFunction) {
  avatarUpload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'Profile picture must be 5 MB or smaller.',
        });
      }
      return res.status(400).json({ success: false, message: err.message });
    }
    if (err) {
      return res.status(400).json({ success: false, message: 'Invalid image upload.' });
    }
    return next();
  });
}

function detectImageFormat(buf: Buffer): 'jpeg' | 'png' | 'webp' | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'png';
  }
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

async function resizeAndOptimizeAvatar(
  buffer: Buffer,
  detectedFormat: 'jpeg' | 'png' | 'webp'
): Promise<{ buffer: Buffer; mimeType: string; extension: string }> {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'briqen-admin-avatar-'));
  const inputPath = path.join(tmpDir, `input.${detectedFormat === 'jpeg' ? 'jpg' : detectedFormat}`);
  const outputPath = path.join(tmpDir, 'avatar.webp');
  try {
    await fs.promises.writeFile(inputPath, buffer);
    await execFileAsync('ffmpeg', [
      '-y',
      '-i',
      inputPath,
      '-vf',
      'scale=512:512:force_original_aspect_ratio=increase,crop=512:512',
      '-c:v',
      'libwebp',
      '-quality',
      '86',
      '-frames:v',
      '1',
      outputPath,
    ]);
    const optimized = await fs.promises.readFile(outputPath);
    if (optimized.byteLength === 0) {
      throw new Error('Processed avatar output was empty.');
    }
    return { buffer: optimized, mimeType: 'image/webp', extension: 'webp' };
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
}

async function deleteStorageKeyIfUnreferenced(storageKey: string | null | undefined): Promise<void> {
  if (!storageKey) return;
  if (storageKey.startsWith('demo/')) return;
  const [userRef, assetRef, exportRef] = await Promise.all([
    db.select({ id: users.id }).from(users).where(eq(users.profileImageKey, storageKey)).limit(1),
    db.select({ id: assets.id }).from(assets).where(eq(assets.storageKey, storageKey)).limit(1),
    db.select({ id: exportsTable.id }).from(exportsTable).where(eq(exportsTable.storageKey, storageKey)).limit(1),
  ]);
  if (userRef.length === 0 && assetRef.length === 0 && exportRef.length === 0) {
    await deleteObject(storageKey);
  }
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

function canAdminInspectTarget(callerRoleRaw: string, targetRoleRaw: string): boolean {
  if (normalizeRole(callerRoleRaw) === 'super_admin') return true;
  return normalizeRole(targetRoleRaw) === 'user';
}

function escapeCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

// All /api/v1/admin/* endpoints require authentication
adminRouter.use(requireAuth);

// 1. Bootstrap Super Admin (ONLY available if 0 active super_admin accounts exist in DB)
adminRouter.get('/bootstrap-status', async (req: AuthRequest, res) => {
  try {
    const superAdminCount = await countActiveSuperAdmins();
    return res.json({
      success: true,
      data: {
        needsBootstrap: superAdminCount === 0,
        superAdminCount,
        callerRole: normalizeRole(req.dbUser?.role),
      },
    });
  } catch (error) {
    console.error('Bootstrap status error:', error);
    return res.status(500).json({ success: false, message: 'Failed to check bootstrap status.' });
  }
});

adminRouter.post('/bootstrap-super-admin', adminMutationLimiter, async (req: AuthRequest, res) => {
  try {
    const outcome = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('briqen-bootstrap-super-admin'))`);

      const existingSuper = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, 'super_admin'), isNull(users.deletedAt)))
        .limit(1);

      if (existingSuper.length > 0) {
        return { allowed: false as const };
      }

      const [promoted] = await tx
        .update(users)
        .set({
          role: 'super_admin',
          accountStatus: 'active',
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(users.id, req.dbUser!.id))
        .returning();

      return { allowed: true as const, user: promoted };
    });

    if (!outcome.allowed || !outcome.user) {
      await recordAdminAuditLog({
        adminId: req.dbUser!.id,
        targetUserId: req.dbUser!.id,
        action: 'bootstrap_super_admin',
        entityType: 'user',
        entityId: req.dbUser!.id,
        outcome: 'denied',
        ipAddress: req.ip,
      });
      return res.status(403).json({
        success: false,
        message: 'A Super Admin account already exists. Ask an existing Super Admin to grant privileges.',
      });
    }

    await recordAdminAuditLog({
      adminId: outcome.user.id,
      targetUserId: outcome.user.id,
      action: 'bootstrap_super_admin',
      entityType: 'user',
      entityId: outcome.user.id,
      outcome: 'success',
      previousValues: { role: normalizeRole(req.dbUser!.role) },
      newValues: { role: 'super_admin' },
      ipAddress: req.ip,
    });

    await logUserActivity({
      userId: outcome.user.id,
      activityType: 'role_changed',
      description: 'Initialized primary Super Admin role via workspace bootstrap.',
    });

    return res.json({
      success: true,
      message: 'Primary Super Admin privileges activated.',
      data: { user: toPublicUser(outcome.user) },
    });
  } catch (error) {
    console.error('Bootstrap super admin error:', error);
    return res.status(500).json({ success: false, message: 'Failed to initialize Super Admin.' });
  }
});

// Protect all administrative endpoints below for admin | super_admin
adminRouter.use(requireRole('admin', 'super_admin'));

// 2. Dashboard Metrics & Overview
adminRouter.get('/dashboard/stats', requirePermission('analytics.operational.view'), async (req: AuthRequest, res) => {
  try {
    const demoCfg = getDemoConfig();
    const callerPerms = req.dbUser?.permissions ?? [];
    const canViewFinancial =
      normalizeRole(req.dbUser?.role) === 'super_admin' || callerPerms.includes('financial.view');
    const [
      userRows,
      projCountRows,
      scriptCountRows,
      sceneCountRows,
      genActionRows,
      assetCountRows,
      exportCountRows,
      failedJobCountRows,
      recentUsersRows,
      recentActivityRows,
      recentBanRows,
      recentFailedJobsRows,
    ] = await Promise.all([
      db
        .select({
          id: users.id,
          role: users.role,
          accountStatus: users.accountStatus,
          isActive: users.isActive,
          isVerified: users.isVerified,
          isDemoAccount: users.isDemoAccount,
          deletedAt: users.deletedAt,
        })
        .from(users),
      db.select({ count: sql<number>`count(*)::int` }).from(projects),
      db.select({ count: sql<number>`count(*)::int` }).from(scriptRevisions),
      db.select({ count: sql<number>`count(*)::int` }).from(scenes),
      db
        .select({
          mediaType: generationActions.mediaType,
          count: sql<number>`count(*)::int`,
        })
        .from(generationActions)
        .groupBy(generationActions.mediaType),
      db.select({ count: sql<number>`count(*)::int` }).from(assets),
      db.select({ count: sql<number>`count(*)::int` }).from(exportsTable),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(generationJobs)
        .where(inArray(generationJobs.status, ['failed', 'timed_out'])),
      db
        .select()
        .from(users)
        .orderBy(desc(users.createdAt))
        .limit(8),
      db
        .select({
          id: userActivities.id,
          userId: userActivities.userId,
          activityType: userActivities.activityType,
          description: userActivities.description,
          relatedProjectId: userActivities.relatedProjectId,
          relatedAssetId: userActivities.relatedAssetId,
          metadata: userActivities.metadata,
          createdAt: userActivities.createdAt,
          userEmail: users.email,
          userFullName: users.fullName,
          userRole: users.role,
          isDemoAccount: users.isDemoAccount,
        })
        .from(userActivities)
        .leftJoin(users, eq(userActivities.userId, users.id))
        .orderBy(desc(userActivities.createdAt))
        .limit(12),
      db
        .select({
          id: userBanHistory.id,
          userId: userBanHistory.userId,
          action: userBanHistory.action,
          banType: userBanHistory.banType,
          reason: userBanHistory.reason,
          expiresAt: userBanHistory.expiresAt,
          createdAt: userBanHistory.createdAt,
          targetEmail: users.email,
          targetName: users.fullName,
        })
        .from(userBanHistory)
        .leftJoin(users, eq(userBanHistory.userId, users.id))
        .orderBy(desc(userBanHistory.createdAt))
        .limit(8),
      db
        .select({
          id: generationJobs.id,
          projectId: generationJobs.projectId,
          userId: generationJobs.userId,
          provider: generationJobs.provider,
          status: generationJobs.status,
          errorMessage: generationJobs.errorMessage,
          attemptCount: generationJobs.attemptCount,
          createdAt: generationJobs.createdAt,
          mediaType: generationActions.mediaType,
          userEmail: users.email,
        })
        .from(generationJobs)
        .leftJoin(generationActions, eq(generationJobs.actionId, generationActions.id))
        .leftJoin(users, eq(generationJobs.userId, users.id))
        .where(inArray(generationJobs.status, ['failed', 'timed_out']))
        .orderBy(desc(generationJobs.createdAt))
        .limit(8),
    ]);

    let activeUsers = 0;
    let bannedUsers = 0;
    let suspendedUsers = 0;
    let deletedUsers = 0;
    let verifiedUsers = 0;
    let unverifiedUsers = 0;
    let demoAccountsTotal = 0;
    let demoSuperAdmins = 0;
    let demoAdmins = 0;
    let demoRegularUsers = 0;
    let realUsersTotal = 0;

    const roleBreakdown = {
      super_admin: 0,
      admin: 0,
      user: 0,
    };

    for (const u of userRows) {
      const role = normalizeRole(u.role);
      roleBreakdown[role] += 1;

      if (u.deletedAt !== null) {
        deletedUsers += 1;
      } else if (u.accountStatus === 'banned') {
        bannedUsers += 1;
      } else if (u.accountStatus === 'suspended' || !u.isActive) {
        suspendedUsers += 1;
      } else {
        activeUsers += 1;
      }

      if (u.isVerified) verifiedUsers += 1;
      else unverifiedUsers += 1;

      if (u.isDemoAccount) {
        demoAccountsTotal += 1;
        if (role === 'super_admin') demoSuperAdmins += 1;
        else if (role === 'admin') demoAdmins += 1;
        else if (role === 'user') demoRegularUsers += 1;
      } else {
        realUsersTotal += 1;
      }
    }

    const genCounts = new Map<string, number>();
    for (const row of genActionRows) {
      genCounts.set(row.mediaType, row.count);
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
        demoAccountsTotal,
        demoSuperAdmins,
        demoAdmins,
        demoRegularUsers,
        realUsersTotal,
        demoModeEnabled: !demoCfg.isProduction && demoCfg.demoAccountsEnabled,
        roleBreakdown,
        totalProjects: projCountRows[0]?.count ?? 0,
        totalScripts: scriptCountRows[0]?.count ?? 0,
        totalScenes: sceneCountRows[0]?.count ?? 0,
        totalImageGenerations: genCounts.get('image') ?? 0,
        totalVideoGenerations: genCounts.get('video') ?? 0,
        totalAudioGenerations:
          (genCounts.get('audio_tts') ?? 0) + (genCounts.get('audio_music') ?? 0),
        totalAssets: assetCountRows[0]?.count ?? 0,
        totalExports: exportCountRows[0]?.count ?? 0,
        failedJobs: failedJobCountRows[0]?.count ?? 0,
        recentRegistrations: recentUsersRows.map(toPublicUser),
        recentActivities: recentActivityRows,
        recentBans: recentBanRows,
        recentFailedJobs: recentFailedJobsRows,
        financialScopeGranted: canViewFinancial,
      },
    });
  } catch (error) {
    console.error('Admin dashboard stats error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load admin dashboard stats.' });
  }
});

adminRouter.get('/dashboard/activity', requirePermission('analytics.operational.view'), async (req: AuthRequest, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const rows = await db
      .select({
        id: userActivities.id,
        userId: userActivities.userId,
        activityType: userActivities.activityType,
        description: userActivities.description,
        relatedProjectId: userActivities.relatedProjectId,
        relatedAssetId: userActivities.relatedAssetId,
        metadata: userActivities.metadata,
        createdAt: userActivities.createdAt,
        userEmail: users.email,
        userFullName: users.fullName,
        userRole: users.role,
        isDemoAccount: users.isDemoAccount,
      })
      .from(userActivities)
      .leftJoin(users, eq(userActivities.userId, users.id))
      .orderBy(desc(userActivities.createdAt))
      .limit(limit);

    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Admin dashboard activity error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load platform activity.' });
  }
});

adminRouter.get('/dashboard/registrations', requirePermission('analytics.operational.view'), async (req: AuthRequest, res) => {
  try {
    const days = Math.min(90, Math.max(7, Number(req.query.days) || 30));
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);
    const rows = await db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${users.createdAt}), 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(users)
      .where(gt(users.createdAt, since))
      .groupBy(sql`date_trunc('day', ${users.createdAt})`)
      .orderBy(sql`date_trunc('day', ${users.createdAt})`);

    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Admin registration trend error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load registration trends.' });
  }
});

// 3. List & Filter Users
adminRouter.get('/users', requirePermission('users.view'), async (req: AuthRequest, res) => {
  try {
    const callerRole = normalizeRole(req.dbUser!.role);
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : 'all';
    const roleFilter = typeof req.query.role === 'string' ? req.query.role.trim() : 'all';
    const sort = typeof req.query.sort === 'string' ? req.query.sort.trim() : 'created_desc';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const conditions = [];

    if (search) {
      const pattern = `%${search}%`;
      const maybeUuid = uuidParamSchema.safeParse(search).success ? search : null;
      const searchCond = [
        ilike(users.fullName, pattern),
        ilike(users.displayName, pattern),
        ilike(users.username, pattern),
        ilike(users.email, pattern),
        ilike(users.phoneNumber, pattern),
      ];
      if (maybeUuid) {
        searchCond.push(eq(users.id, maybeUuid));
      }
      conditions.push(or(...searchCond)!);
    }

    if (status === 'demo') {
      conditions.push(eq(users.isDemoAccount, true));
    } else if (status === 'real') {
      conditions.push(eq(users.isDemoAccount, false));
    } else if (status === 'active') {
      conditions.push(
        and(eq(users.accountStatus, 'active'), eq(users.isActive, true), isNull(users.deletedAt))!
      );
    } else if (status === 'banned') {
      conditions.push(and(eq(users.accountStatus, 'banned'), isNull(users.deletedAt))!);
    } else if (status === 'suspended') {
      conditions.push(
        and(
          or(eq(users.accountStatus, 'suspended'), eq(users.isActive, false))!,
          isNull(users.deletedAt)
        )!
      );
    } else if (status === 'deleted') {
      conditions.push(isNotNull(users.deletedAt));
    } else if (status === 'verified') {
      conditions.push(eq(users.isVerified, true));
    } else if (status === 'unverified') {
      conditions.push(eq(users.isVerified, false));
    }

    if (callerRole !== 'super_admin') {
      // Worker Admins manage regular users only (never inspect Admin/Super Admin accounts)
      conditions.push(or(eq(users.role, 'user'), eq(users.role, 'creator'))!);
    } else if (roleFilter !== 'all') {
      const normalized = normalizeRole(roleFilter);
      if (normalized === 'user') {
        conditions.push(or(eq(users.role, 'user'), eq(users.role, 'creator'))!);
      } else if (normalized === 'admin') {
        conditions.push(or(eq(users.role, 'admin'), eq(users.role, 'moderator'))!);
      } else {
        conditions.push(eq(users.role, normalized));
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const orderBy =
      sort === 'created_asc'
        ? asc(users.createdAt)
        : sort === 'name_asc'
          ? asc(users.fullName)
          : sort === 'last_login_desc'
            ? desc(users.lastLoginAt)
            : desc(users.createdAt);

    const [totalRows, userRows] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(whereClause),
      db
        .select()
        .from(users)
        .where(whereClause)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset),
    ]);

    const userIds = userRows.map((u) => u.id);
    const projectCountsMap = new Map<string, number>();
    const scriptCountsMap = new Map<string, number>();
    const genCountsMap = new Map<string, number>();

    if (userIds.length > 0) {
      const [projCounts, scriptCounts, genCounts] = await Promise.all([
        db
          .select({ userId: projects.userId, count: sql<number>`count(*)::int` })
          .from(projects)
          .where(inArray(projects.userId, userIds))
          .groupBy(projects.userId),
        db
          .select({ userId: projects.userId, count: sql<number>`count(*)::int` })
          .from(scriptRevisions)
          .innerJoin(projects, eq(scriptRevisions.projectId, projects.id))
          .where(inArray(projects.userId, userIds))
          .groupBy(projects.userId),
        db
          .select({ userId: generationActions.userId, count: sql<number>`count(*)::int` })
          .from(generationActions)
          .where(inArray(generationActions.userId, userIds))
          .groupBy(generationActions.userId),
      ]);

      for (const r of projCounts) projectCountsMap.set(r.userId, r.count);
      for (const r of scriptCounts) scriptCountsMap.set(r.userId, r.count);
      for (const r of genCounts) genCountsMap.set(r.userId, r.count);
    }

    const adminIdsInPage = userRows
      .filter((r) => normalizeRole(r.role) === 'admin')
      .map((r) => r.id);
    const adminPermsMap =
      callerRole === 'super_admin' && adminIdsInPage.length > 0
        ? await getAllAdminsPermissionMap(adminIdsInPage)
        : {};

    const items = userRows.map((row) => ({
      ...toPublicUser(
        row,
        normalizeRole(row.role) === 'admin' ? adminPermsMap[row.id] ?? [] : undefined
      ),
      projectCount: projectCountsMap.get(row.id) ?? 0,
      scriptCount: scriptCountsMap.get(row.id) ?? 0,
      generationCount: genCountsMap.get(row.id) ?? 0,
    }));

    const total = totalRows[0]?.count ?? 0;

    return res.json({
      success: true,
      data: {
        items,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
      },
    });
  } catch (error) {
    console.error('Admin list users error:', error);
    return res.status(500).json({ success: false, message: 'Failed to list users.' });
  }
});

// 4. Admin Create User
const createUserSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters.').max(100),
  username: z
    .string()
    .trim()
    .max(32)
    .refine(
      (val) => val === '' || /^[a-zA-Z0-9_.-]{3,32}$/.test(val),
      'Username must be 3–32 alphanumeric, dot, dash, or underscore characters.'
    )
    .optional(),
  email: z.string().trim().email('Valid email address is required.').max(254),
  password: z.string().min(8, 'Password must be at least 8 characters.').max(128),
  role: z.enum(['user', 'admin', 'super_admin']).optional().default('user'),
  accountStatus: z.enum(['active', 'suspended']).optional().default('active'),
  isVerified: z.boolean().optional().default(true),
  creditsBalance: z.number().int().min(0).max(1_000_000).optional().default(1000),
  phoneNumber: z.string().trim().max(24).optional(),
  bio: z.string().trim().max(500).optional(),
  country: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  website: optionalUrlSchema('Website URL'),
  linkedinUrl: optionalUrlSchema('LinkedIn URL', ['linkedin.com']),
  githubUrl: optionalUrlSchema('GitHub URL', ['github.com']),
});

adminRouter.post(
  '/users',
  adminMutationLimiter,
  requirePermission('users.create'),
  async (req: AuthRequest, res) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: parsed.error.issues[0]?.message || 'Invalid user creation payload.',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const actorRole = normalizeRole(req.dbUser!.role);
    const requestedRole = normalizeRole(parsed.data.role);

    if (actorRole !== 'super_admin' && (requestedRole === 'admin' || requestedRole === 'super_admin')) {
      await recordAdminAuditLog({
        adminId: req.dbUser!.id,
        action: 'create_user',
        entityType: 'user',
        outcome: 'denied',
        newValues: { email: parsed.data.email.toLowerCase(), role: requestedRole },
        ipAddress: req.ip,
      });
      return res.status(403).json({
        success: false,
        message: 'Only a Super Admin can create Admin or Super Admin accounts.',
      });
    }

    const complexity = validatePasswordComplexity(parsed.data.password);
    if (!complexity.valid) {
      return res.status(400).json({ success: false, message: complexity.reason });
    }

    const normalizedEmail = parsed.data.email.toLowerCase();
    const normalizedUsername = normalizeOptionalString(parsed.data.username)?.toLowerCase() ?? null;
    const passwordHash = await hashPassword(parsed.data.password);

    try {
      const outcome = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${normalizedEmail}))`);
        const emailExists = await tx
          .select({ id: users.id })
          .from(users)
          .where(sql`lower(${users.email}) = ${normalizedEmail}`)
          .limit(1);
        if (emailExists.length > 0) {
          return { status: 'email_taken' as const };
        }

        if (normalizedUsername) {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`uname:${normalizedUsername}`}))`);
          const unameExists = await tx
            .select({ id: users.id })
            .from(users)
            .where(sql`lower(${users.username}) = ${normalizedUsername}`)
            .limit(1);
          if (unameExists.length > 0) {
            return { status: 'username_taken' as const };
          }
        }

        const isActive = parsed.data.accountStatus === 'active';
        const [created] = await tx
          .insert(users)
          .values({
            uid: `local:${crypto.randomUUID()}`,
            email: normalizedEmail,
            fullName: parsed.data.fullName,
            displayName: parsed.data.fullName,
            username: normalizedUsername,
            passwordHash,
            passwordChangedAt: new Date(),
            role: requestedRole,
            accountStatus: parsed.data.accountStatus,
            isActive,
            isVerified: parsed.data.isVerified,
            isDemoAccount: false,
            creditsBalance: parsed.data.creditsBalance,
            phoneNumber: normalizeOptionalString(parsed.data.phoneNumber) ?? null,
            bio: normalizeOptionalString(parsed.data.bio) ?? null,
            country: normalizeOptionalString(parsed.data.country) ?? null,
            state: normalizeOptionalString(parsed.data.state) ?? null,
            city: normalizeOptionalString(parsed.data.city) ?? null,
            website: normalizeOptionalString(parsed.data.website) ?? null,
            linkedinUrl: normalizeOptionalString(parsed.data.linkedinUrl) ?? null,
            githubUrl: normalizeOptionalString(parsed.data.githubUrl) ?? null,
            createdByAdminId: req.dbUser!.id,
          })
          .returning();

        await tx
          .insert(userPreferences)
          .values({ userId: created.id })
          .onConflictDoNothing({ target: userPreferences.userId });
        await tx
          .insert(notificationPreferences)
          .values({ userId: created.id })
          .onConflictDoNothing({ target: notificationPreferences.userId });

        return { status: 'ok' as const, user: created };
      });

      if (outcome.status === 'email_taken') {
        return res.status(409).json({
          success: false,
          message: 'An account with this email address already exists.',
        });
      }
      if (outcome.status === 'username_taken') {
        return res.status(409).json({
          success: false,
          message: 'That username is already taken.',
        });
      }

      await Promise.all([
        recordAdminAuditLog({
          adminId: req.dbUser!.id,
          targetUserId: outcome.user.id,
          action: 'create_user',
          entityType: 'user',
          entityId: outcome.user.id,
          outcome: 'success',
          newValues: {
            email: outcome.user.email,
            role: outcome.user.role,
            accountStatus: outcome.user.accountStatus,
            isVerified: outcome.user.isVerified,
          },
          ipAddress: req.ip,
        }),
        logUserActivity({
          userId: outcome.user.id,
          activityType: 'registration',
          description: `Account created by administrator (${req.dbUser!.email}).`,
          metadata: { createdByAdminId: req.dbUser!.id },
        }),
      ]);

      return res.status(201).json({
        success: true,
        message: 'User account created successfully.',
        data: toPublicUser(outcome.user),
      });
    } catch (error) {
      console.error('Admin create user error:', error);
      return res.status(500).json({ success: false, message: 'Failed to create user account.' });
    }
  }
);

// 5. Get Detailed User Profile & Stats
adminRouter.get('/users/:userId', requirePermission('users.view'), async (req: AuthRequest, res) => {
  const userId = parseUuidParam(req.params.userId);
  if (!userId) return res.status(400).json({ success: false, message: 'Invalid user ID.' });

  try {
    const rawUser = await getUserById(userId);
    if (!rawUser) return res.status(404).json({ success: false, message: 'User not found.' });
    if (!canAdminInspectTarget(req.dbUser!.role, rawUser.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only the Super Admin can inspect Admin or Super Admin accounts.',
      });
    }
    const userRow = await syncExpiredBanIfNeeded(rawUser);

    const [
      preferences,
      notifications,
      projCount,
      scriptCount,
      sceneCount,
      actionCount,
      jobCount,
      assetCount,
      exportCount,
      sessionCount,
      banCount,
    ] = await Promise.all([
      getOrCreateUserPreferences(userRow.id),
      getOrCreateNotificationPreferences(userRow.id),
      db.select({ count: sql<number>`count(*)::int` }).from(projects).where(eq(projects.userId, userRow.id)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(scriptRevisions)
        .innerJoin(projects, eq(scriptRevisions.projectId, projects.id))
        .where(eq(projects.userId, userRow.id)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(scenes)
        .innerJoin(projects, eq(scenes.projectId, projects.id))
        .where(eq(projects.userId, userRow.id)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(generationActions)
        .where(eq(generationActions.userId, userRow.id)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(generationJobs)
        .where(eq(generationJobs.userId, userRow.id)),
      db.select({ count: sql<number>`count(*)::int` }).from(assets).where(eq(assets.userId, userRow.id)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(exportsTable)
        .where(eq(exportsTable.userId, userRow.id)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(refreshTokens)
        .where(
          and(
            eq(refreshTokens.userId, userRow.id),
            isNull(refreshTokens.revokedAt),
            gt(refreshTokens.expiresAt, new Date())
          )
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(userBanHistory)
        .where(eq(userBanHistory.userId, userRow.id)),
    ]);

    return res.json({
      success: true,
      data: {
        user: toPublicUser(userRow),
        preferences,
        notifications,
        counts: {
          projects: projCount[0]?.count ?? 0,
          scripts: scriptCount[0]?.count ?? 0,
          scenes: sceneCount[0]?.count ?? 0,
          generationActions: actionCount[0]?.count ?? 0,
          generationJobs: jobCount[0]?.count ?? 0,
          assets: assetCount[0]?.count ?? 0,
          exports: exportCount[0]?.count ?? 0,
          activeSessions: sessionCount[0]?.count ?? 0,
          banHistoryCount: banCount[0]?.count ?? 0,
        },
      },
    });
  } catch (error) {
    console.error('Admin get user error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load user details.' });
  }
});

// 6. Edit User Account
const adminUpdateUserSchema = z.object({
  fullName: z.string().trim().min(2).max(100).optional(),
  username: z
    .string()
    .trim()
    .max(32)
    .refine(
      (val) => val === '' || /^[a-zA-Z0-9_.-]{3,32}$/.test(val),
      'Username must be 3–32 characters using letters, numbers, underscores, hyphens, or dots.'
    )
    .nullable()
    .optional(),
  email: z.string().trim().email('Valid email address is required.').max(254).optional(),
  phoneNumber: z.string().trim().max(24).nullable().optional(),
  bio: z.string().trim().max(500).nullable().optional(),
  country: z.string().trim().max(100).nullable().optional(),
  state: z.string().trim().max(100).nullable().optional(),
  city: z.string().trim().max(100).nullable().optional(),
  website: optionalUrlSchema('Website URL'),
  linkedinUrl: optionalUrlSchema('LinkedIn URL', ['linkedin.com']),
  githubUrl: optionalUrlSchema('GitHub URL', ['github.com']),
  isVerified: z.boolean().optional(),
  accountStatus: z.enum(['active', 'suspended']).optional(),
  creditsBalance: z.number().int().min(0).max(1_000_000).optional(),
  removeAvatar: z.boolean().optional(),
});

adminRouter.patch(
  '/users/:userId',
  adminMutationLimiter,
  requirePermission('users.edit'),
  async (req: AuthRequest, res) => {
    const userId = parseUuidParam(req.params.userId);
    if (!userId) return res.status(400).json({ success: false, message: 'Invalid user ID.' });

    const parsed = adminUpdateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: parsed.error.issues[0]?.message || 'Invalid user update payload.',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    try {
      const targetUser = await getUserById(userId);
      if (!targetUser) return res.status(404).json({ success: false, message: 'User not found.' });

      const perm = canEditTargetUser(
        req.dbUser!.role,
        targetUser.role,
        req.dbUser!.id,
        targetUser.id
      );
      if (!perm.allowed) {
        await recordAdminAuditLog({
          adminId: req.dbUser!.id,
          targetUserId: targetUser.id,
          action: 'edit_user',
          entityType: 'user',
          entityId: targetUser.id,
          outcome: 'denied',
          ipAddress: req.ip,
        });
        return res.status(403).json({ success: false, message: perm.reason });
      }

      const data = parsed.data;
      const normalizedUsername =
        data.username === undefined
          ? undefined
          : normalizeOptionalString(data.username)?.toLowerCase() ?? null;
      const requestedEmail = data.email !== undefined ? data.email.trim().toLowerCase() : undefined;

      const previousSnapshot = {
        fullName: targetUser.fullName,
        username: targetUser.username,
        email: targetUser.email,
        phoneNumber: targetUser.phoneNumber,
        country: targetUser.country,
        state: targetUser.state,
        city: targetUser.city,
        isVerified: targetUser.isVerified,
        accountStatus: targetUser.accountStatus,
        creditsBalance: targetUser.creditsBalance,
      };

      const oldAvatarKey = targetUser.profileImageKey;

      const outcome = await db.transaction(async (tx) => {
        if (normalizedUsername !== undefined && normalizedUsername !== null) {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`uname:${normalizedUsername}`}))`);
          const conflict = await tx
            .select({ id: users.id })
            .from(users)
            .where(sql`lower(${users.username}) = ${normalizedUsername} AND ${users.id} <> ${userId}`)
            .limit(1);
          if (conflict.length > 0) return { status: 'username_taken' as const };
        }

        if (requestedEmail && requestedEmail !== targetUser.email.toLowerCase()) {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${requestedEmail}))`);
          const conflict = await tx
            .select({ id: users.id })
            .from(users)
            .where(sql`lower(${users.email}) = ${requestedEmail} AND ${users.id} <> ${userId}`)
            .limit(1);
          if (conflict.length > 0) return { status: 'email_taken' as const };
        }

        const now = new Date();
        const updateSet: Partial<typeof users.$inferInsert> = { updatedAt: now };

        if (data.fullName !== undefined) {
          updateSet.fullName = data.fullName.trim();
          updateSet.displayName = data.fullName.trim();
        }
        if (normalizedUsername !== undefined) updateSet.username = normalizedUsername;
        if (requestedEmail !== undefined) {
          updateSet.email = requestedEmail;
          updateSet.pendingEmail = null;
        }
        if (data.phoneNumber !== undefined) updateSet.phoneNumber = normalizeOptionalString(data.phoneNumber);
        if (data.bio !== undefined) updateSet.bio = normalizeOptionalString(data.bio);
        if (data.country !== undefined) updateSet.country = normalizeOptionalString(data.country);
        if (data.state !== undefined) updateSet.state = normalizeOptionalString(data.state);
        if (data.city !== undefined) updateSet.city = normalizeOptionalString(data.city);
        if (data.website !== undefined) updateSet.website = normalizeOptionalString(data.website);
        if (data.linkedinUrl !== undefined) updateSet.linkedinUrl = normalizeOptionalString(data.linkedinUrl);
        if (data.githubUrl !== undefined) updateSet.githubUrl = normalizeOptionalString(data.githubUrl);
        if (data.isVerified !== undefined) updateSet.isVerified = data.isVerified;
        if (data.creditsBalance !== undefined) updateSet.creditsBalance = data.creditsBalance;
        if (data.removeAvatar) {
          updateSet.profileImageKey = null;
          updateSet.avatarUrl = null;
        }
        if (data.accountStatus !== undefined && targetUser.deletedAt === null) {
          updateSet.accountStatus = data.accountStatus;
          updateSet.isActive = data.accountStatus === 'active';
          if (data.accountStatus === 'active') {
            updateSet.banReason = null;
            updateSet.banExpiresAt = null;
            updateSet.bannedAt = null;
            updateSet.bannedBy = null;
          } else {
            updateSet.tokenVersion = (targetUser.tokenVersion ?? 1) + 1;
            await tx
              .update(refreshTokens)
              .set({ revokedAt: now })
              .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
          }
        }

        const [updated] = await tx
          .update(users)
          .set(updateSet)
          .where(eq(users.id, userId))
          .returning();

        return { status: 'ok' as const, user: updated };
      });

      if (outcome.status === 'username_taken') {
        return res.status(409).json({ success: false, message: 'Username is already in use.' });
      }
      if (outcome.status === 'email_taken') {
        return res.status(409).json({ success: false, message: 'Email address is already in use.' });
      }

      if (data.removeAvatar && oldAvatarKey) {
        await deleteStorageKeyIfUnreferenced(oldAvatarKey);
      }

      await Promise.all([
        recordAdminAuditLog({
          adminId: req.dbUser!.id,
          targetUserId: userId,
          action: 'edit_user',
          entityType: 'user',
          entityId: userId,
          outcome: 'success',
          previousValues: previousSnapshot,
          newValues: {
            fullName: outcome.user.fullName,
            username: outcome.user.username,
            email: outcome.user.email,
            phoneNumber: outcome.user.phoneNumber,
            country: outcome.user.country,
            state: outcome.user.state,
            city: outcome.user.city,
            isVerified: outcome.user.isVerified,
            accountStatus: outcome.user.accountStatus,
            creditsBalance: outcome.user.creditsBalance,
          },
          ipAddress: req.ip,
        }),
        logUserActivity({
          userId,
          activityType: 'admin_profile_edit',
          description: `Account details updated by administrator (${req.dbUser!.email}).`,
        }),
      ]);

      return res.json({
        success: true,
        message: 'User account updated.',
        data: toPublicUser(outcome.user),
      });
    } catch (error) {
      console.error('Admin update user error:', error);
      return res.status(500).json({ success: false, message: 'Failed to update user account.' });
    }
  }
);

// 7. Admin Upload / Replace User Avatar
adminRouter.post(
  '/users/:userId/avatar',
  adminMutationLimiter,
  requirePermission('users.edit'),
  handleAvatarMulter,
  async (req: AuthRequest, res) => {
    const userId = parseUuidParam(req.params.userId);
    if (!userId) return res.status(400).json({ success: false, message: 'Invalid user ID.' });

    try {
      const targetUser = await getUserById(userId);
      if (!targetUser) return res.status(404).json({ success: false, message: 'User not found.' });

      const perm = canEditTargetUser(
        req.dbUser!.role,
        targetUser.role,
        req.dbUser!.id,
        targetUser.id
      );
      if (!perm.allowed) {
        return res.status(403).json({ success: false, message: perm.reason });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({ success: false, message: 'Please select an image file.' });
      }
      if (file.size > MAX_AVATAR_BYTES) {
        return res.status(400).json({ success: false, message: 'Profile picture must be 5 MB or smaller.' });
      }

      const ext = path.extname(file.originalname || '').toLowerCase();
      if (!ALLOWED_AVATAR_MIMES.has(file.mimetype.toLowerCase()) || (ext && !ALLOWED_AVATAR_EXTS.has(ext))) {
        return res.status(400).json({
          success: false,
          message: 'Unsupported image format. Please upload JPG, JPEG, PNG, or WebP.',
        });
      }

      const detected = detectImageFormat(file.buffer);
      if (!detected) {
        return res.status(400).json({
          success: false,
          message: 'File content is not a valid JPG, PNG, or WebP image.',
        });
      }

      const processed = await resizeAndOptimizeAvatar(file.buffer, detected);
      const previousKey = targetUser.profileImageKey;
      const newStorageKey = `avatars/${userId}/avatar_${crypto.randomUUID()}.webp`;
      await saveObject(newStorageKey, processed.buffer);

      const [updated] = await db
        .update(users)
        .set({
          profileImageKey: newStorageKey,
          avatarUrl: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning();

      if (previousKey && previousKey !== newStorageKey) {
        await deleteStorageKeyIfUnreferenced(previousKey);
      }

      await recordAdminAuditLog({
        adminId: req.dbUser!.id,
        targetUserId: userId,
        action: 'update_user_avatar',
        entityType: 'user',
        entityId: userId,
        outcome: 'success',
        previousValues: { profileImageKey: previousKey },
        newValues: { profileImageKey: newStorageKey },
        ipAddress: req.ip,
      });

      return res.json({
        success: true,
        message: 'User profile picture updated.',
        data: toPublicUser(updated),
      });
    } catch (error) {
      console.error('Admin avatar upload error:', error);
      return res.status(400).json({ success: false, message: 'Failed to process avatar image.' });
    }
  }
);

// 8. Soft Delete & Super Admin Permanent Delete + Restore
adminRouter.delete(
  '/users/:userId',
  adminMutationLimiter,
  requirePermission('users.delete'),
  async (req: AuthRequest, res) => {
    const userId = parseUuidParam(req.params.userId);
    if (!userId) return res.status(400).json({ success: false, message: 'Invalid user ID.' });

    const permanent = req.query.permanent === 'true' || req.body?.permanent === true;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : '';
    const confirmPhrase =
      typeof req.body?.confirmPhrase === 'string'
        ? req.body.confirmPhrase.trim()
        : typeof req.query.confirmPhrase === 'string'
          ? req.query.confirmPhrase.trim()
          : '';

    try {
      const targetUser = await getUserById(userId);
      if (!targetUser) return res.status(404).json({ success: false, message: 'User not found.' });

      const perm = canSoftDeleteTargetUser(
        req.dbUser!.role,
        targetUser.role,
        req.dbUser!.id,
        targetUser.id
      );
      if (!perm.allowed) {
        await recordAdminAuditLog({
          adminId: req.dbUser!.id,
          targetUserId: userId,
          action: permanent ? 'permanent_delete_user' : 'soft_delete_user',
          entityType: 'user',
          entityId: userId,
          outcome: 'denied',
          ipAddress: req.ip,
        });
        return res.status(403).json({ success: false, message: perm.reason });
      }

      if (permanent && normalizeRole(req.dbUser!.role) !== 'super_admin') {
        await recordAdminAuditLog({
          adminId: req.dbUser!.id,
          targetUserId: userId,
          action: 'permanent_delete_user',
          entityType: 'user',
          entityId: userId,
          outcome: 'denied',
          ipAddress: req.ip,
        });
        return res.status(403).json({
          success: false,
          message: 'Only a Super Admin can permanently delete a user account.',
        });
      }

      if (permanent && confirmPhrase !== 'DELETE') {
        return res.status(400).json({
          success: false,
          message: 'Confirmation phrase DELETE is required for permanent deletion.',
        });
      }

      if (normalizeRole(targetUser.role) === 'super_admin') {
        const activeSupers = await countActiveSuperAdmins();
        if (activeSupers <= 1 && targetUser.deletedAt === null) {
          return res.status(409).json({
            success: false,
            message: 'Cannot delete the last active Super Admin account.',
          });
        }
      }

      if (permanent) {
        const [userAssets, userExports] = await Promise.all([
          db.select({ storageKey: assets.storageKey }).from(assets).where(eq(assets.userId, userId)),
          db
            .select({ storageKey: exportsTable.storageKey })
            .from(exportsTable)
            .where(eq(exportsTable.userId, userId)),
        ]);

        const candidateKeys = new Set<string>();
        if (targetUser.profileImageKey) candidateKeys.add(targetUser.profileImageKey);
        for (const a of userAssets) if (a.storageKey) candidateKeys.add(a.storageKey);
        for (const e of userExports) if (e.storageKey) candidateKeys.add(e.storageKey);

        await db.delete(users).where(eq(users.id, userId));

        for (const key of candidateKeys) {
          await deleteStorageKeyIfUnreferenced(key);
        }

        await recordAdminAuditLog({
          adminId: req.dbUser!.id,
          targetUserId: null,
          action: 'permanent_delete_user',
          entityType: 'user',
          entityId: userId,
          outcome: 'success',
          previousValues: { email: targetUser.email, role: targetUser.role, reason: reason || null },
          ipAddress: req.ip,
        });

        return res.json({
          success: true,
          message: `Permanently deleted user ${targetUser.email}.`,
        });
      }

      const now = new Date();
      const [softDeleted] = await db.transaction(async (tx) => {
        await tx
          .update(refreshTokens)
          .set({ revokedAt: now })
          .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));

        return tx
          .update(users)
          .set({
            deletedAt: now,
            accountStatus: 'deleted',
            isActive: false,
            deletionReason: reason || targetUser.deletionReason,
            tokenVersion: sql`${users.tokenVersion} + 1`,
            updatedAt: now,
          })
          .where(eq(users.id, userId))
          .returning();
      });

      await Promise.all([
        recordAdminAuditLog({
          adminId: req.dbUser!.id,
          targetUserId: userId,
          action: 'soft_delete_user',
          entityType: 'user',
          entityId: userId,
          outcome: 'success',
          previousValues: { accountStatus: targetUser.accountStatus, deletedAt: targetUser.deletedAt },
          newValues: { accountStatus: 'deleted', deletedAt: now.toISOString(), reason: reason || null },
          ipAddress: req.ip,
        }),
        logUserActivity({
          userId,
          activityType: 'account_soft_deleted',
          description: `Account soft-deleted by administrator (${req.dbUser!.email}).`,
        }),
      ]);

      return res.json({
        success: true,
        message: 'User account soft-deleted and active sessions revoked.',
        data: toPublicUser(softDeleted),
      });
    } catch (error) {
      console.error('Admin delete user error:', error);
      return res.status(500).json({ success: false, message: 'Failed to delete user account.' });
    }
  }
);

adminRouter.post(
  '/users/:userId/restore',
  adminMutationLimiter,
  requirePermission('users.delete'),
  async (req: AuthRequest, res) => {
    const userId = parseUuidParam(req.params.userId);
    if (!userId) return res.status(400).json({ success: false, message: 'Invalid user ID.' });

    try {
      const targetUser = await getUserById(userId);
      if (!targetUser) return res.status(404).json({ success: false, message: 'User not found.' });

      const perm = canSoftDeleteTargetUser(
        req.dbUser!.role,
        targetUser.role,
        req.dbUser!.id,
        targetUser.id
      );
      if (!perm.allowed) {
        return res.status(403).json({ success: false, message: perm.reason });
      }

      const [restored] = await db
        .update(users)
        .set({
          deletedAt: null,
          deletionRequestedAt: null,
          deletionScheduledFor: null,
          deletionReason: null,
          accountStatus: 'active',
          isActive: true,
          banReason: null,
          banExpiresAt: null,
          bannedAt: null,
          bannedBy: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning();

      await Promise.all([
        recordAdminAuditLog({
          adminId: req.dbUser!.id,
          targetUserId: userId,
          action: 'restore_user',
          entityType: 'user',
          entityId: userId,
          outcome: 'success',
          previousValues: { deletedAt: targetUser.deletedAt, accountStatus: targetUser.accountStatus },
          newValues: { deletedAt: null, accountStatus: 'active' },
          ipAddress: req.ip,
        }),
        logUserActivity({
          userId,
          activityType: 'account_restored',
          description: `Deleted account restored by administrator (${req.dbUser!.email}).`,
        }),
      ]);

      return res.json({
        success: true,
        message: 'User account restored.',
        data: toPublicUser(restored),
      });
    } catch (error) {
      console.error('Admin restore user error:', error);
      return res.status(500).json({ success: false, message: 'Failed to restore user account.' });
    }
  }
);

// 9. Admin Verification & Password Reset Triggers
adminRouter.post(
  '/users/:userId/send-verification',
  adminMutationLimiter,
  requirePermission('users.edit'),
  async (req: AuthRequest, res) => {
    const userId = parseUuidParam(req.params.userId);
    if (!userId) return res.status(400).json({ success: false, message: 'Invalid user ID.' });

    try {
      const targetUser = await getUserById(userId);
      if (!targetUser) return res.status(404).json({ success: false, message: 'User not found.' });
      const perm = canEditTargetUser(
        req.dbUser!.role,
        targetUser.role,
        req.dbUser!.id,
        targetUser.id
      );
      if (!perm.allowed) {
        return res.status(403).json({ success: false, message: perm.reason });
      }

      const rawToken = generateOpaqueToken();
      await db.transaction(async (tx) => {
        await tx
          .update(emailVerificationTokens)
          .set({ usedAt: new Date() })
          .where(and(eq(emailVerificationTokens.userId, userId), isNull(emailVerificationTokens.usedAt)));
        await tx.insert(emailVerificationTokens).values({
          userId,
          pendingEmail: targetUser.pendingEmail || null,
          tokenHash: hashOpaqueToken(rawToken),
          expiresAt: new Date(Date.now() + VERIFY_TOKEN_TTL_MS),
        });
      });

      if (process.env.NODE_ENV !== 'production') {
        const origin = process.env.APP_URL || `${req.protocol}://${req.get('Host') || 'localhost:3000'}`;
        console.info(`[Admin Auth] Verification link for ${targetUser.email}: ${origin}/verify-email?token=${rawToken}`);
      }

      await recordAdminAuditLog({
        adminId: req.dbUser!.id,
        targetUserId: userId,
        action: 'send_verification_email',
        entityType: 'user',
        entityId: userId,
        outcome: 'success',
        ipAddress: req.ip,
      });

      return res.json({
        success: true,
        message: `Prepared fresh email verification link for ${targetUser.email}.`,
      });
    } catch (error) {
      console.error('Admin send verification error:', error);
      return res.status(500).json({ success: false, message: 'Failed to trigger email verification.' });
    }
  }
);

adminRouter.post(
  '/users/:userId/send-password-reset',
  adminMutationLimiter,
  requirePermission('users.edit'),
  async (req: AuthRequest, res) => {
    const userId = parseUuidParam(req.params.userId);
    if (!userId) return res.status(400).json({ success: false, message: 'Invalid user ID.' });

    try {
      const targetUser = await getUserById(userId);
      if (!targetUser) return res.status(404).json({ success: false, message: 'User not found.' });

      const perm = canEditTargetUser(
        req.dbUser!.role,
        targetUser.role,
        req.dbUser!.id,
        targetUser.id
      );
      if (!perm.allowed) {
        return res.status(403).json({ success: false, message: perm.reason });
      }

      const rawToken = generateOpaqueToken();
      await db.transaction(async (tx) => {
        await tx
          .update(passwordResetTokens)
          .set({ usedAt: new Date() })
          .where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)));
        await tx.insert(passwordResetTokens).values({
          userId,
          tokenHash: hashOpaqueToken(rawToken),
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        });
      });

      if (process.env.NODE_ENV !== 'production') {
        const origin = process.env.APP_URL || `${req.protocol}://${req.get('Host') || 'localhost:3000'}`;
        console.info(`[Admin Auth] Password reset link for ${targetUser.email}: ${origin}/reset-password?token=${rawToken}`);
      }

      await recordAdminAuditLog({
        adminId: req.dbUser!.id,
        targetUserId: userId,
        action: 'send_password_reset',
        entityType: 'user',
        entityId: userId,
        outcome: 'success',
        ipAddress: req.ip,
      });

      return res.json({
        success: true,
        message: `Password reset link generated for ${targetUser.email}.`,
      });
    } catch (error) {
      console.error('Admin send password reset error:', error);
      return res.status(500).json({ success: false, message: 'Failed to generate password reset link.' });
    }
  }
);

// 10. User Inspection Endpoints (Projects, Scripts, Scenes, Generations, Assets, Sessions, Activity, Bans, Export)
adminRouter.get('/users/:userId/projects', requirePermission('projects.view'), async (req: AuthRequest, res) => {
  const userId = parseUuidParam(req.params.userId);
  if (!userId) return res.status(400).json({ success: false, message: 'Invalid user ID.' });

  try {
    const targetUser = await getUserById(userId);
    if (!targetUser) return res.status(404).json({ success: false, message: 'User not found.' });
    if (!canAdminInspectTarget(req.dbUser!.role, targetUser.role)) {
      return res.status(403).json({ success: false, message: 'Only the Super Admin can inspect Admin accounts.' });
    }
    const list = await db
      .select()
      .from(projects)
      .where(eq(projects.userId, userId))
      .orderBy(desc(projects.updatedAt));
    return res.json({ success: true, data: list });
  } catch (error) {
    console.error('Admin user projects error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load user projects.' });
  }
});

adminRouter.get('/users/:userId/scripts', requirePermission('scripts.view'), async (req: AuthRequest, res) => {
  const userId = parseUuidParam(req.params.userId);
  if (!userId) return res.status(400).json({ success: false, message: 'Invalid user ID.' });

  try {
    const targetUser = await getUserById(userId);
    if (!targetUser) return res.status(404).json({ success: false, message: 'User not found.' });
    if (!canAdminInspectTarget(req.dbUser!.role, targetUser.role)) {
      return res.status(403).json({ success: false, message: 'Only the Super Admin can inspect Admin accounts.' });
    }
    const rows = await db
      .select({
        id: scriptRevisions.id,
        projectId: scriptRevisions.projectId,
        projectTitle: projects.title,
        versionNumber: scriptRevisions.versionNumber,
        title: scriptRevisions.title,
        platform: scriptRevisions.platform,
        toneOfVoice: scriptRevisions.toneOfVoice,
        language: scriptRevisions.language,
        targetDurationSec: scriptRevisions.targetDurationSec,
        content: scriptRevisions.content,
        aiModelUsed: scriptRevisions.aiModelUsed,
        aiNotes: scriptRevisions.aiNotes,
        usageJson: scriptRevisions.usageJson,
        createdAt: scriptRevisions.createdAt,
      })
      .from(scriptRevisions)
      .innerJoin(projects, eq(scriptRevisions.projectId, projects.id))
      .where(eq(projects.userId, userId))
      .orderBy(desc(scriptRevisions.createdAt));

    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Admin user scripts error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load user scripts.' });
  }
});

adminRouter.get('/users/:userId/scenes', requirePermission('scenes.view'), async (req: AuthRequest, res) => {
  const userId = parseUuidParam(req.params.userId);
  if (!userId) return res.status(400).json({ success: false, message: 'Invalid user ID.' });

  try {
    const targetUser = await getUserById(userId);
    if (!targetUser) return res.status(404).json({ success: false, message: 'User not found.' });
    if (!canAdminInspectTarget(req.dbUser!.role, targetUser.role)) {
      return res.status(403).json({ success: false, message: 'Only the Super Admin can inspect Admin accounts.' });
    }
    const rows = await db
      .select({
        id: scenes.id,
        projectId: scenes.projectId,
        projectTitle: projects.title,
        sceneOrder: scenes.sceneOrder,
        title: scenes.title,
        narration: scenes.narration,
        visualDescription: scenes.visualDescription,
        imagePrompt: scenes.imagePrompt,
        videoPrompt: scenes.videoPrompt,
        durationSec: scenes.durationSec,
        transition: scenes.transition,
        mediaPreference: scenes.mediaPreference,
        selectedAssetId: scenes.selectedAssetId,
        generationStatus: scenes.generationStatus,
        createdAt: scenes.createdAt,
      })
      .from(scenes)
      .innerJoin(projects, eq(scenes.projectId, projects.id))
      .where(eq(projects.userId, userId))
      .orderBy(desc(scenes.createdAt), asc(scenes.sceneOrder));

    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Admin user scenes error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load user scenes.' });
  }
});

adminRouter.get('/users/:userId/generations', requirePermission('generations.view'), async (req: AuthRequest, res) => {
  const userId = parseUuidParam(req.params.userId);
  if (!userId) return res.status(400).json({ success: false, message: 'Invalid user ID.' });

  try {
    const targetUser = await getUserById(userId);
    if (!targetUser) return res.status(404).json({ success: false, message: 'User not found.' });
    if (!canAdminInspectTarget(req.dbUser!.role, targetUser.role)) {
      return res.status(403).json({ success: false, message: 'Only the Super Admin can inspect Admin accounts.' });
    }
    const [actionRows, jobRows, attemptRows, userExports] = await Promise.all([
      db
        .select({
          id: generationActions.id,
          projectId: generationActions.projectId,
          projectTitle: projects.title,
          sceneId: generationActions.sceneId,
          actionType: generationActions.actionType,
          mediaType: generationActions.mediaType,
          provider: generationActions.provider,
          model: generationActions.model,
          prompt: generationActions.prompt,
          status: generationActions.status,
          createdAt: generationActions.createdAt,
        })
        .from(generationActions)
        .leftJoin(projects, eq(generationActions.projectId, projects.id))
        .where(eq(generationActions.userId, userId))
        .orderBy(desc(generationActions.createdAt)),
      db
        .select()
        .from(generationJobs)
        .where(eq(generationJobs.userId, userId))
        .orderBy(desc(generationJobs.createdAt)),
      db
        .select({
          id: generationAttempts.id,
          jobId: generationAttempts.jobId,
          actionId: generationAttempts.actionId,
          attemptNumber: generationAttempts.attemptNumber,
          status: generationAttempts.status,
          providerRequestId: generationAttempts.providerRequestId,
          errorMessage: generationAttempts.errorMessage,
          durationMs: generationAttempts.durationMs,
          createdAt: generationAttempts.createdAt,
          finishedAt: generationAttempts.finishedAt,
        })
        .from(generationAttempts)
        .innerJoin(generationJobs, eq(generationAttempts.jobId, generationJobs.id))
        .where(eq(generationJobs.userId, userId))
        .orderBy(asc(generationAttempts.attemptNumber)),
      db
        .select()
        .from(exportsTable)
        .where(eq(exportsTable.userId, userId))
        .orderBy(desc(exportsTable.createdAt)),
    ]);

    const jobByActionId = new Map(jobRows.map((j) => [j.actionId, j]));
    const attemptsByJobId = new Map<string, typeof attemptRows>();
    for (const att of attemptRows) {
      const list = attemptsByJobId.get(att.jobId) || [];
      list.push(att);
      attemptsByJobId.set(att.jobId, list);
    }

    const actions = actionRows.map((act) => {
      const job = jobByActionId.get(act.id) || null;
      const attempts = job ? attemptsByJobId.get(job.id) || [] : [];
      return {
        ...act,
        job,
        attempts,
        retryCount: Math.max(0, attempts.length - 1),
      };
    });

    const enrichedExports = userExports.map((exp) => ({
      ...exp,
      previewUrl: exp.storageKey ? createSignedMediaUrl(exp.storageKey) : null,
      downloadUrl: exp.storageKey ? `${createSignedMediaUrl(exp.storageKey)}&download=1` : null,
    }));

    return res.json({
      success: true,
      data: {
        actions,
        exports: enrichedExports,
      },
    });
  } catch (error) {
    console.error('Admin user generations error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load user AI generations.' });
  }
});

adminRouter.get('/users/:userId/assets', requirePermission('assets.view'), async (req: AuthRequest, res) => {
  const userId = parseUuidParam(req.params.userId);
  if (!userId) return res.status(400).json({ success: false, message: 'Invalid user ID.' });

  try {
    const targetUser = await getUserById(userId);
    if (!targetUser) return res.status(404).json({ success: false, message: 'User not found.' });
    if (!canAdminInspectTarget(req.dbUser!.role, targetUser.role)) {
      return res.status(403).json({ success: false, message: 'Only the Super Admin can inspect Admin accounts.' });
    }
    const rows = await db
      .select({
        id: assets.id,
        projectId: assets.projectId,
        projectTitle: projects.title,
        sceneId: assets.sceneId,
        assetType: assets.assetType,
        mimeType: assets.mimeType,
        storageKey: assets.storageKey,
        fileName: assets.fileName,
        fileSizeBytes: assets.fileSizeBytes,
        width: assets.width,
        height: assets.height,
        durationSec: assets.durationSec,
        provider: assets.provider,
        model: assets.model,
        metadataJson: assets.metadataJson,
        isAccepted: assets.isAccepted,
        createdAt: assets.createdAt,
      })
      .from(assets)
      .leftJoin(projects, eq(assets.projectId, projects.id))
      .where(eq(assets.userId, userId))
      .orderBy(desc(assets.createdAt));

    const enriched = rows.map((a) => ({
      ...a,
      signedUrl: createSignedMediaUrl(a.storageKey),
      downloadUrl: `${createSignedMediaUrl(a.storageKey)}&download=1`,
    }));

    return res.json({ success: true, data: enriched });
  } catch (error) {
    console.error('Admin user assets error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load user assets.' });
  }
});

adminRouter.get('/users/:userId/sessions', requirePermission('users.view'), async (req: AuthRequest, res) => {
  const userId = parseUuidParam(req.params.userId);
  if (!userId) return res.status(400).json({ success: false, message: 'Invalid user ID.' });

  try {
    const targetUser = await getUserById(userId);
    if (!targetUser) return res.status(404).json({ success: false, message: 'User not found.' });
    if (!canAdminInspectTarget(req.dbUser!.role, targetUser.role)) {
      return res.status(403).json({ success: false, message: 'Only the Super Admin can inspect Admin accounts.' });
    }
    const rows = await db
      .select({
        id: refreshTokens.id,
        familyId: refreshTokens.familyId,
        rememberMe: refreshTokens.rememberMe,
        userAgent: refreshTokens.userAgent,
        ipAddress: refreshTokens.ipAddress,
        expiresAt: refreshTokens.expiresAt,
        revokedAt: refreshTokens.revokedAt,
        createdAt: refreshTokens.createdAt,
      })
      .from(refreshTokens)
      .where(eq(refreshTokens.userId, userId))
      .orderBy(desc(refreshTokens.createdAt))
      .limit(40);

    const now = new Date();
    const mapped = rows.map((r) => ({
      ...r,
      status: r.revokedAt ? 'revoked' : r.expiresAt <= now ? 'expired' : 'active',
    }));

    return res.json({ success: true, data: mapped });
  } catch (error) {
    console.error('Admin user sessions error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load user sessions.' });
  }
});

adminRouter.delete(
  '/users/:userId/sessions/:sessionId',
  adminMutationLimiter,
  requirePermission('users.edit'),
  async (req: AuthRequest, res) => {
    const userId = parseUuidParam(req.params.userId);
    const sessionId = parseUuidParam(req.params.sessionId);
    if (!userId || !sessionId) {
      return res.status(400).json({ success: false, message: 'Invalid ID parameters.' });
    }

    try {
      const targetUser = await getUserById(userId);
      if (!targetUser) return res.status(404).json({ success: false, message: 'User not found.' });

      const perm = canEditTargetUser(
        req.dbUser!.role,
        targetUser.role,
        req.dbUser!.id,
        targetUser.id
      );
      if (!perm.allowed) {
        return res.status(403).json({ success: false, message: perm.reason });
      }

      const rows = await db
        .select()
        .from(refreshTokens)
        .where(and(eq(refreshTokens.id, sessionId), eq(refreshTokens.userId, userId)))
        .limit(1);
      const tokenRow = rows[0];
      if (!tokenRow) return res.status(404).json({ success: false, message: 'Session not found.' });

      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.userId, userId), eq(refreshTokens.familyId, tokenRow.familyId)));

      await recordAdminAuditLog({
        adminId: req.dbUser!.id,
        targetUserId: userId,
        action: 'revoke_user_session',
        entityType: 'session',
        entityId: sessionId,
        outcome: 'success',
        ipAddress: req.ip,
      });

      return res.json({ success: true, message: 'User session revoked.' });
    } catch (error) {
      console.error('Admin revoke session error:', error);
      return res.status(500).json({ success: false, message: 'Failed to revoke session.' });
    }
  }
);

adminRouter.get('/users/:userId/activity', requirePermission('users.view'), async (req: AuthRequest, res) => {
  const userId = parseUuidParam(req.params.userId);
  if (!userId) return res.status(400).json({ success: false, message: 'Invalid user ID.' });

  try {
    const targetUser = await getUserById(userId);
    if (!targetUser) return res.status(404).json({ success: false, message: 'User not found.' });
    if (!canAdminInspectTarget(req.dbUser!.role, targetUser.role)) {
      return res.status(403).json({ success: false, message: 'Only the Super Admin can inspect Admin accounts.' });
    }
    const rows = await db
      .select()
      .from(userActivities)
      .where(eq(userActivities.userId, userId))
      .orderBy(desc(userActivities.createdAt))
      .limit(100);
    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Admin user activity error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load user activity.' });
  }
});

adminRouter.get('/users/:userId/ban-history', requirePermission('users.view'), async (req: AuthRequest, res) => {
  const userId = parseUuidParam(req.params.userId);
  if (!userId) return res.status(400).json({ success: false, message: 'Invalid user ID.' });

  try {
    const targetUser = await getUserById(userId);
    if (!targetUser) return res.status(404).json({ success: false, message: 'User not found.' });
    if (!canAdminInspectTarget(req.dbUser!.role, targetUser.role)) {
      return res.status(403).json({ success: false, message: 'Only the Super Admin can inspect Admin accounts.' });
    }
    const rows = await db
      .select({
        id: userBanHistory.id,
        userId: userBanHistory.userId,
        action: userBanHistory.action,
        banType: userBanHistory.banType,
        reason: userBanHistory.reason,
        internalNote: userBanHistory.internalNote,
        performedBy: userBanHistory.performedBy,
        performedByEmail: users.email,
        expiresAt: userBanHistory.expiresAt,
        createdAt: userBanHistory.createdAt,
      })
      .from(userBanHistory)
      .leftJoin(users, eq(userBanHistory.performedBy, users.id))
      .where(eq(userBanHistory.userId, userId))
      .orderBy(desc(userBanHistory.createdAt));

    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Admin user ban history error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load ban history.' });
  }
});

adminRouter.get(
  '/users/:userId/export',
  requirePermission('reports.export'),
  async (req: AuthRequest, res) => {
    const userId = parseUuidParam(req.params.userId);
    if (!userId) return res.status(400).json({ success: false, message: 'Invalid user ID.' });

    try {
      const targetUser = await getUserById(userId);
      if (!targetUser) return res.status(404).json({ success: false, message: 'User not found.' });
      if (!canAdminInspectTarget(req.dbUser!.role, targetUser.role)) {
        return res.status(403).json({ success: false, message: 'Only the Super Admin can export Admin data.' });
      }

      const [
        preferences,
        notifications,
        userProjects,
        userAssets,
        userExports,
        userBilling,
        userActs,
        userBans,
      ] = await Promise.all([
        getOrCreateUserPreferences(userId),
        getOrCreateNotificationPreferences(userId),
        db.select().from(projects).where(eq(projects.userId, userId)).orderBy(desc(projects.createdAt)),
        db.select().from(assets).where(eq(assets.userId, userId)).orderBy(desc(assets.createdAt)),
        db.select().from(exportsTable).where(eq(exportsTable.userId, userId)).orderBy(desc(exportsTable.createdAt)),
        db
          .select()
          .from(billingTransactions)
          .where(eq(billingTransactions.userId, userId))
          .orderBy(desc(billingTransactions.createdAt)),
        db
          .select()
          .from(userActivities)
          .where(eq(userActivities.userId, userId))
          .orderBy(desc(userActivities.createdAt)),
        db
          .select()
          .from(userBanHistory)
          .where(eq(userBanHistory.userId, userId))
          .orderBy(desc(userBanHistory.createdAt)),
      ]);

      const projectIds = userProjects.map((p) => p.id);
      const [projectRevisions, projectScenes] =
        projectIds.length > 0
          ? await Promise.all([
              db.select().from(scriptRevisions).where(inArray(scriptRevisions.projectId, projectIds)),
              db.select().from(scenes).where(inArray(scenes.projectId, projectIds)),
            ])
          : [[], []];

      await recordAdminAuditLog({
        adminId: req.dbUser!.id,
        targetUserId: userId,
        action: 'export_user_data',
        entityType: 'user',
        entityId: userId,
        outcome: 'success',
        ipAddress: req.ip,
      });

      return res.json({
        success: true,
        data: {
          exportedAt: new Date().toISOString(),
          exportedByAdminId: req.dbUser!.id,
          user: toPublicUser(targetUser),
          preferences,
          notifications,
          projects: userProjects,
          scriptRevisions: projectRevisions,
          scenes: projectScenes,
          assets: userAssets,
          exports: userExports,
          billingTransactions: userBilling,
          activities: userActs,
          banHistory: userBans,
        },
      });
    } catch (error) {
      console.error('Admin export user data error:', error);
      return res.status(500).json({ success: false, message: 'Failed to export user data.' });
    }
  }
);

// 11. Ban, Unban & Role Management
adminRouter.get('/bans', requirePermission('users.view'), async (req: AuthRequest, res) => {
  try {
    const callerRole = normalizeRole(req.dbUser!.role);
    const [restrictedUsers, history] = await Promise.all([
      db
        .select()
        .from(users)
        .where(
          and(
            or(eq(users.accountStatus, 'banned'), eq(users.accountStatus, 'suspended')),
            isNull(users.deletedAt),
            ...(callerRole !== 'super_admin'
              ? [or(eq(users.role, 'user'), eq(users.role, 'creator'))!]
              : [])
          )
        )
        .orderBy(desc(users.bannedAt), desc(users.updatedAt)),
      db
        .select({
          id: userBanHistory.id,
          userId: userBanHistory.userId,
          action: userBanHistory.action,
          banType: userBanHistory.banType,
          reason: userBanHistory.reason,
          internalNote: userBanHistory.internalNote,
          performedBy: userBanHistory.performedBy,
          expiresAt: userBanHistory.expiresAt,
          createdAt: userBanHistory.createdAt,
          userEmail: users.email,
          userFullName: users.fullName,
          isDemoAccount: users.isDemoAccount,
        })
        .from(userBanHistory)
        .leftJoin(users, eq(userBanHistory.userId, users.id))
        .orderBy(desc(userBanHistory.createdAt))
        .limit(80),
    ]);

    const syncedUsers = await Promise.all(restrictedUsers.map(syncExpiredBanIfNeeded));
    const stillRestricted = syncedUsers
      .filter((u) => u.accountStatus === 'banned' || u.accountStatus === 'suspended')
      .map((u) => toPublicUser(u));

    return res.json({
      success: true,
      data: {
        restrictedUsers: stillRestricted,
        history,
      },
    });
  } catch (error) {
    console.error('Admin bans list error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load ban management data.' });
  }
});

const banUserSchema = z.object({
  banType: z.enum(['temporary', 'permanent']).default('permanent'),
  durationHours: z.number().positive().max(24 * 365 * 5).optional(),
  expiresAt: z.string().datetime().optional(),
  reason: z.string().trim().min(3, 'Please provide a clear reason for banning this account.').max(500),
  internalNote: z.string().trim().max(1000).optional(),
});

adminRouter.post('/users/:userId/ban', adminMutationLimiter, requirePermission('users.ban'), async (req: AuthRequest, res) => {
  const userId = parseUuidParam(req.params.userId);
  if (!userId) return res.status(400).json({ success: false, message: 'Invalid user ID.' });

  const parsed = banUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: parsed.error.issues[0]?.message || 'Invalid ban payload.',
    });
  }

  try {
    const targetUser = await getUserById(userId);
    if (!targetUser) return res.status(404).json({ success: false, message: 'User not found.' });

    const perm = canBanTargetUser(
      req.dbUser!.role,
      targetUser.role,
      req.dbUser!.id,
      targetUser.id
    );
    if (!perm.allowed) {
      await recordAdminAuditLog({
        adminId: req.dbUser!.id,
        targetUserId: userId,
        action: 'ban_user',
        entityType: 'user',
        entityId: userId,
        outcome: 'denied',
        newValues: { reason: parsed.data.reason },
        ipAddress: req.ip,
      });
      return res.status(403).json({ success: false, message: perm.reason });
    }

    let resolvedExpiresAt: Date | null = null;
    if (parsed.data.banType === 'temporary') {
      if (parsed.data.expiresAt) {
        resolvedExpiresAt = new Date(parsed.data.expiresAt);
      } else if (parsed.data.durationHours) {
        resolvedExpiresAt = new Date(Date.now() + parsed.data.durationHours * 3600 * 1000);
      } else {
        resolvedExpiresAt = new Date(Date.now() + 24 * 3600 * 1000);
      }
      if (resolvedExpiresAt <= new Date()) {
        return res.status(400).json({
          success: false,
          message: 'Temporary ban expiration must be in the future.',
        });
      }
    }

    const now = new Date();
    const updatedUser = await db.transaction(async (tx) => {
      const [u] = await tx
        .update(users)
        .set({
          accountStatus: 'banned',
          isActive: false,
          banReason: parsed.data.reason,
          banExpiresAt: resolvedExpiresAt,
          bannedAt: now,
          bannedBy: req.dbUser!.id,
          tokenVersion: sql`${users.tokenVersion} + 1`,
          updatedAt: now,
        })
        .where(eq(users.id, userId))
        .returning();

      await tx
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));

      await tx.insert(userBanHistory).values({
        userId,
        action: 'ban',
        banType: parsed.data.banType,
        reason: parsed.data.reason,
        internalNote: parsed.data.internalNote || null,
        performedBy: req.dbUser!.id,
        expiresAt: resolvedExpiresAt,
      });

      return u;
    });

    await Promise.all([
      recordAdminAuditLog({
        adminId: req.dbUser!.id,
        targetUserId: userId,
        action: 'ban_user',
        entityType: 'user',
        entityId: userId,
        outcome: 'success',
        previousValues: { accountStatus: targetUser.accountStatus, isActive: targetUser.isActive },
        newValues: {
          accountStatus: 'banned',
          banType: parsed.data.banType,
          reason: parsed.data.reason,
          expiresAt: resolvedExpiresAt?.toISOString() ?? null,
        },
        ipAddress: req.ip,
      }),
      logUserActivity({
        userId,
        activityType: 'account_banned',
        description: `Account ${parsed.data.banType === 'temporary' ? 'temporarily ' : 'permanently '}banned: ${parsed.data.reason}`,
        metadata: {
          banType: parsed.data.banType,
          expiresAt: resolvedExpiresAt?.toISOString() ?? null,
        },
      }),
    ]);

    return res.json({
      success: true,
      message: 'User account banned and active sessions terminated.',
      data: toPublicUser(updatedUser),
    });
  } catch (error) {
    console.error('Admin ban user error:', error);
    return res.status(500).json({ success: false, message: 'Failed to ban user account.' });
  }
});

const unbanUserSchema = z.object({
  reason: z.string().trim().max(500).optional(),
  internalNote: z.string().trim().max(1000).optional(),
});

adminRouter.post('/users/:userId/unban', adminMutationLimiter, requirePermission('users.unban'), async (req: AuthRequest, res) => {
  const userId = parseUuidParam(req.params.userId);
  if (!userId) return res.status(400).json({ success: false, message: 'Invalid user ID.' });

  const parsed = unbanUserSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Invalid unban payload.' });
  }

  try {
    const targetUser = await getUserById(userId);
    if (!targetUser) return res.status(404).json({ success: false, message: 'User not found.' });

    const perm = canBanTargetUser(
      req.dbUser!.role,
      targetUser.role,
      req.dbUser!.id,
      targetUser.id
    );
    if (!perm.allowed) {
      await recordAdminAuditLog({
        adminId: req.dbUser!.id,
        targetUserId: userId,
        action: 'unban_user',
        entityType: 'user',
        entityId: userId,
        outcome: 'denied',
        ipAddress: req.ip,
      });
      return res.status(403).json({ success: false, message: perm.reason });
    }

    const reasonText =
      normalizeOptionalString(parsed.data.reason) || 'Ban lifted by administrator.';

    const updatedUser = await db.transaction(async (tx) => {
      const [u] = await tx
        .update(users)
        .set({
          accountStatus: 'active',
          isActive: true,
          banReason: null,
          banExpiresAt: null,
          bannedAt: null,
          bannedBy: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning();

      await tx.insert(userBanHistory).values({
        userId,
        action: 'unban',
        banType: targetUser.banExpiresAt ? 'temporary' : 'permanent',
        reason: reasonText,
        internalNote: normalizeOptionalString(parsed.data.internalNote) || null,
        performedBy: req.dbUser!.id,
        expiresAt: null,
      });

      return u;
    });

    await Promise.all([
      recordAdminAuditLog({
        adminId: req.dbUser!.id,
        targetUserId: userId,
        action: 'unban_user',
        entityType: 'user',
        entityId: userId,
        outcome: 'success',
        previousValues: { accountStatus: targetUser.accountStatus, banReason: targetUser.banReason },
        newValues: { accountStatus: 'active', reason: reasonText },
        ipAddress: req.ip,
      }),
      logUserActivity({
        userId,
        activityType: 'account_unbanned',
        description: `Account unbanned by administrator (${req.dbUser!.email}): ${reasonText}`,
      }),
    ]);

    return res.json({
      success: true,
      message: 'User account unbanned and restored to active access.',
      data: toPublicUser(updatedUser),
    });
  } catch (error) {
    console.error('Admin unban user error:', error);
    return res.status(500).json({ success: false, message: 'Failed to unban user account.' });
  }
});

const roleChangeSchema = z.object({
  role: z.enum(['user', 'admin', 'super_admin']),
});

adminRouter.patch(
  '/users/:userId/role',
  adminMutationLimiter,
  requireRole('super_admin'),
  async (req: AuthRequest, res) => {
    const userId = parseUuidParam(req.params.userId);
    if (!userId) return res.status(400).json({ success: false, message: 'Invalid user ID.' });

    const parsed = roleChangeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: 'Invalid role specified.' });
    }

    try {
      const targetUser = await getUserById(userId);
      if (!targetUser) return res.status(404).json({ success: false, message: 'User not found.' });

      const currentRole = normalizeRole(targetUser.role);
      const nextRole = normalizeRole(parsed.data.role);

      const perm = canChangeTargetRole(
        req.dbUser!.role,
        currentRole,
        nextRole,
        req.dbUser!.id,
        targetUser.id
      );
      if (!perm.allowed) {
        await recordAdminAuditLog({
          adminId: req.dbUser!.id,
          targetUserId: userId,
          action: 'change_user_role',
          entityType: 'user',
          entityId: userId,
          outcome: 'denied',
          previousValues: { role: currentRole },
          newValues: { role: nextRole },
          ipAddress: req.ip,
        });
        return res.status(403).json({ success: false, message: perm.reason });
      }

      if (currentRole === 'super_admin' && nextRole !== 'super_admin') {
        const superCount = await countActiveSuperAdmins();
        if (superCount <= 1) {
          return res.status(409).json({
            success: false,
            message: 'Cannot demote the last active Super Admin.',
          });
        }
      }

      const now = new Date();
      const [updated] = await db.transaction(async (tx) => {
        if (nextRole !== currentRole) {
          await tx
            .update(refreshTokens)
            .set({ revokedAt: now })
            .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
        }

        return tx
          .update(users)
          .set({
            role: nextRole,
            tokenVersion: sql`${users.tokenVersion} + 1`,
            updatedAt: now,
          })
          .where(eq(users.id, userId))
          .returning();
      });

      await Promise.all([
        recordAdminAuditLog({
          adminId: req.dbUser!.id,
          targetUserId: userId,
          action: 'change_user_role',
          entityType: 'user',
          entityId: userId,
          outcome: 'success',
          previousValues: { role: currentRole },
          newValues: { role: nextRole },
          ipAddress: req.ip,
        }),
        logUserActivity({
          userId,
          activityType: 'role_changed',
          description: `Account role updated from ${currentRole} to ${nextRole} by ${req.dbUser!.email}.`,
        }),
      ]);

      return res.json({
        success: true,
        message: `Updated user role to ${nextRole}.`,
        data: toPublicUser(updated),
      });
    } catch (error) {
      console.error('Admin change role error:', error);
      return res.status(500).json({ success: false, message: 'Failed to update user role.' });
    }
  }
);

// 12. Platform Activity Logs & Scoped Admin Audit Logs
adminRouter.get('/activities', requirePermission('analytics.operational.view'), async (req: AuthRequest, res) => {
  try {
    const userIdFilter =
      typeof req.query.userId === 'string' ? parseUuidParam(req.query.userId) : null;
    const activityType =
      typeof req.query.activityType === 'string' ? req.query.activityType.trim() : 'all';
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    const offset = (page - 1) * limit;

    const conditions = [];
    if (userIdFilter) conditions.push(eq(userActivities.userId, userIdFilter));
    if (activityType && activityType !== 'all') {
      conditions.push(eq(userActivities.activityType, activityType));
    }
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        or(
          ilike(userActivities.description, pattern),
          ilike(users.email, pattern),
          ilike(users.fullName, pattern)
        )!
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRows, rows] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(userActivities)
        .leftJoin(users, eq(userActivities.userId, users.id))
        .where(whereClause),
      db
        .select({
          id: userActivities.id,
          userId: userActivities.userId,
          activityType: userActivities.activityType,
          description: userActivities.description,
          relatedProjectId: userActivities.relatedProjectId,
          relatedAssetId: userActivities.relatedAssetId,
          metadata: userActivities.metadata,
          createdAt: userActivities.createdAt,
          userEmail: users.email,
          userFullName: users.fullName,
          userRole: users.role,
          isDemoAccount: users.isDemoAccount,
        })
        .from(userActivities)
        .leftJoin(users, eq(userActivities.userId, users.id))
        .where(whereClause)
        .orderBy(desc(userActivities.createdAt))
        .limit(limit)
        .offset(offset),
    ]);

    const total = totalRows[0]?.count ?? 0;

    return res.json({
      success: true,
      data: {
        items: rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
      },
    });
  } catch (error) {
    console.error('Admin activities error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load activity logs.' });
  }
});

adminRouter.get(
  '/audit-logs',
  requirePermission('analytics.operational.view'),
  async (req: AuthRequest, res) => {
    try {
      const callerRole = normalizeRole(req.dbUser!.role);
      const action = typeof req.query.action === 'string' ? req.query.action.trim() : 'all';
      const outcome = typeof req.query.outcome === 'string' ? req.query.outcome.trim() : 'all';
      const adminIdParam =
        typeof req.query.adminId === 'string' ? parseUuidParam(req.query.adminId) : null;
      const targetUserId =
        typeof req.query.targetUserId === 'string' ? parseUuidParam(req.query.targetUserId) : null;
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
      const offset = (page - 1) * limit;

      const conditions = [];
      if (action && action !== 'all') conditions.push(eq(adminAuditLogs.action, action));
      if (outcome && outcome !== 'all') conditions.push(eq(adminAuditLogs.outcome, outcome));
      // Worker Admins can view their own operational audit trail; full platform audit logs belong to Super Admin
      if (callerRole !== 'super_admin') {
        conditions.push(eq(adminAuditLogs.adminId, req.dbUser!.id));
      } else if (adminIdParam) {
        conditions.push(eq(adminAuditLogs.adminId, adminIdParam));
      }
      if (targetUserId) conditions.push(eq(adminAuditLogs.targetUserId, targetUserId));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [totalRows, logs] = await Promise.all([
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(adminAuditLogs)
          .where(whereClause),
        db
          .select()
          .from(adminAuditLogs)
          .where(whereClause)
          .orderBy(desc(adminAuditLogs.createdAt))
          .limit(limit)
          .offset(offset),
      ]);

      const referencedIds = new Set<string>();
      for (const l of logs) {
        if (l.adminId) referencedIds.add(l.adminId);
        if (l.targetUserId) referencedIds.add(l.targetUserId);
      }

      const emailMap = new Map<string, string>();
      if (referencedIds.size > 0) {
        const userRows = await db
          .select({ id: users.id, email: users.email })
          .from(users)
          .where(inArray(users.id, Array.from(referencedIds)));
        for (const r of userRows) emailMap.set(r.id, r.email);
      }

      const enriched = logs.map((l) => ({
        ...l,
        adminEmail: l.adminId ? emailMap.get(l.adminId) ?? null : null,
        targetEmail: l.targetUserId ? emailMap.get(l.targetUserId) ?? null : null,
      }));

      const total = totalRows[0]?.count ?? 0;

      return res.json({
        success: true,
        data: {
          items: enriched,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit)),
          },
        },
      });
    } catch (error) {
      console.error('Admin audit logs error:', error);
      return res.status(500).json({ success: false, message: 'Failed to load audit logs.' });
    }
  }
);

adminRouter.get(
  '/audit-logs/:logId',
  requirePermission('analytics.operational.view'),
  async (req: AuthRequest, res) => {
    const logId = parseUuidParam(req.params.logId);
    if (!logId) return res.status(400).json({ success: false, message: 'Invalid audit log ID.' });

    try {
      const rows = await db
        .select()
        .from(adminAuditLogs)
        .where(eq(adminAuditLogs.id, logId))
        .limit(1);
      const log = rows[0];
      if (!log) return res.status(404).json({ success: false, message: 'Audit log not found.' });
      if (normalizeRole(req.dbUser!.role) !== 'super_admin' && log.adminId !== req.dbUser!.id) {
        return res.status(403).json({ success: false, message: 'Only the Super Admin can view other admins’ audit logs.' });
      }
      return res.json({ success: true, data: log });
    } catch (error) {
      console.error('Admin single audit log error:', error);
      return res.status(500).json({ success: false, message: 'Failed to load audit log.' });
    }
  }
);

// 13. Operational Projects, Generation Job Retry & Operational CSV Reports
adminRouter.get('/projects', requirePermission('projects.view'), async (req: AuthRequest, res) => {
  try {
    const callerRole = normalizeRole(req.dbUser!.role);
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : 'all';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const offset = (page - 1) * limit;

    const conditions = [];
    if (callerRole !== 'super_admin') {
      conditions.push(or(eq(users.role, 'user'), eq(users.role, 'creator'))!);
    }
    if (status && status !== 'all') {
      conditions.push(eq(projects.status, status));
    }
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
          title: projects.title,
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
    console.error('Admin projects error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load projects.' });
  }
});

const updateProjectSchema = z.object({
  status: z.enum(['draft', 'processing', 'completed', 'failed']).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
});

adminRouter.patch(
  '/projects/:projectId',
  adminMutationLimiter,
  requirePermission('projects.manage'),
  async (req: AuthRequest, res) => {
    const projectId = parseUuidParam(req.params.projectId);
    if (!projectId) return res.status(400).json({ success: false, message: 'Invalid project ID.' });

    const parsed = updateProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: 'Invalid project update payload.' });
    }

    try {
      const rows = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
      const proj = rows[0];
      if (!proj) return res.status(404).json({ success: false, message: 'Project not found.' });

      const owner = await getUserById(proj.userId);
      if (owner && !canAdminInspectTarget(req.dbUser!.role, owner.role)) {
        return res.status(403).json({
          success: false,
          message: 'Only the Super Admin can manage Admin or Super Admin projects.',
        });
      }

      const [updated] = await db
        .update(projects)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(projects.id, projectId))
        .returning();

      await recordAdminAuditLog({
        adminId: req.dbUser!.id,
        targetUserId: proj.userId,
        action: 'manage_project',
        entityType: 'project',
        entityId: projectId,
        outcome: 'success',
        previousValues: { status: proj.status, title: proj.title },
        newValues: parsed.data,
        ipAddress: req.ip,
      });

      return res.json({ success: true, message: 'Project updated.', data: updated });
    } catch (error) {
      console.error('Admin update project error:', error);
      return res.status(500).json({ success: false, message: 'Failed to update project.' });
    }
  }
);

adminRouter.post(
  '/generation-jobs/:jobId/retry',
  adminMutationLimiter,
  requirePermission('generations.retry'),
  async (req: AuthRequest, res) => {
    const jobId = parseUuidParam(req.params.jobId);
    if (!jobId) return res.status(400).json({ success: false, message: 'Invalid job ID.' });

    try {
      const jobRows = await db.select().from(generationJobs).where(eq(generationJobs.id, jobId)).limit(1);
      const job = jobRows[0];
      if (!job) return res.status(404).json({ success: false, message: 'Generation job not found.' });

      const owner = await getUserById(job.userId);
      if (owner && !canAdminInspectTarget(req.dbUser!.role, owner.role)) {
        return res.status(403).json({
          success: false,
          message: 'Only the Super Admin can retry jobs owned by Admin accounts.',
        });
      }

      const retried = await retryGenerationJob(job.id, job.userId);

      await recordAdminAuditLog({
        adminId: req.dbUser!.id,
        targetUserId: job.userId,
        action: 'retry_generation_job',
        entityType: 'generation_job',
        entityId: job.id,
        outcome: 'success',
        previousValues: { status: job.status, attemptCount: job.attemptCount },
        newValues: { status: retried.job.status, attemptCount: retried.job.attemptCount },
        ipAddress: req.ip,
      });

      return res.status(202).json({
        success: true,
        message: 'Generation job queued for retry.',
        data: retried.job,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to retry generation job.';
      return res.status(400).json({ success: false, message: msg });
    }
  }
);

adminRouter.get('/reports/export', requirePermission('reports.export'), async (req: AuthRequest, res) => {
  try {
    const callerRole = normalizeRole(req.dbUser!.role);
    const userRows = await db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        role: users.role,
        accountStatus: users.accountStatus,
        isVerified: users.isVerified,
        isDemoAccount: users.isDemoAccount,
        creditsBalance: users.creditsBalance,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .where(
        callerRole !== 'super_admin'
          ? or(eq(users.role, 'user'), eq(users.role, 'creator'))
          : undefined
      )
      .orderBy(desc(users.createdAt))
      .limit(2000);

    const header = [
      'id',
      'email',
      'fullName',
      'role',
      'accountStatus',
      'isVerified',
      'isDemoAccount',
      'creditsBalance',
      'createdAt',
      'lastLoginAt',
    ].join(',');
    const lines = userRows.map((u) =>
      [
        u.id,
        u.email,
        u.fullName || '',
        normalizeRole(u.role),
        u.accountStatus,
        u.isVerified,
        u.isDemoAccount,
        u.creditsBalance,
        u.createdAt.toISOString(),
        u.lastLoginAt ? u.lastLoginAt.toISOString() : '',
      ]
        .map(escapeCsvCell)
        .join(',')
    );

    await recordAdminAuditLog({
      adminId: req.dbUser!.id,
      action: 'export_operational_report',
      entityType: 'report',
      entityId: 'users_csv',
      outcome: 'success',
      newValues: { rowCount: userRows.length },
      ipAddress: req.ip,
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="briqen-operational-users-report.csv"');
    return res.send([header, ...lines].join('\n'));
  } catch (error) {
    console.error('Admin CSV export error:', error);
    return res.status(500).json({ success: false, message: 'Failed to export CSV report.' });
  }
});

