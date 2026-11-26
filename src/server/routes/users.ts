import crypto from 'crypto';
import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { and, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import {
  assets,
  billingTransactions,
  emailVerificationTokens,
  exportsTable,
  generationActions,
  generationJobs,
  notificationPreferences,
  projects,
  refreshTokens,
  scenes,
  scriptRevisions,
  userActivities,
  userPreferences,
  users,
} from '../../db/schema.ts';
import {
  getOrCreateNotificationPreferences,
  getOrCreateUserPreferences,
  getUserById,
  toPublicUser,
} from '../../db/users.ts';
import { AuthRequest, requireAuth } from '../../middleware/auth.ts';
import {
  clearRefreshCookie,
  generateOpaqueToken,
  hashOpaqueToken,
  hashPassword,
  parseCookies,
  REFRESH_COOKIE_NAME,
  REFRESH_TTL_REMEMBER_MS,
  REFRESH_TTL_SHORT_MS,
  setRefreshCookie,
  signAccessToken,
  validatePasswordComplexity,
  VERIFY_TOKEN_TTL_MS,
  verifyPassword,
  verifySameOriginOrCustomHeader,
} from '../auth/security.ts';
import { createSignedMediaUrl, deleteObject, saveObject } from '../storage.ts';
import { logUserActivity } from '../services/activityService.ts';

const execFileAsync = promisify(execFile);

export const usersRouter = Router();
usersRouter.use(requireAuth);

// Sliding-window rate limiter for sensitive account actions
const sensitiveBuckets = new Map<string, { count: number; resetAt: number }>();
function createUserRateLimiter(maxRequests: number, windowMs: number) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const userId = req.dbUser?.id || req.ip || 'anon';
    const key = `${req.path}:${userId}`;
    const now = Date.now();
    const entry = sensitiveBuckets.get(key);
    if (!entry || now > entry.resetAt) {
      sensitiveBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > maxRequests) {
      const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        success: false,
        message: 'Too many sensitive account requests. Please wait a moment and try again.',
      });
    }
    return next();
  };
}

const sensitiveActionLimiter = createUserRateLimiter(15, 15 * 60 * 1000);
const avatarUploadLimiter = createUserRateLimiter(20, 15 * 60 * 1000);

function isGoogleOAuthConfigured(): boolean {
  try {
    const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (!fs.existsSync(cfgPath)) return false;
    const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as {
      apiKey?: string;
      authDomain?: string;
      oAuthClientId?: string;
    };
    return Boolean(raw.apiKey && raw.authDomain && raw.oAuthClientId);
  } catch {
    return false;
  }
}

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
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'jpeg';
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
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
  // WebP: RIFF....WEBP
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
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'briqen-avatar-'));
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

const updateProfileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Full name must be at least 2 characters.')
    .max(100, 'Full name must be 100 characters or fewer.')
    .optional(),
  username: z
    .string()
    .trim()
    .max(32, 'Username must be 32 characters or fewer.')
    .refine(
      (val) => val === '' || /^[a-zA-Z0-9_.-]{3,32}$/.test(val),
      'Username must be 3–32 characters using letters, numbers, underscores, hyphens, or dots.'
    )
    .nullable()
    .optional(),
  email: z
    .string()
    .trim()
    .email('Please enter a valid email address.')
    .max(254)
    .optional(),
  phoneNumber: z
    .string()
    .trim()
    .max(24, 'Phone number is too long.')
    .refine(
      (val) => val === '' || (/^[+]?[0-9\s\-().]{7,20}$/.test(val) && val.replace(/\D/g, '').length >= 7),
      'Enter a valid phone number (7–20 digits, optional +, spaces, or dashes).'
    )
    .nullable()
    .optional(),
  bio: z
    .string()
    .trim()
    .max(500, 'Bio must be 500 characters or fewer.')
    .nullable()
    .optional(),
  country: z.string().trim().max(100).nullable().optional(),
  state: z.string().trim().max(100).nullable().optional(),
  city: z.string().trim().max(100).nullable().optional(),
  website: optionalUrlSchema('Website URL'),
  linkedinUrl: optionalUrlSchema('LinkedIn URL', ['linkedin.com']),
  githubUrl: optionalUrlSchema('GitHub URL', ['github.com']),
});

// GET /api/v1/users/me
usersRouter.get('/users/me', async (req: AuthRequest, res) => {
  try {
    const userId = req.dbUser!.id;
    const [preferences, notifications] = await Promise.all([
      getOrCreateUserPreferences(userId),
      getOrCreateNotificationPreferences(userId),
    ]);

    return res.json({
      success: true,
      data: {
        user: req.dbUser,
        preferences,
        notifications,
      },
    });
  } catch (error) {
    console.error('Get /users/me error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load profile.' });
  }
});

