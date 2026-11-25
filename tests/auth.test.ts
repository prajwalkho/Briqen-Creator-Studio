import test from 'node:test';
import assert from 'node:assert/strict';
import 'dotenv/config';
import { eq, sql } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { db } from '../src/db/index.ts';
import {
  emailVerificationTokens,
  passwordResetTokens,
  projects,
  refreshTokens,
  users,
} from '../src/db/schema.ts';
import {
  generateOpaqueToken,
  hashOpaqueToken,
  REFRESH_COOKIE_NAME,
} from '../src/server/auth/security.ts';

const BASE_URL = 'http://127.0.0.1:3000/api/v1';

function extractCookieValue(setCookieHeaders: string[], name: string): string | null {
  for (const header of setCookieHeaders) {
    const firstPart = header.split(';')[0]?.trim() || '';
    const eqIdx = firstPart.indexOf('=');
    if (eqIdx > 0 && firstPart.slice(0, eqIdx) === name) {
      return decodeURIComponent(firstPart.slice(eqIdx + 1));
    }
  }
  return null;
}

async function apiFetch(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    token?: string | null;
    cookie?: string | null;
  } = {}
) {
  const headers: Record<string, string> = {
    'X-Requested-With': 'XMLHttpRequest',
  };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }
  if (options.cookie) {
    headers['Cookie'] = `${REFRESH_COOKIE_NAME}=${encodeURIComponent(options.cookie)}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, setCookies };
}

test('End-to-end authentication, security, token rotation, reset, and ownership isolation', async () => {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const emailA = `authtest-a-${suffix}@example.com`;
  const emailB = `authtest-b-${suffix}@example.com`;
  const strongPassword = 'Briqen!Studio2026';
  const nextPassword = 'Briqen!Updated99';

  try {
    // 1. Unauthorized API access is rejected
    const unauthRes = await apiFetch('/projects');
    assert.equal(unauthRes.status, 401);

    // 2. Invalid email & weak password registration rejected
    const badEmailRes = await apiFetch('/auth/register', {
      method: 'POST',
      body: {
        fullName: 'Test User',
        email: 'not-an-email',
        password: strongPassword,
        confirmPassword: strongPassword,
        acceptTerms: true,
      },
    });
    assert.equal(badEmailRes.status, 400);

    const weakPwdRes = await apiFetch('/auth/register', {
      method: 'POST',
      body: {
        fullName: 'Test User',
        email: emailA,
        password: 'weak',
        confirmPassword: 'weak',
        acceptTerms: true,
      },
    });
    assert.equal(weakPwdRes.status, 400);

    // 3. Successful registration stores bcrypt hash and never exposes passwordHash
    const regA = await apiFetch('/auth/register', {
      method: 'POST',
      body: {
        fullName: 'Creator Alpha',
        email: emailA,
        password: strongPassword,
        confirmPassword: strongPassword,
        acceptTerms: true,
      },
    });
    assert.equal(regA.status, 201);
    assert.equal(regA.data.success, true);
    assert.equal(regA.data.data.user.email, emailA);
    assert.equal(regA.data.data.user.passwordHash, undefined);

    const dbUserRows = await db.select().from(users).where(eq(users.email, emailA)).limit(1);
    assert.equal(dbUserRows.length, 1);
    assert.ok(dbUserRows[0].passwordHash?.startsWith('$2'));

    // 4. Duplicate email registration rejected
    const dupRes = await apiFetch('/auth/register', {
      method: 'POST',
      body: {
        fullName: 'Duplicate Alpha',
        email: emailA,
        password: strongPassword,
        confirmPassword: strongPassword,
        acceptTerms: true,
      },
    });
    assert.equal(dupRes.status, 409);

    // 5. Email verification flow
    const rawVerify = generateOpaqueToken();
    await db.insert(emailVerificationTokens).values({
      userId: dbUserRows[0].id,
      tokenHash: hashOpaqueToken(rawVerify),
      expiresAt: new Date(Date.now() + 60_000),
    });
    const verifyRes = await apiFetch('/auth/verify-email', {
      method: 'POST',
      body: { token: rawVerify },
    });
    assert.equal(verifyRes.status, 200);
    const verifiedUserRows = await db.select().from(users).where(eq(users.id, dbUserRows[0].id)).limit(1);
    assert.equal(verifiedUserRows[0].isVerified, true);

    // 6. Incorrect password rejected with generic 401
    const wrongPwdRes = await apiFetch('/auth/login', {
      method: 'POST',
      body: { email: emailA, password: 'WrongPassword!123', rememberMe: false },
    });
    assert.equal(wrongPwdRes.status, 401);
    assert.equal(wrongPwdRes.data.message, 'Invalid email or password.');

    // 7. Successful login issues JWT access token and HttpOnly refresh cookie
    const loginRes = await apiFetch('/auth/login', {
      method: 'POST',
      body: { email: emailA, password: strongPassword, rememberMe: true },
    });
    assert.equal(loginRes.status, 200);
    const accessToken1 = loginRes.data.data.accessToken as string;
    assert.ok(accessToken1);
    const refreshCookie1 = extractCookieValue(loginRes.setCookies, REFRESH_COOKIE_NAME);
    assert.ok(refreshCookie1);
    assert.ok(loginRes.setCookies.some((c) => c.includes('HttpOnly') && c.includes('SameSite=None')));

    // /auth/me works with access token
    const meRes = await apiFetch('/auth/me', { token: accessToken1 });
    assert.equal(meRes.status, 200);
    assert.equal(meRes.data.data.email, emailA);
    assert.equal(meRes.data.data.passwordHash, undefined);

    // 8. Expired / invalid access token rejected
    const expiredJwt = jwt.sign(
      { sub: dbUserRows[0].id, type: 'access' },
      'wrong-or-expired-secret',
      { expiresIn: -10 }
    );
    const expiredRes = await apiFetch('/auth/me', { token: expiredJwt });
    assert.equal(expiredRes.status, 401);

    // 9. Refresh token rotation issues new token & invalidates previous token (reuse detection)
    const refreshRes = await apiFetch('/auth/refresh', {
      method: 'POST',
      cookie: refreshCookie1,
    });
    assert.equal(refreshRes.status, 200);
    const accessToken2 = refreshRes.data.data.accessToken as string;
    const refreshCookie2 = extractCookieValue(refreshRes.setCookies, REFRESH_COOKIE_NAME);
    assert.ok(accessToken2);
    assert.ok(refreshCookie2 && refreshCookie2 !== refreshCookie1);

    // Replaying old rotated refreshCookie1 triggers family revocation
    const replayRes = await apiFetch('/auth/refresh', {
      method: 'POST',
      cookie: refreshCookie1,
    });
    assert.equal(replayRes.status, 401);

    // Subsequent refresh with refreshCookie2 also fails because the token family was revoked
    const postReplayRes = await apiFetch('/auth/refresh', {
      method: 'POST',
      cookie: refreshCookie2,
    });
    assert.equal(postReplayRes.status, 401);

    // 10. Fresh login -> Logout revokes refresh session
    const loginRes2 = await apiFetch('/auth/login', {
      method: 'POST',
      body: { email: emailA, password: strongPassword, rememberMe: false },
    });
    assert.equal(loginRes2.status, 200);
    const refreshCookie3 = extractCookieValue(loginRes2.setCookies, REFRESH_COOKIE_NAME);
    assert.ok(refreshCookie3);

    const logoutRes = await apiFetch('/auth/logout', {
      method: 'POST',
      cookie: refreshCookie3,
    });
    assert.equal(logoutRes.status, 200);

    const refreshAfterLogout = await apiFetch('/auth/refresh', {
      method: 'POST',
      cookie: refreshCookie3,
    });
    assert.equal(refreshAfterLogout.status, 401);

    // 11. Forgot password never reveals email existence
    const forgotUnknown = await apiFetch('/auth/forgot-password', {
      method: 'POST',
      body: { email: `nonexistent-${suffix}@example.com` },
    });
    const forgotKnown = await apiFetch('/auth/forgot-password', {
      method: 'POST',
      body: { email: emailA },
    });
    assert.equal(forgotUnknown.status, 200);
    assert.equal(forgotKnown.status, 200);
    assert.equal(forgotUnknown.data.message, forgotKnown.data.message);

    // 12. Expired reset token rejected
    const rawExpiredReset = generateOpaqueToken();
    await db.insert(passwordResetTokens).values({
      userId: dbUserRows[0].id,
      tokenHash: hashOpaqueToken(rawExpiredReset),
      expiresAt: new Date(Date.now() - 60_000),
    });
    const expiredResetRes = await apiFetch('/auth/reset-password', {
      method: 'POST',
      body: {
        token: rawExpiredReset,
        password: nextPassword,
        confirmPassword: nextPassword,
      },
    });
    assert.equal(expiredResetRes.status, 400);

    // Valid single-use reset token succeeds and cannot be reused
    const rawValidReset = generateOpaqueToken();
    await db.insert(passwordResetTokens).values({
      userId: dbUserRows[0].id,
      tokenHash: hashOpaqueToken(rawValidReset),
      expiresAt: new Date(Date.now() + 120_000),
    });
    const validResetRes = await apiFetch('/auth/reset-password', {
      method: 'POST',
      body: {
        token: rawValidReset,
        password: nextPassword,
        confirmPassword: nextPassword,
      },
    });
    assert.equal(validResetRes.status, 200);

    const reuseResetRes = await apiFetch('/auth/reset-password', {
      method: 'POST',
      body: {
        token: rawValidReset,
        password: nextPassword,
        confirmPassword: nextPassword,
      },
    });
    assert.equal(reuseResetRes.status, 400);

    // Login works with new password & fails with old password
    const oldPwdFail = await apiFetch('/auth/login', {
      method: 'POST',
      body: { email: emailA, password: strongPassword },
    });
    assert.equal(oldPwdFail.status, 401);

    const newPwdLogin = await apiFetch('/auth/login', {
      method: 'POST',
      body: { email: emailA, password: nextPassword },
    });
    assert.equal(newPwdLogin.status, 200);
    const tokenA = newPwdLogin.data.data.accessToken as string;

    // 13. Ownership isolation: User B cannot access User A's project
    const regB = await apiFetch('/auth/register', {
      method: 'POST',
      body: {
        fullName: 'Creator Beta',
        email: emailB,
        password: strongPassword,
        confirmPassword: strongPassword,
        acceptTerms: true,
      },
    });
    assert.equal(regB.status, 201);

    const loginB = await apiFetch('/auth/login', {
      method: 'POST',
      body: { email: emailB, password: strongPassword },
    });
    assert.equal(loginB.status, 200);
    const tokenB = loginB.data.data.accessToken as string;

    const projCreate = await apiFetch('/projects', {
      method: 'POST',
      token: tokenA,
      body: { title: 'Confidential Campaign', platform: 'YouTube', aspectRatio: '16:9' },
    });
    assert.equal(projCreate.status, 201);
    const projectAId = projCreate.data.data.id as string;

    const crossRead = await apiFetch(`/projects/${projectAId}`, { token: tokenB });
    assert.equal(crossRead.status, 404);

    const crossDelete = await apiFetch(`/projects/${projectAId}`, {
      method: 'DELETE',
      token: tokenB,
    });
    assert.equal(crossDelete.status, 404);

    // 14. Template-initialized project creation & Script Version History restore
    const templateProjRes = await apiFetch('/projects', {
      method: 'POST',
      token: tokenA,
      body: {
        title: 'Product Launch Campaign',
        brandName: 'Briqen',
        platform: 'YouTube',
        aspectRatio: '16:9',
        thumbnailUrl: '/src/assets/images/sample_product_launch_1795602333574.jpg',
        initialScript: {
          title: 'Product Launch — Draft Script',
          targetDurationSec: 45,
          language: 'English',
          toneOfVoice: 'Energetic & Bold',
          marketingObjective: 'Conversions & Product Launch',
          content: '[00:00 - 00:05] SCENE 1\nOriginal template hook.',
          aiNotes: 'Initialized from Product Launch template',
        },
      },
    });
    assert.equal(templateProjRes.status, 201);
    const tplProjId = templateProjRes.data.data.id as string;
    const rev1Id = templateProjRes.data.data.activeScriptRevisionId as string;
    assert.ok(rev1Id);
    assert.equal(
      templateProjRes.data.data.thumbnailUrl,
      '/src/assets/images/sample_product_launch_1795602333574.jpg'
    );

    const tplScriptsRes = await apiFetch(`/projects/${tplProjId}/scripts`, { token: tokenA });
    assert.equal(tplScriptsRes.status, 200);
    assert.equal(tplScriptsRes.data.data.length, 1);
    assert.equal(tplScriptsRes.data.data[0].versionNumber, 1);
    assert.equal(tplScriptsRes.data.data[0].aiModelUsed, 'template');

    const saveRev2 = await apiFetch(`/projects/${tplProjId}/scripts`, {
      method: 'POST',
      token: tokenA,
      body: {
        title: 'Product Launch — Edited v2',
        content: '[00:00 - 00:05] SCENE 1\nEdited second revision.',
        aiNotes: 'Manual update',
      },
    });
    assert.equal(saveRev2.status, 201);
    assert.equal(saveRev2.data.data.versionNumber, 2);

    const restoreRev1 = await apiFetch(`/projects/${tplProjId}/scripts/${rev1Id}/restore`, {
      method: 'POST',
      token: tokenA,
    });
    assert.equal(restoreRev1.status, 201);
    assert.equal(restoreRev1.data.data.versionNumber, 3);
    assert.ok(restoreRev1.data.data.content.includes('Original template hook.'));
  } finally {
    // Cleanup test users (cascades to projects, refreshTokens, resetTokens, verifyTokens)
    await db
      .delete(users)
      .where(sql`${users.email} IN (${emailA}, ${emailB})`);
  }
});
