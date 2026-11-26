import { eq, sql } from 'drizzle-orm';
import { normalizeRole } from '../server/auth/rbac.ts';
import { createSignedMediaUrl } from '../server/storage.ts';
import { db } from './index.ts';
import { notificationPreferences, userPreferences, users } from './schema.ts';

export type UserRow = typeof users.$inferSelect;
export type UserPreferencesRow = typeof userPreferences.$inferSelect;
export type NotificationPreferencesRow = typeof notificationPreferences.$inferSelect;

export interface PublicUser {
  id: string;
  uid: string;
  email: string;
  pendingEmail: string | null;
  fullName: string | null;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  profileImageKey: string | null;
  phoneNumber: string | null;
  bio: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  website: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  creditsBalance: number;
  role: string;
  permissions?: string[];
  accountStatus: string;
  banReason: string | null;
  banExpiresAt: Date | null;
  bannedAt: Date | null;
  isActive: boolean;
  isVerified: boolean;
  isDemoAccount: boolean;
  hasLocalPassword: boolean;
  passwordChangedAt: Date | null;
  lastLoginAt: Date | null;
  deletionRequestedAt: Date | null;
  deletionScheduledFor: Date | null;
  deletionReason: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toPublicUser(user: UserRow, resolvedPermissions?: string[]): PublicUser {
  const resolvedAvatarUrl = user.profileImageKey
    ? createSignedMediaUrl(user.profileImageKey, 3600 * 24)
    : user.avatarUrl ?? null;

  const derivedStatus =
    user.deletedAt !== null
      ? user.accountStatus === 'deactivated'
        ? 'deactivated'
        : 'deleted'
      : user.accountStatus || (user.isActive ? 'active' : 'suspended');

  return {
    id: user.id,
    uid: user.uid,
    email: user.email,
    pendingEmail: user.pendingEmail ?? null,
    fullName: user.fullName ?? user.displayName ?? null,
    username: user.username ?? null,
    displayName: user.displayName ?? user.fullName ?? null,
    avatarUrl: resolvedAvatarUrl,
    profileImageKey: user.profileImageKey ?? null,
    phoneNumber: user.phoneNumber ?? null,
    bio: user.bio ?? null,
    country: user.country ?? null,
    state: user.state ?? null,
    city: user.city ?? null,
    website: user.website ?? null,
    linkedinUrl: user.linkedinUrl ?? null,
    githubUrl: user.githubUrl ?? null,
    creditsBalance: user.creditsBalance,
    role: normalizeRole(user.role),
    ...(resolvedPermissions ? { permissions: resolvedPermissions } : {}),
    accountStatus: derivedStatus,
    banReason: user.banReason ?? null,
    banExpiresAt: user.banExpiresAt ?? null,
    bannedAt: user.bannedAt ?? null,
    isActive: user.isActive,
    isVerified: user.isVerified,
    isDemoAccount: Boolean(user.isDemoAccount),
    hasLocalPassword: Boolean(user.passwordHash),
    passwordChangedAt: user.passwordChangedAt ?? null,
    lastLoginAt: user.lastLoginAt ?? null,
    deletionRequestedAt: user.deletionRequestedAt ?? null,
    deletionScheduledFor: user.deletionScheduledFor ?? null,
    deletionReason: user.deletionReason ?? null,
    deletedAt: user.deletedAt ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function getOrCreateUserPreferences(userId: string): Promise<UserPreferencesRow> {
  const existing = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);
  if (existing[0]) return existing[0];

  const [created] = await db
    .insert(userPreferences)
    .values({ userId })
    .onConflictDoNothing({ target: userPreferences.userId })
    .returning();
  if (created) return created;

  const fallback = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);
  return fallback[0];
}

export async function getOrCreateNotificationPreferences(
  userId: string
): Promise<NotificationPreferencesRow> {
  const existing = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);
  if (existing[0]) return existing[0];

  const [created] = await db
    .insert(notificationPreferences)
    .values({ userId })
    .onConflictDoNothing({ target: notificationPreferences.userId })
    .returning();
  if (created) return created;

  const fallback = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);
  return fallback[0];
}

export async function getUserById(id: string): Promise<UserRow | null> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getUserByUid(uid: string): Promise<UserRow | null> {
  try {
    const rows = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
    return rows[0] ?? null;
  } catch (error) {
    console.error('Database error in getUserByUid:', error);
    throw new Error('Failed to fetch user profile.', { cause: error });
  }
}

export async function getUserByEmail(email: string): Promise<UserRow | null> {
  const normalized = email.trim().toLowerCase();
  const rows = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${normalized}`)
    .limit(1);
  return rows[0] ?? null;
}

export async function getOrCreateUser(
  uid: string,
  email: string,
  displayName?: string | null,
  avatarUrl?: string | null
): Promise<UserRow> {
  const normalizedEmail = email.trim().toLowerCase();
  const fallbackName = displayName ?? normalizedEmail.split('@')[0];

  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${normalizedEmail}))`);

      const byUid = await tx.select().from(users).where(eq(users.uid, uid)).limit(1);
      if (byUid[0]) {
        const [updated] = await tx
          .update(users)
          .set({
            email: normalizedEmail,
            ...(displayName ? { displayName, fullName: byUid[0].fullName || displayName } : {}),
            ...(avatarUrl ? { avatarUrl } : {}),
            isVerified: true,
            lastLoginAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(users.id, byUid[0].id))
          .returning();
        return updated;
      }

      const byEmail = await tx
        .select()
        .from(users)
        .where(sql`lower(${users.email}) = ${normalizedEmail}`)
        .limit(1);

      if (byEmail[0]) {
        const [linked] = await tx
          .update(users)
          .set({
            uid,
            ...(displayName ? { displayName, fullName: byEmail[0].fullName || displayName } : {}),
            ...(avatarUrl ? { avatarUrl } : {}),
            isVerified: true,
            lastLoginAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(users.id, byEmail[0].id))
          .returning();
        return linked;
      }

      const [created] = await tx
        .insert(users)
        .values({
          uid,
          email: normalizedEmail,
          fullName: fallbackName,
          displayName: fallbackName,
          avatarUrl: avatarUrl ?? null,
          isActive: true,
          isVerified: true,
          lastLoginAt: new Date(),
        })
        .returning();

      return created;
    });
  } catch (error) {
    console.error('Database error in getOrCreateUser:', error);
    throw new Error('Failed to synchronize user profile.', { cause: error });
  }
}