// PATCH /api/v1/users/me
usersRouter.patch('/users/me', async (req: AuthRequest, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return res.status(400).json({
      success: false,
      message: firstIssue?.message || 'Invalid profile update payload.',
      errors: parsed.error.flatten().fieldErrors,
    });
  }

  const userId = req.dbUser!.id;
  const data = parsed.data;
  const normalizedUsername =
    data.username === undefined
      ? undefined
      : normalizeOptionalString(data.username)?.toLowerCase() ?? null;
  const requestedEmail =
    data.email !== undefined ? data.email.trim().toLowerCase() : undefined;

  try {
    let rawEmailToken: string | null = null;
    let pendingEmailTarget: string | null = null;

    const txOutcome = await db.transaction(async (tx) => {
      const currentRows = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
      const currentUser = currentRows[0];
      if (!currentUser) return { status: 'not_found' as const };

      if (normalizedUsername !== undefined && normalizedUsername !== null) {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`uname:${normalizedUsername}`}))`);
        const taken = await tx
          .select({ id: users.id })
          .from(users)
          .where(sql`lower(${users.username}) = ${normalizedUsername} AND ${users.id} <> ${userId}`)
          .limit(1);
        if (taken.length > 0) {
          return { status: 'username_taken' as const };
        }
      }

      const updateFields: Partial<typeof users.$inferInsert> = {
        updatedAt: new Date(),
      };

      if (data.fullName !== undefined) {
        updateFields.fullName = data.fullName.trim();
        updateFields.displayName = data.fullName.trim();
      }
      if (normalizedUsername !== undefined) {
        updateFields.username = normalizedUsername;
      }
      if (data.phoneNumber !== undefined) {
        updateFields.phoneNumber = normalizeOptionalString(data.phoneNumber);
      }
      if (data.bio !== undefined) {
        updateFields.bio = normalizeOptionalString(data.bio);
      }
      if (data.country !== undefined) {
        updateFields.country = normalizeOptionalString(data.country);
      }
      if (data.state !== undefined) {
        updateFields.state = normalizeOptionalString(data.state);
      }
      if (data.city !== undefined) {
        updateFields.city = normalizeOptionalString(data.city);
      }
      if (data.website !== undefined) {
        updateFields.website = normalizeOptionalString(data.website);
      }
      if (data.linkedinUrl !== undefined) {
        updateFields.linkedinUrl = normalizeOptionalString(data.linkedinUrl);
      }
      if (data.githubUrl !== undefined) {
        updateFields.githubUrl = normalizeOptionalString(data.githubUrl);
      }

      if (requestedEmail && requestedEmail !== currentUser.email.toLowerCase()) {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${requestedEmail}))`);
        const emailConflict = await tx
          .select({ id: users.id })
          .from(users)
          .where(sql`lower(${users.email}) = ${requestedEmail} AND ${users.id} <> ${userId}`)
          .limit(1);
        if (emailConflict.length > 0) {
          return { status: 'email_taken' as const };
        }

        rawEmailToken = generateOpaqueToken();
        pendingEmailTarget = requestedEmail;
        updateFields.pendingEmail = requestedEmail;

        await tx
          .update(emailVerificationTokens)
          .set({ usedAt: new Date() })
          .where(and(eq(emailVerificationTokens.userId, userId), isNull(emailVerificationTokens.usedAt)));

        await tx.insert(emailVerificationTokens).values({
          userId,
          pendingEmail: requestedEmail,
          tokenHash: hashOpaqueToken(rawEmailToken),
          expiresAt: new Date(Date.now() + VERIFY_TOKEN_TTL_MS),
        });
      }

      const [updated] = await tx
        .update(users)
        .set(updateFields)
        .where(eq(users.id, userId))
        .returning();

      return { status: 'ok' as const, user: updated };
    });

    if (txOutcome.status === 'not_found') {
      return res.status(404).json({ success: false, message: 'User account not found.' });
    }
    if (txOutcome.status === 'username_taken') {
      return res.status(409).json({
        success: false,
        message: 'That username is already taken. Please choose another.',
      });
    }
    if (txOutcome.status === 'email_taken') {
      return res.status(409).json({
        success: false,
        message: 'That email address is already registered to another account.',
      });
    }

    if (rawEmailToken && pendingEmailTarget && process.env.NODE_ENV !== 'production') {
      const origin = process.env.APP_URL || `${req.protocol}://${req.get('Host') || 'localhost:3000'}`;
      console.info(
        `[Auth] Pending email change verification link for ${pendingEmailTarget}: ${origin}/verify-email?token=${rawEmailToken}`
      );
    }

    await logUserActivity({
      userId,
      activityType: 'profile_updated',
      description: pendingEmailTarget
        ? `Updated profile and requested email change to ${pendingEmailTarget}.`
        : 'Updated personal profile information.',
    });

    return res.json({
      success: true,
      message: pendingEmailTarget
        ? `Profile saved. Verification is required to switch your email to ${pendingEmailTarget}.`
        : 'Personal information updated.',
      data: {
        user: toPublicUser(txOutcome.user, req.dbUser?.permissions),
        requiresEmailVerification: Boolean(pendingEmailTarget),
        pendingEmail: pendingEmailTarget,
      },
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update profile.' });
  }
});

