import test from 'node:test';
import assert from 'node:assert/strict';
import 'dotenv/config';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '../src/db/index.ts';
import { adminAuditLogs, users } from '../src/db/schema.ts';
import { DEFAULT_ADMIN_PERMISSIONS } from '../src/server/auth/permissions.ts';
import { REFRESH_COOKIE_NAME } from '../src/server/auth/security.ts';
import {
  assertDemoModeSafeOnStartup,
  assertDemoSeedingAllowed,
  getDemoConfig,
  getDemoQuickLoginOptions,
} from '../src/server/seeders/demoConfig.ts';
import {
  buildDemoAccountSpecs,
  seedDemoAccounts,
} from '../src/server/seeders/demoAccounts.ts';

const BASE_URL = 'http://127.0.0.1:3000/api/v1';

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
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
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
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await res.json().catch(() => ({}))
    : await res.text().catch(() => '');
  return { status: res.status, data, setCookies, headers: res.headers };
}

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

test('Demo accounts seeding, idempotency, safety guards, and 27 real DB logins', async () => {
  const origNodeEnv = process.env.NODE_ENV;
  const origEnableDemo = process.env.ENABLE_DEMO_ACCOUNTS;
  const origEnableLogin = process.env.ENABLE_DEMO_LOGIN;

  try {
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_DEMO_ACCOUNTS = 'true';
    process.env.ENABLE_DEMO_LOGIN = 'true';

    const prodCfg = getDemoConfig();
    assert.equal(prodCfg.isProduction, true);
    assert.equal(prodCfg.demoAccountsEnabled, false);
    assert.equal(prodCfg.demoLoginEnabled, false);
    assert.equal(getDemoQuickLoginOptions().length, 0);
    assert.throws(() => assertDemoSeedingAllowed(), /NODE_ENV=production/);
    assert.throws(() => assertDemoModeSafeOnStartup(), /must not be enabled in production/);
  } finally {
    process.env.NODE_ENV = origNodeEnv;
    process.env.ENABLE_DEMO_ACCOUNTS = origEnableDemo;
    process.env.ENABLE_DEMO_LOGIN = origEnableLogin;
  }

  const specs = buildDemoAccountSpecs();
  assert.equal(specs.length, 27);
  assert.equal(specs.filter((s) => s.role === 'super_admin').length, 2);
  assert.equal(specs.filter((s) => s.role === 'admin').length, 5);
  assert.equal(specs.filter((s) => s.role === 'user').length, 20);

  const demoRows = await db.select().from(users).where(eq(users.isDemoAccount, true));
  assert.equal(demoRows.length, 27);
  assert.equal(demoRows.filter((u) => u.role === 'super_admin').length, 2);
  assert.equal(demoRows.filter((u) => u.role === 'admin').length, 5);
  assert.equal(demoRows.filter((u) => u.role === 'user').length, 20);

  const secondSeed = await seedDemoAccounts({ quiet: true });
  assert.equal(secondSeed.superAdminsCreated, 0);
  assert.equal(secondSeed.adminsCreated, 0);
  assert.equal(secondSeed.usersCreated, 0);
  assert.equal(secondSeed.superAdminsExisting, 2);
  assert.equal(secondSeed.adminsExisting, 5);
  assert.equal(secondSeed.usersExisting, 20);

  const demoPassword = getDemoConfig().demoPassword;
  for (const spec of specs) {
    const res = await apiFetch('/auth/login', {
      method: 'POST',
      body: { email: spec.email, password: demoPassword, rememberMe: false },
    });
    assert.equal(res.status, 200, `Expected 200 login for ${spec.email}`);
    assert.equal(res.data.data.user.email, spec.email);
    assert.equal(res.data.data.user.role, spec.role);
    assert.equal(res.data.data.user.isDemoAccount, true);
    assert.equal(res.data.data.user.passwordHash, undefined);
    assert.ok(Array.isArray(res.data.data.user.permissions));
  }

  const cfgRes = await apiFetch('/auth/config');
  assert.equal(cfgRes.status, 200);
  assert.equal(cfgRes.data.data.demoLoginEnabled, true);
  assert.equal(cfgRes.data.data.demoAccounts.length, 3);
});

