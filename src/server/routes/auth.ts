import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import {
  emailVerificationTokens,
  passwordResetTokens,
  refreshTokens,
  users,
} from '../../db/schema.ts';
import { getUserByEmail, toPublicUser } from '../../db/users.ts';
import { requireAuth } from '../../middleware/auth.ts';
import type { AuthRequest } from '../../middleware/auth.ts';
import {
  clearRefreshCookie,
  generateOpaqueToken,
  hashOpaqueToken,
  hashPassword,
  parseCookies,
  REFRESH_COOKIE_NAME,
  REFRESH_TTL_REMEMBER_MS,
  REFRESH_TTL_SHORT_MS,
  RESET_TOKEN_TTL_MS,
  setRefreshCookie,
  signAccessToken,
  validatePasswordComplexity,
  VERIFY_TOKEN_TTL_MS,
  verifyPassword,
  verifySameOriginOrCustomHeader,
} from '../auth/security.ts';

export const authRouter = Router();

// Sliding-window rate limiter for sensitive auth endpoints
interface RateEntry {
  count: number;
  resetAt: number;
}
const authBuckets = new Map<string, RateEntry>();

function createAuthRateLimiter(maxRequests: number, windowMs: number, keyByEmail: boolean) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || 'local';
    const rawEmail =
      keyByEmail && typeof req.body?.email === 'string'
        ? req.body.email.trim().toLowerCase()
        : '';
    const key = rawEmail ? `${req.path}:${ip}:${rawEmail}` : `${req.path}:${ip}`;
    const now = Date.now();
    const existing = authBuckets.get(key);

    if (!existing || now > existing.resetAt) {
      authBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    existing.count += 1;
    if (existing.count > maxRequests) {
      const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        success: false,
        message: 'Too many authentication attempts. Please wait a few minutes and try again.',
      });
    }
    return next();
  };
}

const strictAuthLimiter = createAuthRateLimiter(12, 15 * 60 * 1000, true);
const refreshRateLimiter = createAuthRateLimiter(60, 15 * 60 * 1000, false);

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

const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Full name must be at least 2 characters.').max(100),
    email: z.string().trim().email('Please enter a valid email address.').max(254),
    password: z.string().min(8, 'Password must be at least 8 characters.').max(128),
    confirmPassword: z.string().min(1, 'Please confirm your password.'),
    acceptTerms: z.literal(true, {
      message: 'You must accept the Terms of Service and Privacy Policy.',
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match.',
  });

const loginSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address.').max(254),
  password: z.string().min(1, 'Password is required.').max(128),
  rememberMe: z.boolean().optional().default(false),
});

const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address.').max(254),
});

const resetPasswordSchema = z
  .object({
    token: z.string().trim().min(16, 'Invalid reset token.').max(512),
    password: z.string().min(8, 'Password must be at least 8 characters.').max(128),
    confirmPassword: z.string().min(1, 'Please confirm your new password.'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match.',
  });

const verifyEmailSchema = z.object({
  token: z.string().trim().min(16, 'Invalid verification token.').max(512),
});

// Public auth configuration
authRouter.get('/config', (_req, res) => {
  res.json({
    success: true,
    data: {
      googleOAuthEnabled: isGoogleOAuthConfigured(),
    },
  });
});

// POST /api/v1/auth/register
authRouter.post('/register', strictAuthLimiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return res.status(400).json({
      success: false,
      message: firstIssue?.message || 'Invalid registration data.',
      errors: parsed.error.flatten().fieldErrors,
    });
  }

  const { fullName, email, password } = parsed.data;
  const complexity = validatePasswordComplexity(password);
  if (!complexity.valid) {
    return res.status(400).json({
      success: false,
      message: complexity.reason,
    });
  }

  const normalizedEmail = email.toLowerCase();
  const passwordHash = await hashPassword(password);
  const rawVerifyToken = generateOpaqueToken();
  const verifyTokenHash = hashOpaqueToken(rawVerifyToken);
  const verifyExpiresAt = new Date(Date.now() + VERIFY_TOKEN_TTL_MS);

  try {
    const createdUser = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${normalizedEmail}))`);

      const existing = await tx
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${normalizedEmail}`)
        .limit(1);

      if (existing.length > 0) {
        return null;
      }

      const [inserted] = await tx
        .insert(users)
        .values({
          uid: `local:${crypto.randomUUID()}`,
          email: normalizedEmail,
          fullName,
          displayName: fullName,
          passwordHash,
          passwordChangedAt: new Date(),
          isActive: true,
          isVerified: false,
        })
        .returning();

      await tx.insert(emailVerificationTokens).values({
        userId: inserted.id,
        tokenHash: verifyTokenHash,
        expiresAt: verifyExpiresAt,
      });

      return inserted;
    });

    if (!createdUser) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email address already exists.',
      });
    }

    if (process.env.NODE_ENV !== 'production') {
      const origin = process.env.APP_URL || `${req.protocol}://${req.get('Host') || 'localhost:3000'}`;
      console.info(`[Auth] Verification link for ${normalizedEmail}: ${origin}/verify-email?token=${rawVerifyToken}`);
    }

    return res.status(201).json({
      success: true,
      message: 'Account created successfully. Please sign in to your workspace.',
      data: {
        user: toPublicUser(createdUser),
        requiresVerification: true,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({
      success: false,
      message: 'Unable to complete registration. Please try again.',
    });
  }
});