// POST /api/v1/users/me/resend-verification
usersRouter.post('/users/me/resend-verification', sensitiveActionLimiter, async (req: AuthRequest, res) => {
  try {
    const userRow = await getUserById(req.dbUser!.id);
    if (!userRow) return res.status(404).json({ success: false, message: 'Account not found.' });

    const targetEmail = userRow.pendingEmail || (!userRow.isVerified ? userRow.email : null);
    if (!targetEmail) {
      return res.json({
        success: true,
        message: 'Your email address is already verified.',
      });
    }

    const rawToken = generateOpaqueToken();
    await db.transaction(async (tx) => {
      await tx
        .update(emailVerificationTokens)
        .set({ usedAt: new Date() })
        .where(and(eq(emailVerificationTokens.userId, userRow.id), isNull(emailVerificationTokens.usedAt)));

      await tx.insert(emailVerificationTokens).values({
        userId: userRow.id,
        pendingEmail: userRow.pendingEmail || null,
        tokenHash: hashOpaqueToken(rawToken),
        expiresAt: new Date(Date.now() + VERIFY_TOKEN_TTL_MS),
      });
    });

    if (process.env.NODE_ENV !== 'production') {
      const origin = process.env.APP_URL || `${req.protocol}://${req.get('Host') || 'localhost:3000'}`;
      console.info(`[Auth] Verification link for ${targetEmail}: ${origin}/verify-email?token=${rawToken}`);
    }

    return res.json({
      success: true,
      message: `A fresh verification link has been prepared for ${targetEmail}.`,
    });
  } catch (error) {
    console.error('Resend verification error:', error);
    return res.status(500).json({ success: false, message: 'Failed to send verification link.' });
  }
});

// POST /api/v1/users/me/avatar
usersRouter.post(
  '/users/me/avatar',
  avatarUploadLimiter,
  handleAvatarMulter,
  async (req: AuthRequest, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ success: false, message: 'Please select an image file to upload.' });
      }
      if (file.size > MAX_AVATAR_BYTES) {
        return res.status(400).json({ success: false, message: 'Profile picture must be 5 MB or smaller.' });
      }

      const ext = path.extname(file.originalname || '').toLowerCase();
      if (!ALLOWED_AVATAR_MIMES.has(file.mimetype.toLowerCase()) || (ext && !ALLOWED_AVATAR_EXTS.has(ext))) {
        return res.status(400).json({
          success: false,
          message: 'Unsupported image format. Please upload a JPG, JPEG, PNG, or WebP file.',
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
      const userId = req.dbUser!.id;
      const previousKey = req.dbUser!.profileImageKey;
      const newStorageKey = `avatars/${userId}/avatar_${crypto.randomUUID()}.webp`;

      await saveObject(newStorageKey, processed.buffer);

      const [updatedUser] = await db
        .update(users)
        .set({
          profileImageKey: newStorageKey,
          avatarUrl: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning();

      if (previousKey && previousKey !== newStorageKey) {
        await deleteObject(previousKey);
      }

      await logUserActivity({
        userId,
        activityType: 'profile_picture_updated',
        description: 'Uploaded a new profile picture.',
      });

      return res.json({
        success: true,
        message: 'Profile picture updated.',
        data: {
          user: toPublicUser(updatedUser, req.dbUser?.permissions),
          sizeBytes: processed.buffer.byteLength,
          mimeType: processed.mimeType,
        },
      });
    } catch (error) {
      console.error('Avatar upload error:', error);
      return res.status(400).json({
        success: false,
        message: 'Could not process profile picture. Please upload a valid JPG, PNG, or WebP image.',
      });
    }
  }
);

// DELETE /api/v1/users/me/avatar
usersRouter.delete('/users/me/avatar', async (req: AuthRequest, res) => {
  try {
    const userId = req.dbUser!.id;
    const current = await getUserById(userId);
    if (!current) return res.status(404).json({ success: false, message: 'User not found.' });

    const oldKey = current.profileImageKey;
    const [updatedUser] = await db
      .update(users)
      .set({
        profileImageKey: null,
        avatarUrl: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    if (oldKey) {
      await deleteObject(oldKey);
    }

    await logUserActivity({
      userId,
      activityType: 'profile_picture_removed',
      description: 'Removed profile picture.',
    });

    return res.json({
      success: true,
      message: 'Profile picture removed.',
      data: {
        user: toPublicUser(updatedUser, req.dbUser?.permissions),
      },
    });
  } catch (error) {
    console.error('Avatar delete error:', error);
    return res.status(500).json({ success: false, message: 'Failed to remove profile picture.' });
  }
});

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required.').max(128),
    newPassword: z.string().min(8, 'New password must be at least 8 characters.').max(128),
    confirmNewPassword: z.string().min(1, 'Please confirm your new password.'),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    path: ['confirmNewPassword'],
    message: 'New password and confirmation do not match.',
  });

// POST /api/v1/users/me/change-password
usersRouter.post('/users/me/change-password', sensitiveActionLimiter, async (req: AuthRequest, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: parsed.error.issues[0]?.message || 'Invalid password change request.',
      errors: parsed.error.flatten().fieldErrors,
    });
  }

  const { currentPassword, newPassword } = parsed.data;
  const complexity = validatePasswordComplexity(newPassword);
  if (!complexity.valid) {
    return res.status(400).json({ success: false, message: complexity.reason });
  }

  try {
    const userRow = await getUserById(req.dbUser!.id);
    if (!userRow) return res.status(404).json({ success: false, message: 'Account not found.' });

    if (!userRow.passwordHash) {
      return res.status(400).json({
        success: false,
        message: 'This account uses Google Sign-In without a local password. Use Forgot Password to set one.',
      });
    }

    const currentMatches = await verifyPassword(currentPassword, userRow.passwordHash);
    if (!currentMatches) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect.',
      });
    }

    const reusedPassword = await verifyPassword(newPassword, userRow.passwordHash);
    if (reusedPassword) {
      return res.status(400).json({
        success: false,
        message: 'New password must be different from your current password.',
      });
    }

    const newHash = await hashPassword(newPassword);
    const now = new Date();
    const cookies = parseCookies(req.headers.cookie);
    const currentRefreshRaw = cookies[REFRESH_COOKIE_NAME];
    const currentRefreshHash = currentRefreshRaw ? hashOpaqueToken(currentRefreshRaw) : null;

    let rotatedRawRefresh: string | null = null;
    let rotatedTtlMs = REFRESH_TTL_SHORT_MS;

    const updatedUser = await db.transaction(async (tx) => {
      let rememberMe = false;
      if (currentRefreshHash) {
        const curRows = await tx
          .select()
          .from(refreshTokens)
          .where(and(eq(refreshTokens.tokenHash, currentRefreshHash), eq(refreshTokens.userId, userRow.id)))
          .limit(1);
        rememberMe = curRows[0]?.rememberMe ?? false;
      }

      // Revoke all existing refresh tokens for this user
      await tx
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(and(eq(refreshTokens.userId, userRow.id), isNull(refreshTokens.revokedAt)));

      // Update passwordHash, passwordChangedAt, and increment tokenVersion to invalidate old access tokens
      const [savedUser] = await tx
        .update(users)
        .set({
          passwordHash: newHash,
          passwordChangedAt: now,
          tokenVersion: sql`${users.tokenVersion} + 1`,
          updatedAt: now,
        })
        .where(eq(users.id, userRow.id))
        .returning();

      // Issue a fresh rotated refresh token for the active caller session
      if (currentRefreshHash || userRow.uid.startsWith('local:')) {
        rotatedRawRefresh = generateOpaqueToken();
        rotatedTtlMs = rememberMe ? REFRESH_TTL_REMEMBER_MS : REFRESH_TTL_SHORT_MS;
        await tx.insert(refreshTokens).values({
          userId: userRow.id,
          tokenHash: hashOpaqueToken(rotatedRawRefresh),
          familyId: crypto.randomUUID(),
          rememberMe,
          userAgent: (req.get('User-Agent') || '').slice(0, 250) || null,
          ipAddress: (req.ip || '').slice(0, 64) || null,
          expiresAt: new Date(Date.now() + rotatedTtlMs),
        });
      }

      return savedUser;
    });

    await logUserActivity({
      userId: userRow.id,
      activityType: 'password_change',
      description: 'Changed account password and revoked other active sessions.',
    });

    const { token: accessToken, expiresIn } = signAccessToken(updatedUser);
    if (rotatedRawRefresh) {
      setRefreshCookie(res, rotatedRawRefresh, rotatedTtlMs);
    }

    return res.json({
      success: true,
      message: 'Password updated successfully. Other sessions have been signed out.',
      data: {
        accessToken,
        expiresIn,
        user: toPublicUser(updatedUser, req.dbUser?.permissions),
      },
    });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update password.' });
  }
});