test('3-Role RBAC, Owner Console, Granular Admin Permissions, Analytics, User Isolation & Audit Trail', async () => {
  const demoPassword = getDemoConfig().demoPassword;
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const tempUserEmail = `admintest-user-${suffix}@example.com`;
  const tempWorkerAdminEmail = `admintest-worker-${suffix}@example.com`;
  const tempCreatedEmail = `admintest-created-${suffix}@example.com`;
  const createdPassword = 'Briqen!AdminCreated2026';

  const createdUserIds: string[] = [];

  try {
    // Authenticate Platform Owner (Super Admin), Worker Admin, and Regular User
    const superLogin = await apiFetch('/auth/login', {
      method: 'POST',
      body: { email: 'superadmin1@briqen.demo', password: demoPassword },
    });
    assert.equal(superLogin.status, 200);
    const superToken = superLogin.data.data.accessToken as string;
    const super1Id = superLogin.data.data.user.id as string;
    assert.equal(superLogin.data.data.user.permissions.length, 20);

    const admin1Login = await apiFetch('/auth/login', {
      method: 'POST',
      body: { email: 'admin1@briqen.demo', password: demoPassword },
    });
    assert.equal(admin1Login.status, 200);
    const admin1Token = admin1Login.data.data.accessToken as string;

    const admin5Login = await apiFetch('/auth/login', {
      method: 'POST',
      body: { email: 'admin5@briqen.demo', password: demoPassword },
    });
    assert.equal(admin5Login.status, 200);
    const admin5Token = admin5Login.data.data.accessToken as string;

    const userLogin = await apiFetch('/auth/login', {
      method: 'POST',
      body: { email: 'user1@briqen.demo', password: demoPassword },
    });
    assert.equal(userLogin.status, 200);
    const regularToken = userLogin.data.data.accessToken as string;
    const demoUser1Id = userLogin.data.data.user.id as string;
    assert.equal(userLogin.data.data.user.permissions.length, 0);

    // 1. Regular user is blocked (403) from all /admin and /owner endpoints, but can read own /users/me/*
    const [regAdminStats, regAdminUsers, regOwnerOverview, regOwnerSystem, myAssets, myUsage, myActivity] =
      await Promise.all([
        apiFetch('/admin/dashboard/stats', { token: regularToken }),
        apiFetch('/admin/users', { token: regularToken }),
        apiFetch('/owner/overview', { token: regularToken }),
        apiFetch('/owner/system', { token: regularToken }),
        apiFetch('/users/me/assets', { token: regularToken }),
        apiFetch('/users/me/usage', { token: regularToken }),
        apiFetch('/users/me/activity', { token: regularToken }),
      ]);
    assert.equal(regAdminStats.status, 403);
    assert.equal(regAdminUsers.status, 403);
    assert.equal(regOwnerOverview.status, 403);
    assert.equal(regOwnerSystem.status, 403);
    assert.equal(myAssets.status, 200);
    assert.equal(myUsage.status, 200);
    assert.equal(myActivity.status, 200);
    assert.ok(myUsage.data.data.counts.projects >= 1);

    // 2. Worker Admin is strictly blocked (403) from all /api/v1/owner/* endpoints
    const [adminOwnerOverview, adminOwnerPerms, adminOwnerSystem] = await Promise.all([
      apiFetch('/owner/overview', { token: admin1Token }),
      apiFetch('/owner/permissions', { token: admin1Token }),
      apiFetch('/owner/system', { token: admin1Token }),
    ]);
    assert.equal(adminOwnerOverview.status, 403);
    assert.equal(adminOwnerPerms.status, 403);
    assert.equal(adminOwnerSystem.status, 403);

    // 3. Owner Overview, SQL Analytics, CSV export & System Settings checks
    const [ownerOverviewRes, ownerAnalyticsRes, ownerCsvRes, ownerSystemRes] = await Promise.all([
      apiFetch('/owner/overview', { token: superToken }),
      apiFetch('/owner/analytics?range=30d&granularity=daily', { token: superToken }),
      apiFetch('/owner/analytics/export?type=overview&range=30d&granularity=daily', { token: superToken }),
      apiFetch('/owner/system', { token: superToken }),
    ]);
    assert.equal(ownerOverviewRes.status, 200);
    assert.equal(ownerOverviewRes.data.data.billingImplemented, false);
    assert.equal(ownerOverviewRes.data.data.confirmedRevenueUsd, null);
    assert.ok(ownerOverviewRes.data.data.totalUsers >= 27);
    assert.ok(ownerOverviewRes.data.data.totalProjects >= 20);

    assert.equal(ownerAnalyticsRes.status, 200);
    assert.equal(ownerAnalyticsRes.data.data.financial.billingImplemented, false);
    assert.ok(Array.isArray(ownerAnalyticsRes.data.data.users.registrationTrend));
    assert.ok(Array.isArray(ownerAnalyticsRes.data.data.ai.generationTrend));

    assert.equal(ownerCsvRes.status, 200);
    assert.ok(typeof ownerCsvRes.data === 'string' && ownerCsvRes.data.includes('Metric,Value'));

    assert.equal(ownerSystemRes.status, 200);
    assert.equal(ownerSystemRes.data.data.health.databaseConnected, true);

    // 4. Create a regular user + a scoped worker Admin via Owner API
    const createUserRes = await apiFetch('/admin/users', {
      method: 'POST',
      token: superToken,
      body: {
        fullName: 'RBAC Target User',
        email: tempUserEmail,
        password: createdPassword,
        role: 'user',
        isVerified: true,
        creditsBalance: 750,
      },
    });
    assert.equal(createUserRes.status, 201);
    const targetUserId = createUserRes.data.data.id as string;
    createdUserIds.push(targetUserId);

    // POST /owner/admins without explicit permissions assigns DEFAULT_ADMIN_PERMISSIONS (never all 20)
    const createWorkerAdminRes = await apiFetch('/owner/admins', {
      method: 'POST',
      token: superToken,
      body: {
        fullName: 'Scoped Worker Admin',
        email: tempWorkerAdminEmail,
        password: createdPassword,
      },
    });
    assert.equal(createWorkerAdminRes.status, 201);
    const workerAdminId = createWorkerAdminRes.data.data.id as string;
    createdUserIds.push(workerAdminId);
    assert.equal(
      createWorkerAdminRes.data.data.permissions.length,
      DEFAULT_ADMIN_PERMISSIONS.length
    );

    const workerLogin = await apiFetch('/auth/login', {
      method: 'POST',
      body: { email: tempWorkerAdminEmail, password: createdPassword },
    });
    assert.equal(workerLogin.status, 200);
    const workerToken = workerLogin.data.data.accessToken as string;

    // Worker Admin has users.view (200), but lacks users.edit & reports.export (403 PERMISSION_DENIED)
    const workerListUsers = await apiFetch('/admin/users', { token: workerToken });
    assert.equal(workerListUsers.status, 200);
    assert.ok(
      workerListUsers.data.data.items.every((u: { role: string }) => u.role === 'user'),
      'Worker Admin directory must only return regular user accounts'
    );

    const workerEditDenied = await apiFetch(`/admin/users/${targetUserId}`, {
      method: 'PATCH',
      token: workerToken,
      body: { fullName: 'Denied Edit' },
    });
    assert.equal(workerEditDenied.status, 403);
    assert.equal(workerEditDenied.data.code, 'PERMISSION_DENIED');

    const workerExportDenied = await apiFetch(`/admin/users/${targetUserId}/export`, {
      token: workerToken,
    });
    assert.equal(workerExportDenied.status, 403);

    // Owner grants users.edit to the worker Admin -> succeeds immediately without re-login
    const grantRes = await apiFetch(`/owner/admins/${workerAdminId}/permissions`, {
      method: 'PUT',
      token: superToken,
      body: { permissions: [...DEFAULT_ADMIN_PERMISSIONS, 'users.edit'] },
    });
    assert.equal(grantRes.status, 200);

    const workerEditAllowed = await apiFetch(`/admin/users/${targetUserId}`, {
      method: 'PATCH',
      token: workerToken,
      body: { fullName: 'Updated By Scoped Admin', city: 'Seattle' },
    });
    assert.equal(workerEditAllowed.status, 200);
    assert.equal(workerEditAllowed.data.data.fullName, 'Updated By Scoped Admin');

    // Read-only demo admin5 cannot ban or delete
    const admin5BanDenied = await apiFetch(`/admin/users/${targetUserId}/ban`, {
      method: 'POST',
      token: admin5Token,
      body: { banType: 'temporary', durationHours: 2, reason: 'Denied check' },
    });
    assert.equal(admin5BanDenied.status, 403);

    // 5. Worker Admin CANNOT modify or promote Super Admin, and Owner cannot lock self out
    const adminEditSuperDenied = await apiFetch(`/admin/users/${super1Id}`, {
      method: 'PATCH',
      token: admin1Token,
      body: { fullName: 'Hacked' },
    });
    assert.equal(adminEditSuperDenied.status, 403);

    const adminPromoteDenied = await apiFetch(`/admin/users/${targetUserId}/role`, {
      method: 'PATCH',
      token: admin1Token,
      body: { role: 'super_admin' },
    });
    assert.equal(adminPromoteDenied.status, 403);

    const selfDemoteDenied = await apiFetch(`/owner/admins/${super1Id}`, {
      method: 'PATCH',
      token: superToken,
      body: { role: 'user' },
    });
    assert.equal(selfDemoteDenied.status, 400);

    // 6. Deep User Inspection endpoints for seeded demo user1@briqen.demo
    const [detailRes, projRes, scriptRes, sceneRes, genRes, assetRes, actRes] = await Promise.all([
      apiFetch(`/admin/users/${demoUser1Id}`, { token: admin1Token }),
      apiFetch(`/admin/users/${demoUser1Id}/projects`, { token: admin1Token }),
      apiFetch(`/admin/users/${demoUser1Id}/scripts`, { token: admin1Token }),
      apiFetch(`/admin/users/${demoUser1Id}/scenes`, { token: admin1Token }),
      apiFetch(`/admin/users/${demoUser1Id}/generations`, { token: admin1Token }),
      apiFetch(`/admin/users/${demoUser1Id}/assets`, { token: admin1Token }),
      apiFetch(`/admin/users/${demoUser1Id}/activity`, { token: admin1Token }),
    ]);
    assert.equal(detailRes.status, 200);
    assert.equal(detailRes.data.data.user.isDemoAccount, true);
    assert.ok(projRes.data.data.length >= 1);
    assert.ok(scriptRes.data.data.length >= 1);
    assert.ok(sceneRes.data.data.length >= 2);
    assert.ok(genRes.data.data.actions.length >= 1);
    assert.ok(assetRes.data.data.length >= 1);
    assert.ok(actRes.data.data.length >= 1);

    // 7. Ban -> Immediate session/JWT revocation + blocked login -> Unban -> Login works again
    const targetLogin = await apiFetch('/auth/login', {
      method: 'POST',
      body: { email: tempUserEmail, password: createdPassword },
    });
    assert.equal(targetLogin.status, 200);
    const targetAccessToken = targetLogin.data.data.accessToken as string;
    const targetRefreshCookie = extractCookieValue(targetLogin.setCookies, REFRESH_COOKIE_NAME);
    assert.ok(targetAccessToken && targetRefreshCookie);

    const banRes = await apiFetch(`/admin/users/${targetUserId}/ban`, {
      method: 'POST',
      token: admin1Token,
      body: {
        banType: 'temporary',
        durationHours: 24,
        reason: 'Automated RBAC ban enforcement check',
      },
    });
    assert.equal(banRes.status, 200);
    assert.equal(banRes.data.data.accountStatus, 'banned');

    const bannedMe = await apiFetch('/auth/me', { token: targetAccessToken });
    assert.equal(bannedMe.status, 403);
    assert.equal(bannedMe.data.code, 'ACCOUNT_RESTRICTED');
    const bannedRefresh = await apiFetch('/auth/refresh', {
      method: 'POST',
      cookie: targetRefreshCookie,
    });
    assert.equal(bannedRefresh.status, 401);

    const bannedLogin = await apiFetch('/auth/login', {
      method: 'POST',
      body: { email: tempUserEmail, password: createdPassword },
    });
    assert.equal(bannedLogin.status, 403);
    assert.equal(bannedLogin.data.code, 'ACCOUNT_RESTRICTED');

    const unbanRes = await apiFetch(`/admin/users/${targetUserId}/unban`, {
      method: 'POST',
      token: admin1Token,
      body: { reason: 'Automated verification passed' },
    });
    assert.equal(unbanRes.status, 200);
    assert.equal(unbanRes.data.data.accountStatus, 'active');

    const stalePreBanMe = await apiFetch('/auth/me', { token: targetAccessToken });
    assert.equal(stalePreBanMe.status, 401);

    const postUnbanLogin = await apiFetch('/auth/login', {
      method: 'POST',
      body: { email: tempUserEmail, password: createdPassword },
    });
    assert.equal(postUnbanLogin.status, 200);

    // 8. Soft Delete -> Restore -> Permanent Delete (Super Admin only)
    const createForPurge = await apiFetch('/admin/users', {
      method: 'POST',
      token: superToken,
      body: {
        fullName: 'Purge Target',
        email: tempCreatedEmail,
        password: createdPassword,
      },
    });
    assert.equal(createForPurge.status, 201);
    const purgeId = createForPurge.data.data.id as string;
    createdUserIds.push(purgeId);

    const softDel = await apiFetch(`/admin/users/${purgeId}`, {
      method: 'DELETE',
      token: admin1Token,
      body: { permanent: false, reason: 'Soft delete check' },
    });
    assert.equal(softDel.status, 200);
    assert.equal(softDel.data.data.accountStatus, 'deleted');

    const restoreRes = await apiFetch(`/admin/users/${purgeId}/restore`, {
      method: 'POST',
      token: admin1Token,
    });
    assert.equal(restoreRes.status, 200);
    assert.equal(restoreRes.data.data.accountStatus, 'active');

    const adminPermDenied = await apiFetch(`/admin/users/${purgeId}?permanent=true`, {
      method: 'DELETE',
      token: admin1Token,
      body: { permanent: true, confirmPhrase: 'DELETE' },
    });
    assert.equal(adminPermDenied.status, 403);

    const superPermOk = await apiFetch(`/admin/users/${purgeId}?permanent=true`, {
      method: 'DELETE',
      token: superToken,
      body: { permanent: true, confirmPhrase: 'DELETE', reason: 'Test cleanup' },
    });
    assert.equal(superPermOk.status, 200);

    // 9. Owner Audit Logs recorded granular permission updates & denied attempts
    const ownerAuditRes = await apiFetch('/owner/audit-logs?limit=25', { token: superToken });
    assert.equal(ownerAuditRes.status, 200);
    assert.ok(ownerAuditRes.data.data.items.length >= 4);
    assert.ok(
      ownerAuditRes.data.data.items.some(
        (entry: { action: string }) => entry.action === 'owner.admin_permissions_update'
      )
    );
  } finally {
    if (createdUserIds.length > 0) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
    await db
      .delete(adminAuditLogs)
      .where(sql`${adminAuditLogs.targetUserId} IS NULL AND ${adminAuditLogs.action} IN ('view_audit_logs')`);
  }
});
