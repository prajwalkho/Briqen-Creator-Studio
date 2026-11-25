import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { UserRow } from '../../db/users.ts';

const BCRYPT_ROUNDS = 12;
const ACCESS_TOKEN_TTL_SEC = 15 * 60; // 15 minutes
export const REFRESH_COOKIE_NAME = 'briqen_refresh_token';
export const RESET_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes
export const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const REFRESH_TTL_SHORT_MS = 24 * 60 * 60 * 1000; // 24 hours
export const REFRESH_TTL_REMEMBER_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Read JWT secret from environment or generate an ephemeral per-process fallback
const JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET && process.env.JWT_ACCESS_SECRET.trim().length >= 32
    ? process.env.JWT_ACCESS_SECRET.trim()
    : crypto.randomBytes(32).toString('hex');

// Precomputed dummy bcrypt hash for constant-time comparison when account does not exist
const DUMMY_BCRYPT_HASH = bcrypt.hashSync('briqen-constant-time-dummy-password-987654321!', BCRYPT_ROUNDS);

export interface AccessTokenPayload {
  sub: string;
  uid: string;
  email: string;
  role: string;
  tokenVersion?: number;
  type: 'access';
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, passwordHash: string | null): Promise<boolean> {
  if (!passwordHash) {
    await bcrypt.compare(password, DUMMY_BCRYPT_HASH);
    return false;
  }
  return bcrypt.compare(password, passwordHash);
}

export function validatePasswordComplexity(password: string): { valid: boolean; reason?: string } {
  if (password.length < 8) {
    return { valid: false, reason: 'Password must be at least 8 characters long.' };
  }
  if (password.length > 128) {
    return { valid: false, reason: 'Password must not exceed 128 characters.' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, reason: 'Password must include at least one lowercase letter.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, reason: 'Password must include at least one uppercase letter.' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, reason: 'Password must include at least one number.' };
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return { valid: false, reason: 'Password must include at least one special character.' };
  }
  return { valid: true };
}

export function signAccessToken(user: UserRow): { token: string; expiresIn: number } {
  const payload: AccessTokenPayload = {
    sub: user.id,
    uid: user.uid,
    email: user.email,
    role: user.role,
    tokenVersion: user.tokenVersion ?? 1,
    type: 'access',
  };
  const token = jwt.sign(payload, JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    expiresIn: ACCESS_TOKEN_TTL_SEC,
    issuer: 'briqen-creator-studio',
  });
  return { token, expiresIn: ACCESS_TOKEN_TTL_SEC };
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
      issuer: 'briqen-creator-studio',
    });
    if (
      typeof decoded === 'object' &&
      decoded !== null &&
      decoded.type === 'access' &&
      typeof decoded.sub === 'string'
    ) {
      return decoded as AccessTokenPayload;
    }
    return null;
  } catch {
    return null;
  }
}

export function generateOpaqueToken(): string {
  return crypto.randomBytes(48).toString('base64url');
}

export function hashOpaqueToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    try {
      out[key] = decodeURIComponent(val);
    } catch {
      out[key] = val;
    }
  }
  return out;
}

export function setRefreshCookie(res: Response, rawToken: string, maxAgeMs: number): void {
  const maxAgeSec = Math.max(1, Math.floor(maxAgeMs / 1000));
  const cookieParts = [
    `${REFRESH_COOKIE_NAME}=${encodeURIComponent(rawToken)}`,
    'Path=/api/v1/auth',
    `Max-Age=${maxAgeSec}`,
    'HttpOnly',
    'Secure',
    'SameSite=None',
    'Partitioned',
  ];
  res.append('Set-Cookie', cookieParts.join('; '));
}

export function clearRefreshCookie(res: Response): void {
  const cookieParts = [
    `${REFRESH_COOKIE_NAME}=`,
    'Path=/api/v1/auth',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'HttpOnly',
    'Secure',
    'SameSite=None',
    'Partitioned',
  ];
  res.append('Set-Cookie', cookieParts.join('; '));
}

export function verifySameOriginOrCustomHeader(req: Request): boolean {
  const customHeader = req.get('X-Requested-With');
  if (customHeader && customHeader.toLowerCase() === 'xmlhttprequest') {
    return true;
  }

  const origin = req.get('Origin');
  const expectedHost = (req.get('X-Forwarded-Host') || req.get('Host') || '').split(',')[0].trim();

  if (origin && expectedHost) {
    try {
      const originHost = new URL(origin).host;
      if (originHost === expectedHost) {
        return true;
      }
    } catch {
      return false;
    }
  }

  // Allow configured APP_URL origin
  if (origin && process.env.APP_URL) {
    try {
      if (new URL(origin).origin === new URL(process.env.APP_URL).origin) {
        return true;
      }
    } catch {
      // ignore invalid APP_URL
    }
  }

  // Non-browser API clients without Origin header (e.g. test suites) must send X-Requested-With or same-origin Origin
  return !origin && Boolean(req.headers.cookie);
}