// GET /api/v1/users/me/security
usersRouter.get('/users/me/security', async (req: AuthRequest, res) => {
  try {
    const userRow = await getUserById(req.dbUser!.id);
    if (!userRow) return res.status(404).json({ success: false, message: 'Account not found.' });

    const now = new Date();
    const activeSessions = await db
      .select({ id: refreshTokens.id })
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.userId, userRow.id),
          isNull(refreshTokens.revokedAt),
          gt(refreshTokens.expiresAt, now)
        )
      );

    const googleConfigured = isGoogleOAuthConfigured();
    const googleConnected = !userRow.uid.startsWith('local:');

    const recommendations: Array<{ id: string; title: string; detail: string; status: 'done' | 'action' }> = [
      {
        id: 'email_verified',
        title: 'Verify primary email address',
        detail: userRow.isVerified
          ? 'Your primary email address is verified.'
          : 'Verify your email address to safeguard account recovery.',
        status: userRow.isVerified ? 'done' : 'action',
      },
      {
        id: 'password_hygiene',
        title: 'Maintain a unique, strong password',
        detail: userRow.passwordHash
          ? userRow.passwordChangedAt
            ? `Last updated on ${userRow.passwordChangedAt.toLocaleDateString()}.`
            : 'Use a unique password with uppercase, lowercase, numbers, and symbols.'
          : 'You authenticate via Google OAuth.',
        status: userRow.passwordHash || googleConnected ? 'done' : 'action',
      },
      {
        id: 'active_sessions',
        title: 'Review active sessions periodically',
        detail: `${activeSessions.length} active refresh session${activeSessions.length === 1 ? '' : 's'} currently recorded.`,
        status: activeSessions.length <= 3 ? 'done' : 'action',
      },
    ];

    return res.json({
      success: true,
      data: {
        currentLoginStatus: 'active',
        authMethod: userRow.passwordHash
          ? googleConnected
            ? 'google_and_password'
            : 'password'
          : 'google_oauth',
        emailVerified: userRow.isVerified,
        pendingEmail: userRow.pendingEmail ?? null,
        hasLocalPassword: Boolean(userRow.passwordHash),
        passwordLastChangedAt: userRow.passwordChangedAt ?? null,
        lastLoginAt: userRow.lastLoginAt ?? null,
        activeSessionCount: activeSessions.length,
        googleOAuthConfigured: googleConfigured,
        googleConnected: googleConfigured && googleConnected,
        recommendations,
      },
    });
  } catch (error) {
    console.error('Security status error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load security status.' });
  }
});