// POST /api/v1/auth/login
authRouter.post('/login', strictAuthLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return res.status(400).json({
      success: false,
      message: firstIssue?.message || 'Invalid login credentials.',
    });
  }

  const { email, password, rememberMe } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  try {
    const user = await getUserByEmail(normalizedEmail);
    const passwordMatches = await verifyPassword(password, user?.passwordHash ?? null);

    if (!user || !passwordMatches) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account is currently disabled. Please contact support.',
      });
    }

    const rawRefresh = generateOpaqueToken();
    const refreshHash = hashOpaqueToken(rawRefresh);
    const ttlMs = rememberMe ? REFRESH_TTL_REMEMBER_MS : REFRESH_TTL_SHORT_MS;
    const expiresAt = new Date(Date.now() + ttlMs);
    const familyId = crypto.randomUUID();
    const now = new Date();

    const updatedUser = await db.transaction(async (tx) => {
      await tx.insert(refreshTokens).values({
        userId: user.id,
        tokenHash: refreshHash,
        familyId,
        rememberMe,
        userAgent: (req.get('User-Agent') || '').slice(0, 250) || null,
        ipAddress: (req.ip || '').slice(0, 64) || null,
        expiresAt,
      });

      const [u] = await tx
        .update(users)
        .set({ lastLoginAt: now, updatedAt: now })
        .where(eq(users.id, user.id))
        .returning();

      return u;
    });

    const { token: accessToken, expiresIn } = signAccessToken(updatedUser);
    setRefreshCookie(res, rawRefresh, ttlMs);

    return res.json({
      success: true,
      message: 'Signed in successfully.',
      data: {
        accessToken,
        expiresIn,
        user: toPublicUser(updatedUser),
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Unable to sign in right now. Please try again.',
    });
  }
});

