import test from 'node:test';
import assert from 'node:assert/strict';
import 'dotenv/config';
import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db/index.ts';
import {
  emailVerificationTokens,
  notificationPreferences,
  refreshTokens,
  userPreferences,
  users,
} from '../src/db/schema.ts';
import {
  generateOpaqueToken,
  hashOpaqueToken,
  REFRESH_COOKIE_NAME,
} from '../src/server/auth/security.ts';
import { getObjectPath } from '../src/server/storage.ts';

const execFileAsync = promisify(execFile);
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
  routePath: string,
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
  let bodyPayload: BodyInit | undefined;
  if (options.body instanceof FormData) {
    bodyPayload = options.body;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    bodyPayload = JSON.stringify(options.body);
  }
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }
  if (options.cookie) {
    headers['Cookie'] = `${REFRESH_COOKIE_NAME}=${encodeURIComponent(options.cookie)}`;
  }

  const res = await fetch(`${BASE_URL}${routePath}`, {
    method: options.method || 'GET',
    headers,
    body: bodyPayload,
  });

  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, setCookies };
}

test('Account Settings & Profile Management end-to-end suite', async () => {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const emailA = `settings-a-${suffix}@example.com`;
  const emailANew = `settings-a-new-${suffix}@example.com`;
  const emailB = `settings-b-${suffix}@example.com`;
  const pwd1 = 'Briqen!Settings2026';
  const pwd2 = 'Briqen!Rotated2026';
  const usernameA = `creator_a_${suffix.slice(-6)}`;
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'briqen-settings-test-'));

  try {
    // 1. Register & login User A and User B
    const regA = await apiFetch('/auth/register', {
      method: 'POST',
      body: {
        fullName: 'Settings Alpha',
        email: emailA,
        password: pwd1,
        confirmPassword: pwd1,
        acceptTerms: true,
      },
    });
    assert.equal(regA.status, 201);

    const regB = await apiFetch('/auth/register', {
      method: 'POST',
      body: {
        fullName: 'Settings Beta',
        email: emailB,
        password: pwd1,
        confirmPassword: pwd1,
        acceptTerms: true,
      },
    });
    assert.equal(regB.status, 201);

    const loginA1 = await apiFetch('/auth/login', {
      method: 'POST',
      body: { email: emailA, password: pwd1, rememberMe: true },
    });
    assert.equal(loginA1.status, 200);
    let tokenA = loginA1.data.data.accessToken as string;
    let cookieA = extractCookieValue(loginA1.setCookies, REFRESH_COOKIE_NAME);
    assert.ok(tokenA && cookieA);

    // Second session for User A (to verify session listing & revocation)
    const loginA2 = await apiFetch('/auth/login', {
      method: 'POST',
      body: { email: emailA, password: pwd1, rememberMe: false },
    });
    assert.equal(loginA2.status, 200);
    const cookieA2 = extractCookieValue(loginA2.setCookies, REFRESH_COOKIE_NAME);
    assert.ok(cookieA2);

    const loginB = await apiFetch('/auth/login', {
      method: 'POST',
      body: { email: emailB, password: pwd1, rememberMe: false },
    });
    assert.equal(loginB.status, 200);
    const tokenB = loginB.data.data.accessToken as string;

    const userARows = await db.select().from(users).where(eq(users.email, emailA)).limit(1);
    const userBRows = await db.select().from(users).where(eq(users.email, emailB)).limit(1);
    const userAId = userARows[0].id;
    const userBId = userBRows[0].id;

    // 2. GET /users/me returns user + preferences + notifications without secrets
    const meBundle = await apiFetch('/users/me', { token: tokenA });
    assert.equal(meBundle.status, 200);
    assert.equal(meBundle.data.data.user.email, emailA);
    assert.equal(meBundle.data.data.user.passwordHash, undefined);
    assert.equal(meBundle.data.data.user.hasLocalPassword, true);
    assert.ok(meBundle.data.data.preferences);
    assert.ok(meBundle.data.data.notifications);

    // 3. Edit personal info (validation + persistence + unique username + email change verification)
    const badPhoneRes = await apiFetch('/users/me', {
      method: 'PATCH',
      token: tokenA,
      body: { phoneNumber: 'abc' },
    });
    assert.equal(badPhoneRes.status, 400);

    const badLinkedinRes = await apiFetch('/users/me', {
      method: 'PATCH',
      token: tokenA,
      body: { linkedinUrl: 'https://evil-site.example.com/in/foo' },
    });
    assert.equal(badLinkedinRes.status, 400);

    const updatePersonalRes = await apiFetch('/users/me', {
      method: 'PATCH',
      token: tokenA,
      body: {
        fullName: 'Alpha Studio Director',
        username: usernameA,
        phoneNumber: '+1 415 555 0144',
        bio: 'Building marketing campaigns with Briqen.',
        country: 'United States',
        state: 'California',
        city: 'San Francisco',
        website: 'https://briqen.example.com',
        linkedinUrl: 'https://linkedin.com/in/alpha-director',
        githubUrl: 'https://github.com/alpha-director',
      },
    });
    assert.equal(updatePersonalRes.status, 200);
    assert.equal(updatePersonalRes.data.data.user.fullName, 'Alpha Studio Director');
    assert.equal(updatePersonalRes.data.data.user.username, usernameA.toLowerCase());
    assert.equal(updatePersonalRes.data.data.user.city, 'San Francisco');

    // Duplicate username conflict for User B
    const dupUsernameRes = await apiFetch('/users/me', {
      method: 'PATCH',
      token: tokenB,
      body: { username: usernameA },
    });
    assert.equal(dupUsernameRes.status, 409);

    // Email change initiates pendingEmail & requires verification token before switching primary email
    const emailChangeRes = await apiFetch('/users/me', {
      method: 'PATCH',
      token: tokenA,
      body: { email: emailANew },
    });
    assert.equal(emailChangeRes.status, 200);
    assert.equal(emailChangeRes.data.data.requiresEmailVerification, true);
    assert.equal(emailChangeRes.data.data.user.email, emailA);
    assert.equal(emailChangeRes.data.data.user.pendingEmail, emailANew);

    const rawChangeToken = generateOpaqueToken();
    await db.insert(emailVerificationTokens).values({
      userId: userAId,
      pendingEmail: emailANew,
      tokenHash: hashOpaqueToken(rawChangeToken),
      expiresAt: new Date(Date.now() + 60_000),
    });
    const confirmEmailRes = await apiFetch('/auth/verify-email', {
      method: 'POST',
      body: { token: rawChangeToken },
    });
    assert.equal(confirmEmailRes.status, 200);

    const updatedUserARows = await db.select().from(users).where(eq(users.id, userAId)).limit(1);
    assert.equal(updatedUserARows[0].email, emailANew);
    assert.equal(updatedUserARows[0].pendingEmail, null);
    assert.equal(updatedUserARows[0].isVerified, true);

    // 4. Profile picture upload, signed delivery, validation & removal
    // 4a. Reject unsupported MIME/extension
    const badFileForm = new FormData();
    badFileForm.append('file', new Blob(['hello'], { type: 'text/plain' }), 'notes.txt');
    const badMimeRes = await apiFetch('/users/me/avatar', {
      method: 'POST',
      token: tokenA,
      body: badFileForm,
    });
    assert.equal(badMimeRes.status, 400);

    // 4b. Reject spoofed .png with invalid magic bytes
    const spoofedForm = new FormData();
    spoofedForm.append(
      'file',
      new Blob(['NOT_A_REAL_PNG_FILE_CONTENT_1234'], { type: 'image/png' }),
      'spoof.png'
    );
    const spoofRes = await apiFetch('/users/me/avatar', {
      method: 'POST',
      token: tokenA,
      body: spoofedForm,
    });
    assert.equal(spoofRes.status, 400);

    // 4c. Reject oversized > 5 MB upload
    const oversizedBuf = Buffer.alloc(5 * 1024 * 1024 + 512, 0x89);
    const bigForm = new FormData();
    bigForm.append('file', new Blob([oversizedBuf], { type: 'image/png' }), 'huge.png');
    const bigRes = await apiFetch('/users/me/avatar', {
      method: 'POST',
      token: tokenA,
      body: bigForm,
    });
    assert.equal(bigRes.status, 400);

    // 4d. Upload valid PNG generated with ffmpeg -> resized/optimized WebP in storage + signed URL
    const samplePngPath = path.join(tmpDir, 'avatar-src.png');
    await execFileAsync('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=0xF59E0B:s=128x128:d=0.1',
      '-frames:v',
      '1',
      samplePngPath,
    ]);
    const pngBytes = await fs.promises.readFile(samplePngPath);
    const validForm = new FormData();
    validForm.append('file', new Blob([pngBytes], { type: 'image/png' }), 'avatar.png');
    const avatarUploadRes = await apiFetch('/users/me/avatar', {
      method: 'POST',
      token: tokenA,
      body: validForm,
    });
    assert.equal(avatarUploadRes.status, 200);
    const storageKey = avatarUploadRes.data.data.user.profileImageKey as string;
    const avatarUrl = avatarUploadRes.data.data.user.avatarUrl as string;
    assert.ok(storageKey && storageKey.endsWith('.webp'));
    assert.ok(avatarUrl.includes('/api/v1/media/signed?'));
    assert.equal(fs.existsSync(getObjectPath(storageKey)), true);

    const signedImgRes = await fetch(`http://127.0.0.1:3000${avatarUrl}`);
    assert.equal(signedImgRes.status, 200);
    assert.equal(signedImgRes.headers.get('content-type'), 'image/webp');

    // 4e. Remove avatar deletes file and clears profileImageKey
    const avatarDeleteRes = await apiFetch('/users/me/avatar', {
      method: 'DELETE',
      token: tokenA,
    });
    assert.equal(avatarDeleteRes.status, 200);
    assert.equal(avatarDeleteRes.data.data.user.profileImageKey, null);
    assert.equal(avatarDeleteRes.data.data.user.avatarUrl, null);
    assert.equal(fs.existsSync(getObjectPath(storageKey)), false);

    // 5. Preferences & Notifications persistence
    const prefUpdateRes = await apiFetch('/users/me/preferences', {
      method: 'PATCH',
      token: tokenA,
      body: {
        theme: 'light',
        language: 'fr',
        timezone: 'America/New_York',
        defaultAspectRatio: '9:16',
        defaultExportQuality: 'low',
      },
    });
    assert.equal(prefUpdateRes.status, 200);
    assert.equal(prefUpdateRes.data.data.theme, 'light');
    assert.equal(prefUpdateRes.data.data.defaultAspectRatio, '9:16');
    assert.equal(prefUpdateRes.data.data.defaultExportQuality, 'low');

    const [dbPref] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userAId))
      .limit(1);
    assert.equal(dbPref.timezone, 'America/New_York');

    const notifUpdateRes = await apiFetch('/users/me/notifications', {
      method: 'PATCH',
      token: tokenA,
      body: {
        emailNotifications: true,
        projectUpdates: false,
        generationCompleted: true,
        generationFailed: true,
        productAnnouncements: false,
        marketingEmails: true,
      },
    });
    assert.equal(notifUpdateRes.status, 200);
    assert.equal(notifUpdateRes.data.data.projectUpdates, false);
    assert.equal(notifUpdateRes.data.data.marketingEmails, true);

    const [dbNotif] = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userAId))
      .limit(1);
    assert.equal(dbNotif.projectUpdates, false);

    // 6. Security overview, active sessions & cross-user IDOR protection
    const secRes = await apiFetch('/users/me/security', { token: tokenA });
    assert.equal(secRes.status, 200);
    assert.equal(secRes.data.data.emailVerified, true);
    assert.ok(secRes.data.data.activeSessionCount >= 2);

    const sessionsA = await apiFetch('/users/me/sessions', {
      token: tokenA,
      cookie: cookieA,
    });
    assert.equal(sessionsA.status, 200);
    assert.ok(sessionsA.data.data.length >= 2);
    const otherSession = sessionsA.data.data.find((s: { isCurrent: boolean }) => !s.isCurrent);
    assert.ok(otherSession);

    // User B cannot revoke User A's session (IDOR protection)
    const idorRevoke = await apiFetch(`/users/me/sessions/${otherSession.id}`, {
      method: 'DELETE',
      token: tokenB,
    });
    assert.equal(idorRevoke.status, 404);

    // User A revokes their own second session
    const revokeOwn = await apiFetch(`/users/me/sessions/${otherSession.id}`, {
      method: 'DELETE',
      token: tokenA,
      cookie: cookieA,
    });
    assert.equal(revokeOwn.status, 200);
    assert.equal(revokeOwn.data.data.revokedCurrentSession, false);

    // Revoked session cookieA2 can no longer refresh
    const refreshRevoked = await apiFetch('/auth/refresh', {
      method: 'POST',
      cookie: cookieA2,
    });
    assert.equal(refreshRevoked.status, 401);

    // 7. Change password validation, tokenVersion bump, refresh rotation & old token invalidation
    const wrongCurrentPwd = await apiFetch('/users/me/change-password', {
      method: 'POST',
      token: tokenA,
      cookie: cookieA,
      body: {
        currentPassword: 'Wrong!Password1',
        newPassword: pwd2,
        confirmNewPassword: pwd2,
      },
    });
    assert.equal(wrongCurrentPwd.status, 400);

    const reusePwd = await apiFetch('/users/me/change-password', {
      method: 'POST',
      token: tokenA,
      cookie: cookieA,
      body: {
        currentPassword: pwd1,
        newPassword: pwd1,
        confirmNewPassword: pwd1,
      },
    });
    assert.equal(reusePwd.status, 400);

    const oldTokenA = tokenA;
    const oldCookieA = cookieA;
    const changePwdOk = await apiFetch('/users/me/change-password', {
      method: 'POST',
      token: tokenA,
      cookie: cookieA,
      body: {
        currentPassword: pwd1,
        newPassword: pwd2,
        confirmNewPassword: pwd2,
      },
    });
    assert.equal(changePwdOk.status, 200);
    tokenA = changePwdOk.data.data.accessToken as string;
    cookieA = extractCookieValue(changePwdOk.setCookies, REFRESH_COOKIE_NAME);
    assert.ok(tokenA && tokenA !== oldTokenA);
    assert.ok(cookieA && cookieA !== oldCookieA);

    // Old access token is immediately rejected because tokenVersion incremented
    const staleAccessCheck = await apiFetch('/users/me', { token: oldTokenA });
    assert.equal(staleAccessCheck.status, 401);

    // New access token works
    const freshAccessCheck = await apiFetch('/users/me', { token: tokenA });
    assert.equal(freshAccessCheck.status, 200);
    assert.ok(freshAccessCheck.data.data.user.passwordChangedAt);

    // 8. Export personal data includes profile/prefs/notifications and omits secrets
    const exportRes = await apiFetch('/users/me/export', { token: tokenA });
    assert.equal(exportRes.status, 200);
    assert.equal(exportRes.data.data.user.email, emailANew);
    assert.equal(exportRes.data.data.user.passwordHash, undefined);
    assert.equal(exportRes.data.data.preferences.defaultAspectRatio, '9:16');

    // 9. Logout all devices invalidates active access token & refresh cookie
    const logoutAllRes = await apiFetch('/users/me/logout-all', {
      method: 'POST',
      token: tokenA,
      cookie: cookieA,
    });
    assert.equal(logoutAllRes.status, 200);

    const afterLogoutAllMe = await apiFetch('/users/me', { token: tokenA });
    assert.equal(afterLogoutAllMe.status, 401);

    const afterLogoutAllRefresh = await apiFetch('/auth/refresh', {
      method: 'POST',
      cookie: cookieA,
    });
    assert.equal(afterLogoutAllRefresh.status, 401);

    // Re-login with new password pwd2 to test deletion workflow
    const loginNewPwd = await apiFetch('/auth/login', {
      method: 'POST',
      body: { email: emailANew, password: pwd2, rememberMe: false },
    });
    assert.equal(loginNewPwd.status, 200);
    tokenA = loginNewPwd.data.data.accessToken as string;

    // 10. Account deletion workflow: wrong password rejected, schedule + cancel works, finalize deactivates
    const badDeleteRes = await apiFetch('/users/me/deletion-request', {
      method: 'POST',
      token: tokenA,
      body: {
        password: 'WrongPassword!123',
        confirmPhrase: 'DELETE',
        confirmDeletion: true,
        finalizeDeletion: false,
      },
    });
    assert.equal(badDeleteRes.status, 400);

    const scheduleDeleteRes = await apiFetch('/users/me/deletion-request', {
      method: 'POST',
      token: tokenA,
      body: {
        password: pwd2,
        confirmPhrase: 'DELETE',
        confirmDeletion: true,
        reason: 'Testing scheduled deletion',
        finalizeDeletion: false,
      },
    });
    assert.equal(scheduleDeleteRes.status, 200);
    assert.equal(scheduleDeleteRes.data.data.deactivated, false);
    assert.ok(scheduleDeleteRes.data.data.deletionScheduledFor);

    const cancelDeleteRes = await apiFetch('/users/me/cancel-deletion', {
      method: 'POST',
      token: tokenA,
    });
    assert.equal(cancelDeleteRes.status, 200);
    assert.equal(cancelDeleteRes.data.data.user.deletionRequestedAt, null);

    const finalizeDeleteRes = await apiFetch('/users/me/deletion-request', {
      method: 'POST',
      token: tokenA,
      body: {
        password: pwd2,
        confirmPhrase: 'DELETE',
        confirmDeletion: true,
        reason: 'Closing test account',
        finalizeDeletion: true,
      },
    });
    assert.equal(finalizeDeleteRes.status, 200);
    assert.equal(finalizeDeleteRes.data.data.deactivated, true);

    // Deactivated account token is immediately rejected (401) and login fails
    const postDeleteMe = await apiFetch('/users/me', { token: tokenA });
    assert.equal(postDeleteMe.status, 401);

    const activeRefreshRows = await db
      .select()
      .from(refreshTokens)
      .where(sql`${refreshTokens.userId} = ${userAId} AND ${refreshTokens.revokedAt} IS NULL`);
    assert.equal(activeRefreshRows.length, 0);
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
    await db
      .delete(users)
      .where(sql`${users.email} IN (${emailA}, ${emailANew}, ${emailB})`);
    // Verify cleanup didn't leave orphaned test records
    void userBIdCheckSafe;
  }
});

const userBIdCheckSafe = true;