// GET /api/v1/users/me/sessions
usersRouter.get('/users/me/sessions', async (req: AuthRequest, res) => {
  try {
    const cookies = parseCookies(req.headers.cookie);
    const currentRaw = cookies[REFRESH_COOKIE_NAME];
    const currentHash = currentRaw ? hashOpaqueToken(currentRaw) : null;
    const now = new Date();

    const rows = await db
      .select({
        id: refreshTokens.id,
        familyId: refreshTokens.familyId,
        tokenHash: refreshTokens.tokenHash,
        rememberMe: refreshTokens.rememberMe,
        userAgent: refreshTokens.userAgent,
        ipAddress: refreshTokens.ipAddress,
        createdAt: refreshTokens.createdAt,
        expiresAt: refreshTokens.expiresAt,
      })
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.userId, req.dbUser!.id),
          isNull(refreshTokens.revokedAt),
          gt(refreshTokens.expiresAt, now)
        )
      )
      .orderBy(desc(refreshTokens.createdAt));

    const safeSessions = rows.map((row) => ({
      id: row.id,
      familyId: row.familyId,
      rememberMe: row.rememberMe,
      userAgent: row.userAgent || 'Browser session',
      ipAddress: row.ipAddress || 'Unknown IP',
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      isCurrent: Boolean(currentHash && row.tokenHash === currentHash),
    }));

    return res.json({
      success: true,
      data: safeSessions,
    });
  } catch (error) {
    console.error('List sessions error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load active sessions.' });
  }
});

// DELETE /api/v1/users/me/sessions/:sessionId
usersRouter.delete('/users/me/sessions/:sessionId', async (req: AuthRequest, res) => {
  const { sessionId } = req.params;
  if (!z.string().uuid().safeParse(sessionId).success) {
    return res.status(400).json({ success: false, message: 'Invalid session ID.' });
  }

  try {
    const cookies = parseCookies(req.headers.cookie);
    const currentRaw = cookies[REFRESH_COOKIE_NAME];
    const currentHash = currentRaw ? hashOpaqueToken(currentRaw) : null;

    const targetRows = await db
      .select()
      .from(refreshTokens)
      .where(and(eq(refreshTokens.id, sessionId), eq(refreshTokens.userId, req.dbUser!.id)))
      .limit(1);

    const target = targetRows[0];
    if (!target) {
      return res.status(404).json({ success: false, message: 'Session not found.' });
    }

    const now = new Date();
    await db
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(
        and(
          eq(refreshTokens.userId, req.dbUser!.id),
          eq(refreshTokens.familyId, target.familyId),
          isNull(refreshTokens.revokedAt)
        )
      );

    const revokedCurrentSession = Boolean(currentHash && target.tokenHash === currentHash);
    if (revokedCurrentSession) {
      clearRefreshCookie(res);
    }

    return res.json({
      success: true,
      message: revokedCurrentSession ? 'Current session revoked.' : 'Session revoked.',
      data: { revokedCurrentSession },
    });
  } catch (error) {
    console.error('Revoke session error:', error);
    return res.status(500).json({ success: false, message: 'Failed to revoke session.' });
  }
});

// POST /api/v1/users/me/logout-all
usersRouter.post('/users/me/logout-all', async (req: AuthRequest, res) => {
  if (req.headers.cookie && !verifySameOriginOrCustomHeader(req)) {
    return res.status(403).json({ success: false, message: 'Forbidden: Cross-origin request blocked.' });
  }

  try {
    const userId = req.dbUser!.id;
    const now = new Date();

    await db.transaction(async (tx) => {
      await tx
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));

      await tx
        .update(users)
        .set({
          tokenVersion: sql`${users.tokenVersion} + 1`,
          updatedAt: now,
        })
        .where(eq(users.id, userId));
    });

    clearRefreshCookie(res);
    return res.json({
      success: true,
      message: 'Signed out from all devices and invalidated active access tokens.',
    });
  } catch (error) {
    console.error('Logout-all error:', error);
    return res.status(500).json({ success: false, message: 'Failed to sign out from all devices.' });
  }
});

const preferencesSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  language: z.string().trim().min(2).max(16).optional(),
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .refine((tz) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, 'Please choose a valid IANA time zone.')
    .optional(),
  defaultAspectRatio: z.enum(['16:9', '9:16', '1:1', '4:3']).optional(),
  defaultExportQuality: z.enum(['standard', 'low']).optional(),
});

