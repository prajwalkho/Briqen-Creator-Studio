import { db } from './index.ts';
import { users } from './schema.ts';
import { eq } from 'drizzle-orm';

export async function getOrCreateUser(
  uid: string,
  email: string,
  displayName?: string | null,
  avatarUrl?: string | null
) {
  try {
    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        displayName: displayName ?? email.split('@')[0],
        avatarUrl: avatarUrl ?? null,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          ...(displayName ? { displayName } : {}),
          ...(avatarUrl ? { avatarUrl } : {}),
          updatedAt: new Date(),
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database error in getOrCreateUser:', error);
    throw new Error('Failed to synchronize user profile.', { cause: error });
  }
}

export async function getUserByUid(uid: string) {
  try {
    const rows = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
    return rows[0] ?? null;
  } catch (error) {
    console.error('Database error in getUserByUid:', error);
    throw new Error('Failed to fetch user profile.', { cause: error });
  }
}
