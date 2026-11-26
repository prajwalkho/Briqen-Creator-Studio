import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { adminPermissions, permissions } from '../../db/schema.ts';
import { normalizeRole, type CanonicalRole } from './rbac.ts';

export interface PermissionDefinition {
  name: PermissionName;
  category:
    | 'Users'
    | 'Projects & Content'
    | 'AI & Media'
    | 'Analytics & Reports'
    | 'Financial'
    | 'Support';
  description: string;
}

export const PERMISSION_CATALOG = [
  {
    name: 'users.view',
    category: 'Users',
    description: 'View and search registered regular users and inspect profiles.',
  },
  {
    name: 'users.create',
    category: 'Users',
    description: 'Create new regular user accounts.',
  },
  {
    name: 'users.edit',
    category: 'Users',
    description: 'Edit permitted regular user profile fields and trigger verification/reset.',
  },
  {
    name: 'users.ban',
    category: 'Users',
    description: 'Ban or suspend regular user accounts and revoke active sessions.',
  },
  {
    name: 'users.unban',
    category: 'Users',
    description: 'Lift bans and restore access for restricted regular user accounts.',
  },
  {
    name: 'users.delete',
    category: 'Users',
    description: 'Soft-delete or restore regular user accounts.',
  },
  {
    name: 'projects.view',
    category: 'Projects & Content',
    description: 'View regular user projects and metadata.',
  },
  {
    name: 'projects.manage',
    category: 'Projects & Content',
    description: 'Update or moderate regular user project statuses and settings.',
  },
  {
    name: 'scripts.view',
    category: 'Projects & Content',
    description: 'Inspect script revisions created by regular users.',
  },
  {
    name: 'scripts.manage',
    category: 'Projects & Content',
    description: 'Moderate or annotate user script revisions.',
  },
  {
    name: 'scenes.view',
    category: 'Projects & Content',
    description: 'Inspect storyboard scenes and narration prompts.',
  },
  {
    name: 'scenes.manage',
    category: 'Projects & Content',
    description: 'Moderate or adjust storyboard scene configurations.',
  },
  {
    name: 'generations.view',
    category: 'AI & Media',
    description: 'Monitor AI generation jobs, attempts, and provider failures.',
  },
  {
    name: 'generations.retry',
    category: 'AI & Media',
    description: 'Retry failed AI generation jobs on behalf of users.',
  },
  {
    name: 'assets.view',
    category: 'AI & Media',
    description: 'Inspect generated media assets and video exports.',
  },
  {
    name: 'support.view',
    category: 'Support',
    description: 'View user support issues and account assistance logs.',
  },
  {
    name: 'support.manage',
    category: 'Support',
    description: 'Respond to and resolve user support requests.',
  },
  {
    name: 'analytics.operational.view',
    category: 'Analytics & Reports',
    description: 'View operational admin dashboard metrics and user activity streams.',
  },
  {
    name: 'reports.export',
    category: 'Analytics & Reports',
    description: 'Export authorized user inspection snapshots and operational CSV reports.',
  },
  {
    name: 'financial.view',
    category: 'Financial',
    description: 'View credit usage and estimated AI operating cost analytics.',
  },
] as const;

export type PermissionName = (typeof PERMISSION_CATALOG)[number]['name'];

export const ALL_PERMISSION_NAMES: PermissionName[] = PERMISSION_CATALOG.map((p) => p.name);

// Strictly limited default permissions assigned to newly created worker Admins (never all permissions)
export const DEFAULT_ADMIN_PERMISSIONS: PermissionName[] = [
  'users.view',
  'projects.view',
  'scripts.view',
  'scenes.view',
  'generations.view',
  'assets.view',
  'analytics.operational.view',
];

let seedCatalogPromise: Promise<void> | null = null;

export async function ensurePermissionCatalogSeeded(): Promise<void> {
  if (!seedCatalogPromise) {
    seedCatalogPromise = (async () => {
      for (const item of PERMISSION_CATALOG) {
        await db
          .insert(permissions)
          .values({
            name: item.name,
            category: item.category,
            description: item.description,
          })
          .onConflictDoUpdate({
            target: permissions.name,
            set: {
              category: item.category,
              description: item.description,
            },
          });
      }
    })().catch((err) => {
      seedCatalogPromise = null;
      throw err;
    });
  }
  return seedCatalogPromise;
}