// GET /api/v1/users/me/preferences
usersRouter.get('/users/me/preferences', async (req: AuthRequest, res) => {
  try {
    const prefs = await getOrCreateUserPreferences(req.dbUser!.id);
    return res.json({ success: true, data: prefs });
  } catch (error) {
    console.error('Get preferences error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load preferences.' });
  }
});

// PATCH /api/v1/users/me/preferences
usersRouter.patch('/users/me/preferences', async (req: AuthRequest, res) => {
  const parsed = preferencesSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: parsed.error.issues[0]?.message || 'Invalid preferences payload.',
    });
  }

  try {
    const existing = await getOrCreateUserPreferences(req.dbUser!.id);
    const [updated] = await db
      .update(userPreferences)
      .set({
        ...parsed.data,
        updatedAt: new Date(),
      })
      .where(eq(userPreferences.id, existing.id))
      .returning();

    return res.json({
      success: true,
      message: 'Workspace preferences saved.',
      data: updated,
    });
  } catch (error) {
    console.error('Update preferences error:', error);
    return res.status(500).json({ success: false, message: 'Failed to save preferences.' });
  }
});

const notificationPrefsSchema = z.object({
  emailNotifications: z.boolean().optional(),
  projectUpdates: z.boolean().optional(),
  generationCompleted: z.boolean().optional(),
  generationFailed: z.boolean().optional(),
  productAnnouncements: z.boolean().optional(),
  marketingEmails: z.boolean().optional(),
});

// GET /api/v1/users/me/notifications
usersRouter.get('/users/me/notifications', async (req: AuthRequest, res) => {
  try {
    const prefs = await getOrCreateNotificationPreferences(req.dbUser!.id);
    return res.json({ success: true, data: prefs });
  } catch (error) {
    console.error('Get notifications error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load notification settings.' });
  }
});

// PATCH /api/v1/users/me/notifications
usersRouter.patch('/users/me/notifications', async (req: AuthRequest, res) => {
  const parsed = notificationPrefsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: parsed.error.issues[0]?.message || 'Invalid notification settings.',
    });
  }

  try {
    const existing = await getOrCreateNotificationPreferences(req.dbUser!.id);
    const [updated] = await db
      .update(notificationPreferences)
      .set({
        ...parsed.data,
        updatedAt: new Date(),
      })
      .where(eq(notificationPreferences.id, existing.id))
      .returning();

    return res.json({
      success: true,
      message: 'Notification settings saved.',
      data: updated,
    });
  } catch (error) {
    console.error('Update notifications error:', error);
    return res.status(500).json({ success: false, message: 'Failed to save notification settings.' });
  }
});

// GET /api/v1/users/me/export
usersRouter.get('/users/me/export', async (req: AuthRequest, res) => {
  try {
    const userId = req.dbUser!.id;
    const [preferences, notifications, userProjects, userAssets, userExports, userBilling] =
      await Promise.all([
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
      ]);

    const projectIds = userProjects.map((p) => p.id);
    const [projectRevisions, projectScenes] =
      projectIds.length > 0
        ? await Promise.all([
            db
              .select()
              .from(scriptRevisions)
              .where(inArray(scriptRevisions.projectId, projectIds)),
            db.select().from(scenes).where(inArray(scenes.projectId, projectIds)),
          ])
        : [[], []];

    return res.json({
      success: true,
      data: {
        exportedAt: new Date().toISOString(),
        schemaVersion: '1.0',
        user: req.dbUser,
        preferences,
        notifications,
        projects: userProjects,
        scriptRevisions: projectRevisions,
        scenes: projectScenes,
        assets: userAssets,
        exports: userExports,
        billingTransactions: userBilling,
      },
    });
  } catch (error) {
    console.error('Export personal data error:', error);
    return res.status(500).json({ success: false, message: 'Failed to export personal data.' });
  }
});

const deletionRequestSchema = z.object({
  password: z.string().max(128).optional(),
  confirmEmail: z.string().trim().email().optional(),
  confirmPhrase: z.string().trim().optional(),
  confirmDeletion: z.literal(true, {
    message: 'Please explicitly confirm that you understand the account deletion policy.',
  }),
  reason: z.string().trim().max(500).optional(),
  finalizeDeletion: z.boolean().optional().default(false),
});