// POST /api/v1/auth/refresh
authRouter.post('/refresh', refreshRateLimiter, async (req, res) => {
  if (!verifySameOriginOrCustomHeader(req)) {
    return res.status(403).json({
      success: false,
      message: 'Forbidden: Cross-origin refresh blocked.',
    });
  }

  const cookies = parseCookies(req.headers.cookie);
  const rawRefresh = cookies[REFRESH_COOKIE_NAME];
  if (!rawRefresh) {
    return res.status(401).json({
      success: false,
      message: 'No active session.',
    });
  }

  const tokenHash = hashOpaqueToken(rawRefresh);

  try {
    const result = await db.transaction(async (tx) => {
      const tokenRows = await tx
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, tokenHash))
        .limit(1);

      const currentToken = tokenRows[0];
      if (!currentToken) {
        return { ok: false as const, reason: 'invalid' as const };
      }

      // Reuse detection: if an already-revoked refresh token is presented, revoke the entire token family
      if (currentToken.revokedAt !== null) {
        await tx
          .update(refreshTokens)
          .set({ revokedAt: new Date() })
          .where(and(eq(refreshTokens.familyId, currentToken.familyId), isNull(refreshTokens.revokedAt)));
        return { ok: false as const, reason: 'reused' as const };
      }

      if (currentToken.expiresAt <= new Date()) {
        await tx
          .update(refreshTokens)
          .set({ revokedAt: new Date() })
          .where(eq(refreshTokens.id, currentToken.id));
        return { ok: false as const, reason: 'expired' as const };
      }

      const userRows = await tx
        .select()
        .from(users)
        .where(eq(users.id, currentToken.userId))
        .limit(1);
      const user = userRows[0];
      if (!user || !user.isActive) {
        return { ok: false as const, reason: 'inactive' as const };
      }

      // Rotate refresh token within the same family
      const nextRawToken = generateOpaqueToken();
      const nextHash = hashOpaqueToken(nextRawToken);
      const ttlMs = currentToken.rememberMe ? REFRESH_TTL_REMEMBER_MS : REFRESH_TTL_SHORT_MS;
      const nextExpiresAt = new Date(Date.now() + ttlMs);

      const [nextRow] = await tx
        .insert(refreshTokens)
        .values({
          userId: user.id,
          tokenHash: nextHash,
          familyId: currentToken.familyId,
          rememberMe: currentToken.rememberMe,
          userAgent: (req.get('User-Agent') || '').slice(0, 250) || null,
          ipAddress: (req.ip || '').slice(0, 64) || null,
          expiresAt: nextExpiresAt,
        })
        .returning();

      await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date(), replacedByTokenId: nextRow.id })
        .where(eq(refreshTokens.id, currentToken.id));

      return {
        ok: true as const,
        user,
        nextRawToken,
        ttlMs,
      };
    });

    if (!result.ok) {
      clearRefreshCookie(res);
      return res.status(401).json({
        success: false,
        message:
          result.reason === 'reused'
            ? 'Session revoked for security. Please sign in again.'
            : 'Session expired. Please sign in again.',
      });
    }

    const { token: accessToken, expiresIn } = signAccessToken(result.user);
    setRefreshCookie(res, result.nextRawToken, result.ttlMs);

    return res.json({
      success: true,
      data: {
        accessToken,
        expiresIn,
        user: toPublicUser(result.user),
      },
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to refresh authentication session.',
    });
  }
});

// POST /api/v1/auth/logout
authRouter.post('/logout', async (req, res) => {
  if (!verifySameOriginOrCustomHeader(req)) {
    return res.status(403).json({
      success: false,
      message: 'Forbidden: Cross-origin logout blocked.',
    });
  }

  const cookies = parseCookies(req.headers.cookie);
  const rawRefresh = cookies[REFRESH_COOKIE_NAME];

  if (rawRefresh) {
    const tokenHash = hashOpaqueToken(rawRefresh);
    try {
      const rows = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, tokenHash))
        .limit(1);
      if (rows[0]) {
        await db
          .update(refreshTokens)
          .set({ revokedAt: new Date() })
          .where(and(eq(refreshTokens.familyId, rows[0].familyId), isNull(refreshTokens.revokedAt)));
      }
    } catch (error) {
      console.error('Logout revocation error:', error);
    }
  }

  clearRefreshCookie(res);
  return res.json({
    success: true,
    message: 'Signed out successfully.',
  });
});

// GET /api/v1/auth/me
authRouter.get('/me', requireAuth, (req: AuthRequest, res) => {
  return res.json({
    success: true,
    data: req.dbUser,
  });
});

// POST /api/v1/auth/forgot-password
authRouter.post('/forgot-password', strictAuthLimiter, async (req, res) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: parsed.error.issues[0]?.message || 'Please enter a valid email address.',
    });
  }

  const normalizedEmail = parsed.data.email.toLowerCase();
  const genericResponse = {
    success: true,
    message: 'If an account with that email exists, password reset instructions have been sent.',
  };

  try {
    const user = await getUserByEmail(normalizedEmail);
    if (!user || !user.isActive) {
      return res.json(genericResponse);
    }

    const rawResetToken = generateOpaqueToken();
    const tokenHash = hashOpaqueToken(rawResetToken);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await db.transaction(async (tx) => {
      await tx
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)));

      await tx.insert(passwordResetTokens).values({
        userId: user.id,
        tokenHash,
        expiresAt,
      });
    });

    if (process.env.NODE_ENV !== 'production') {
      const origin = process.env.APP_URL || `${req.protocol}://${req.get('Host') || 'localhost:3000'}`;
      console.info(`[Auth] Password reset link for ${normalizedEmail}: ${origin}/reset-password?token=${rawResetToken}`);
    }

    return res.json(genericResponse);
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.json(genericResponse);
  }
});

