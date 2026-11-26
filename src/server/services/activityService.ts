import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  adminAuditLogs,
  userActivities,
  userBanHistory,
  users,
} from '../../db/schema.ts';
import type { UserRow } from '../../db/users.ts';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'password_hash',
  'token',
  'tokenHash',
  'token_hash',
  'refreshToken',
  'accessToken',
]);

function sanitizeAuditObject(
  input: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!input) return null;
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (SENSITIVE_KEYS.has(k)) {
      cleaned[k] = '[REDACTED]';
    } else if (v instanceof Date) {
      cleaned[k] = v.toISOString();
    } else {
      cleaned[k] = v;
    }
  }
  return cleaned;
}

export async function logUserActivity(params: {
  userId: string;
  activityType: string;
  description: string;
  relatedProjectId?: string | null;
  relatedAssetId?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await db.insert(userActivities).values({
      userId: params.userId,
      activityType: params.activityType,
      description: params.description,
      relatedProjectId: params.relatedProjectId ?? null,
      relatedAssetId: params.relatedAssetId ?? null,
      metadata: params.metadata ?? null,
    });
  } catch (error) {
    console.warn('Activity logging warning:', error);
  }
}

export async function recordAdminAuditLog(params: {
  adminId: string | null;
  targetUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  outcome?: 'success' | 'denied' | 'failed';
  previousValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  ipAddress?: string | null;
}): Promise<string | null> {
  try {
    const [inserted] = await db
      .insert(adminAuditLogs)
      .values({
        adminId: params.adminId,
        targetUserId: params.targetUserId ?? null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        outcome: params.outcome ?? 'success',
        previousValues: sanitizeAuditObject(params.previousValues),
        newValues: sanitizeAuditObject(params.newValues),
        ipAddress: params.ipAddress ? params.ipAddress.slice(0, 64) : null,
      })
      .returning({ id: adminAuditLogs.id });
    return inserted?.id ?? null;
  } catch (error) {
    console.error('Failed to record admin audit log:', error);
    return null;
  }
}

export async function syncExpiredBanIfNeeded(userRow: UserRow): Promise<UserRow> {
  if (
    userRow.accountStatus === 'banned' &&
    userRow.banExpiresAt &&
    userRow.banExpiresAt <= new Date() &&
    userRow.deletedAt === null
  ) {
    const now = new Date();
    const updated = await db.transaction(async (tx) => {
      const [restored] = await tx
        .update(users)
        .set({
          accountStatus: 'active',
          isActive: true,
          banReason: null,
          banExpiresAt: null,
          bannedAt: null,
          bannedBy: null,
          updatedAt: now,
        })
        .where(and(eq(users.id, userRow.id), isNull(users.deletedAt)))
        .returning();

      if (restored) {
        await tx.insert(userBanHistory).values({
          userId: userRow.id,
          action: 'unban',
          banType: 'temporary',
          reason: 'Temporary ban expired automatically.',
          internalNote: 'System auto-restored account upon ban expiry timestamp.',
          performedBy: null,
          expiresAt: userRow.banExpiresAt,
        });
      }
      return restored;
    });

    if (updated) {
      await logUserActivity({
        userId: userRow.id,
        activityType: 'account_unbanned',
        description: 'Temporary account ban expired and access was automatically restored.',
      });
      return updated;
    }
  }
  return userRow;
}