// POST /api/v1/users/me/deletion-request
usersRouter.post('/users/me/deletion-request', sensitiveActionLimiter, async (req: AuthRequest, res) => {
  const parsed = deletionRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: parsed.error.issues[0]?.message || 'Invalid deletion request.',
    });
  }

  try {
    const userRow = await getUserById(req.dbUser!.id);
    if (!userRow) return res.status(404).json({ success: false, message: 'Account not found.' });

    if (userRow.passwordHash) {
      if (!parsed.data.password) {
        return res.status(400).json({
          success: false,
          message: 'Please enter your current password to verify account deletion.',
        });
      }
      const ok = await verifyPassword(parsed.data.password, userRow.passwordHash);
      if (!ok) {
        return res.status(400).json({
          success: false,
          message: 'Incorrect password. Account deletion request denied.',
        });
      }
    } else {
      const emailOk =
        parsed.data.confirmEmail?.toLowerCase() === userRow.email.toLowerCase();
      if (!emailOk) {
        return res.status(400).json({
          success: false,
          message: 'Please enter your exact account email address to verify deletion.',
        });
      }
    }

    if (parsed.data.confirmPhrase !== undefined && parsed.data.confirmPhrase !== 'DELETE') {
      return res.status(400).json({
        success: false,
        message: 'Type DELETE to confirm your account deletion request.',
      });
    }

    const now = new Date();
    const scheduledFor = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const finalize = Boolean(parsed.data.finalizeDeletion);

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(users)
        .set({
          deletionRequestedAt: userRow.deletionRequestedAt || now,
          deletionScheduledFor: userRow.deletionScheduledFor || scheduledFor,
          deletionReason: normalizeOptionalString(parsed.data.reason) ?? userRow.deletionReason,
          ...(finalize
            ? {
                deletedAt: now,
                isActive: false,
                tokenVersion: sql`${users.tokenVersion} + 1`,
              }
            : {}),
          updatedAt: now,
        })
        .where(eq(users.id, userRow.id))
        .returning();

      if (finalize) {
        await tx
          .update(refreshTokens)
          .set({ revokedAt: now })
          .where(and(eq(refreshTokens.userId, userRow.id), isNull(refreshTokens.revokedAt)));
      }

      return row;
    });

    await logUserActivity({
      userId: userRow.id,
      activityType: finalize ? 'account_deactivated' : 'deletion_requested',
      description: finalize
        ? 'Finalized self-service account deactivation.'
        : `Scheduled account deletion for ${scheduledFor.toLocaleDateString()}.`,
    });

    if (finalize) {
      clearRefreshCookie(res);
    }

    return res.json({
      success: true,
      message: finalize
        ? 'Account deactivated and all active sessions revoked. Personal data is scheduled for permanent purge after the retention window.'
        : `Account deletion scheduled for ${scheduledFor.toLocaleDateString()}. You may cancel anytime before then.`,
      data: {
        user: toPublicUser(updated, req.dbUser?.permissions),
        deactivated: finalize,
        deletionScheduledFor: updated.deletionScheduledFor,
      },
    });
  } catch (error) {
    console.error('Deletion request error:', error);
    return res.status(500).json({ success: false, message: 'Failed to submit deletion request.' });
  }
});

// POST /api/v1/users/me/cancel-deletion
usersRouter.post('/users/me/cancel-deletion', async (req: AuthRequest, res) => {
  try {
    const userRow = await getUserById(req.dbUser!.id);
    if (!userRow) return res.status(404).json({ success: false, message: 'Account not found.' });

    const [updated] = await db
      .update(users)
      .set({
        deletionRequestedAt: null,
        deletionScheduledFor: null,
        deletionReason: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userRow.id))
      .returning();

    return res.json({
      success: true,
      message: 'Account deletion request has been cancelled.',
      data: {
        user: toPublicUser(updated, req.dbUser?.permissions),
      },
    });
  } catch (error) {
    console.error('Cancel deletion error:', error);
    return res.status(500).json({ success: false, message: 'Failed to cancel deletion request.' });
  }
});

// GET /api/v1/users/me/assets (strictly scoped to caller's own assets and exports)
usersRouter.get('/users/me/assets', async (req: AuthRequest, res) => {
  try {
    const userId = req.dbUser!.id;
    const assetTypeFilter =
      typeof req.query.assetType === 'string' ? req.query.assetType.trim() : 'all';

    const assetConditions = [eq(assets.userId, userId)];
    if (assetTypeFilter && assetTypeFilter !== 'all') {
      assetConditions.push(eq(assets.assetType, assetTypeFilter));
    }

    const [assetRows, exportRows] = await Promise.all([
      db
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
          promptUsed: assets.promptUsed,
          isAccepted: assets.isAccepted,
          createdAt: assets.createdAt,
        })
        .from(assets)
        .leftJoin(projects, eq(assets.projectId, projects.id))
        .where(and(...assetConditions))
        .orderBy(desc(assets.createdAt))
        .limit(120),
      db
        .select({
          id: exportsTable.id,
          projectId: exportsTable.projectId,
          projectTitle: projects.title,
          title: exportsTable.title,
          format: exportsTable.format,
          resolution: exportsTable.resolution,
          totalDurationSec: exportsTable.totalDurationSec,
          storageKey: exportsTable.storageKey,
          fileSizeBytes: exportsTable.fileSizeBytes,
          status: exportsTable.status,
          createdAt: exportsTable.createdAt,
        })
        .from(exportsTable)
        .leftJoin(projects, eq(exportsTable.projectId, projects.id))
        .where(eq(exportsTable.userId, userId))
        .orderBy(desc(exportsTable.createdAt))
        .limit(60),
    ]);

    const enrichedAssets = assetRows.map((a) => ({
      ...a,
      signedUrl: createSignedMediaUrl(a.storageKey),
      downloadUrl: `${createSignedMediaUrl(a.storageKey)}&download=1`,
    }));

    const enrichedExports = exportRows.map((e) => ({
      ...e,
      previewUrl: e.storageKey ? createSignedMediaUrl(e.storageKey) : null,
      downloadUrl: e.storageKey ? `${createSignedMediaUrl(e.storageKey)}&download=1` : null,
    }));

    const totalStorageBytes =
      assetRows.reduce((sum, r) => sum + (r.fileSizeBytes || 0), 0) +
      exportRows.reduce((sum, r) => sum + (r.fileSizeBytes || 0), 0);

    return res.json({
      success: true,
      data: {
        assets: enrichedAssets,
        exports: enrichedExports,
        summary: {
          assetCount: enrichedAssets.length,
          exportCount: enrichedExports.length,
          totalStorageBytes,
        },
      },
    });
  } catch (error) {
    console.error('Get /users/me/assets error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load your media assets.' });
  }
});