// POST /api/v1/auth/reset-password
authRouter.post('/reset-password', strictAuthLimiter, async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: parsed.error.issues[0]?.message || 'Invalid password reset request.',
    });
  }

  const { token, password } = parsed.data;
  const complexity = validatePasswordComplexity(password);
  if (!complexity.valid) {
    return res.status(400).json({
      success: false,
      message: complexity.reason,
    });
  }

  const tokenHash = hashOpaqueToken(token);
  const newPasswordHash = await hashPassword(password);

  try {
    const updated = await db.transaction(async (tx) => {
      const now = new Date();
      const [consumed] = await tx
        .update(passwordResetTokens)
        .set({ usedAt: now })
        .where(
          and(
            eq(passwordResetTokens.tokenHash, tokenHash),
            isNull(passwordResetTokens.usedAt),
            gt(passwordResetTokens.expiresAt, now)
          )
        )
        .returning();

      if (!consumed) return null;

      await tx
        .update(users)
        .set({
          passwordHash: newPasswordHash,
          passwordChangedAt: now,
          tokenVersion: sql`${users.tokenVersion} + 1`,
          updatedAt: now,
        })
        .where(eq(users.id, consumed.userId));

      // Revoke all active refresh sessions upon password reset
      await tx
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(and(eq(refreshTokens.userId, consumed.userId), isNull(refreshTokens.revokedAt)));

      return consumed;
    });

    if (!updated) {
      return res.status(400).json({
        success: false,
        message: 'This password reset token is invalid or has expired.',
      });
    }

    clearRefreshCookie(res);
    return res.json({
      success: true,
      message: 'Your password has been reset. You can now sign in with your new password.',
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({
      success: false,
      message: 'Unable to reset password. Please try again.',
    });
  }
});

// POST /api/v1/auth/verify-email
authRouter.post('/verify-email', strictAuthLimiter, async (req, res) => {
  const parsed = verifyEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: parsed.error.issues[0]?.message || 'Invalid verification token.',
    });
  }

  const tokenHash = hashOpaqueToken(parsed.data.token);

  try {
    const verified = await db.transaction(async (tx) => {
      const now = new Date();
      const [consumed] = await tx
        .update(emailVerificationTokens)
        .set({ usedAt: now })
        .where(
          and(
            eq(emailVerificationTokens.tokenHash, tokenHash),
            isNull(emailVerificationTokens.usedAt),
            gt(emailVerificationTokens.expiresAt, now)
          )
        )
        .returning();

      if (!consumed) return { status: 'invalid' as const };

      if (consumed.pendingEmail) {
        const targetEmail = consumed.pendingEmail.toLowerCase();
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${targetEmail}))`);
        const conflict = await tx
          .select({ id: users.id })
          .from(users)
          .where(sql`lower(${users.email}) = ${targetEmail} AND ${users.id} <> ${consumed.userId}`)
          .limit(1);
        if (conflict.length > 0) {
          return { status: 'conflict' as const };
        }
        await tx
          .update(users)
          .set({
            email: targetEmail,
            pendingEmail: null,
            isVerified: true,
            updatedAt: now,
          })
          .where(eq(users.id, consumed.userId));
        return { status: 'email_changed' as const };
      }

      await tx
        .update(users)
        .set({ isVerified: true, updatedAt: now })
        .where(eq(users.id, consumed.userId));

      return { status: 'verified' as const };
    });

    if (verified.status === 'invalid') {
      return res.status(400).json({
        success: false,
        message: 'This verification link is invalid or has expired.',
      });
    }

    if (verified.status === 'conflict') {
      return res.status(409).json({
        success: false,
        message: 'That email address is already registered to another account.',
      });
    }

    return res.json({
      success: true,
      message:
        verified.status === 'email_changed'
          ? 'Your new email address has been verified and updated.'
          : 'Your email address has been verified.',
    });
  } catch (error) {
    console.error('Verify email error:', error);
    return res.status(500).json({
      success: false,
      message: 'Unable to verify email. Please try again.',
    });
  }
});