export function isValidPermissionName(name: string): name is PermissionName {
  return ALL_PERMISSION_NAMES.includes(name as PermissionName);
}

export async function getUserPermissions(
  userId: string,
  roleRaw: string | null | undefined
): Promise<PermissionName[]> {
  const role: CanonicalRole = normalizeRole(roleRaw);
  if (role === 'super_admin') {
    return [...ALL_PERMISSION_NAMES];
  }
  if (role !== 'admin') {
    return [];
  }

  await ensurePermissionCatalogSeeded();
  const rows = await db
    .select({ name: permissions.name })
    .from(adminPermissions)
    .innerJoin(permissions, eq(adminPermissions.permissionId, permissions.id))
    .where(eq(adminPermissions.adminUserId, userId));

  return rows
    .map((r) => r.name)
    .filter((name): name is PermissionName => isValidPermissionName(name));
}

export async function userHasPermission(
  userId: string,
  roleRaw: string | null | undefined,
  permissionName: PermissionName
): Promise<boolean> {
  const role = normalizeRole(roleRaw);
  if (role === 'super_admin') return true;
  if (role !== 'admin') return false;

  const perms = await getUserPermissions(userId, role);
  return perms.includes(permissionName);
}

export async function setAdminPermissions(
  adminUserId: string,
  permissionNames: PermissionName[],
  grantedBy: string | null,
  scopeJson?: Record<string, unknown> | null
): Promise<PermissionName[]> {
  await ensurePermissionCatalogSeeded();
  const uniqueNames = Array.from(new Set(permissionNames.filter(isValidPermissionName)));

  return db.transaction(async (tx) => {
    await tx.delete(adminPermissions).where(eq(adminPermissions.adminUserId, adminUserId));

    if (uniqueNames.length === 0) {
      return [];
    }

    const permRows = await tx
      .select({ id: permissions.id, name: permissions.name })
      .from(permissions)
      .where(inArray(permissions.name, uniqueNames));

    if (permRows.length > 0) {
      await tx.insert(adminPermissions).values(
        permRows.map((p) => ({
          adminUserId,
          permissionId: p.id,
          grantedBy,
          scopeJson: scopeJson ?? null,
        }))
      );
    }

    return permRows.map((p) => p.name as PermissionName);
  });
}

export async function getAllAdminsPermissionMap(adminIds: string[]): Promise<Record<string, PermissionName[]>> {
  if (adminIds.length === 0) return {};
  await ensurePermissionCatalogSeeded();

  const rows = await db
    .select({
      adminUserId: adminPermissions.adminUserId,
      name: permissions.name,
    })
    .from(adminPermissions)
    .innerJoin(permissions, eq(adminPermissions.permissionId, permissions.id))
    .where(inArray(adminPermissions.adminUserId, adminIds));

  const map: Record<string, PermissionName[]> = {};
  for (const id of adminIds) map[id] = [];
  for (const row of rows) {
    if (isValidPermissionName(row.name)) {
      map[row.adminUserId].push(row.name);
    }
  }
  return map;
}

export async function listPermissionsCatalogWithCounts(): Promise<
  Array<{
    id: string;
    name: string;
    category: string;
    description: string;
    assignedAdminCount: number;
  }>
> {
  await ensurePermissionCatalogSeeded();
  const rows = await db
    .select({
      id: permissions.id,
      name: permissions.name,
      category: permissions.category,
      description: permissions.description,
      assignedAdminCount: sql<number>`count(${adminPermissions.id})::int`,
    })
    .from(permissions)
    .leftJoin(adminPermissions, eq(permissions.id, adminPermissions.permissionId))
    .groupBy(permissions.id, permissions.name, permissions.category, permissions.description);

  const orderMap = new Map(ALL_PERMISSION_NAMES.map((name, idx) => [name, idx]));
  return rows.sort(
    (a, b) => (orderMap.get(a.name as PermissionName) ?? 999) - (orderMap.get(b.name as PermissionName) ?? 999)
  );
}