// GET /api/v1/users/me/usage (strictly scoped to caller's own projects, AI history, and credits)
usersRouter.get('/users/me/usage', async (req: AuthRequest, res) => {
  try {
    const userId = req.dbUser!.id;
    const [
      projCountRows,
      scriptCountRows,
      sceneCountRows,
      assetCountRows,
      exportCountRows,
      actionRows,
      jobRows,
      billingRows,
      mediaBreakdownRows,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(projects).where(eq(projects.userId, userId)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(scriptRevisions)
        .innerJoin(projects, eq(scriptRevisions.projectId, projects.id))
        .where(eq(projects.userId, userId)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(scenes)
        .innerJoin(projects, eq(scenes.projectId, projects.id))
        .where(eq(projects.userId, userId)),
      db.select({ count: sql<number>`count(*)::int` }).from(assets).where(eq(assets.userId, userId)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(exportsTable)
        .where(eq(exportsTable.userId, userId)),
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
        .orderBy(desc(generationActions.createdAt))
        .limit(80),
      db
        .select({
          id: generationJobs.id,
          actionId: generationJobs.actionId,
          status: generationJobs.status,
          progress: generationJobs.progress,
          errorMessage: generationJobs.errorMessage,
          attemptCount: generationJobs.attemptCount,
          completedAt: generationJobs.completedAt,
        })
        .from(generationJobs)
        .where(eq(generationJobs.userId, userId))
        .orderBy(desc(generationJobs.createdAt))
        .limit(80),
      db
        .select({
          id: billingTransactions.id,
          actionId: billingTransactions.actionId,
          provider: billingTransactions.provider,
          model: billingTransactions.model,
          mediaType: billingTransactions.mediaType,
          usageUnits: billingTransactions.usageUnits,
          estimatedCredits: billingTransactions.estimatedCredits,
          actualCredits: billingTransactions.actualCredits,
          status: billingTransactions.status,
          createdAt: billingTransactions.createdAt,
        })
        .from(billingTransactions)
        .where(eq(billingTransactions.userId, userId))
        .orderBy(desc(billingTransactions.createdAt))
        .limit(80),
      db
        .select({
          mediaType: generationActions.mediaType,
          count: sql<number>`count(*)::int`,
        })
        .from(generationActions)
        .where(eq(generationActions.userId, userId))
        .groupBy(generationActions.mediaType),
    ]);

    const jobByActionId = new Map(jobRows.map((j) => [j.actionId, j]));
    const billingByActionId = new Map(billingRows.map((b) => [b.actionId, b]));

    const history = actionRows.map((act) => ({
      ...act,
      job: jobByActionId.get(act.id) ?? null,
      billing: billingByActionId.get(act.id) ?? null,
    }));

    const creditsSettled = billingRows
      .filter((b) => b.status === 'settled')
      .reduce((sum, b) => sum + (b.actualCredits ?? b.estimatedCredits), 0);
    const creditsReserved = billingRows
      .filter((b) => b.status === 'reserved')
      .reduce((sum, b) => sum + b.estimatedCredits, 0);
    const creditsRefunded = billingRows
      .filter((b) => b.status === 'refunded')
      .reduce((sum, b) => sum + b.estimatedCredits, 0);

    return res.json({
      success: true,
      data: {
        creditsBalance: req.dbUser!.creditsBalance,
        creditsSettled,
        creditsReserved,
        creditsRefunded,
        counts: {
          projects: projCountRows[0]?.count ?? 0,
          scripts: scriptCountRows[0]?.count ?? 0,
          scenes: sceneCountRows[0]?.count ?? 0,
          assets: assetCountRows[0]?.count ?? 0,
          exports: exportCountRows[0]?.count ?? 0,
          generations: actionRows.length,
        },
        mediaBreakdown: mediaBreakdownRows,
        history,
        transactions: billingRows,
      },
    });
  } catch (error) {
    console.error('Get /users/me/usage error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load usage metrics.' });
  }
});

// GET /api/v1/users/me/activity (strictly caller's own activity feed)
usersRouter.get('/users/me/activity', async (req: AuthRequest, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    const rows = await db
      .select()
      .from(userActivities)
      .where(eq(userActivities.userId, req.dbUser!.id))
      .orderBy(desc(userActivities.createdAt))
      .limit(limit);

    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Get /users/me/activity error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load activity history.' });
  }
});

