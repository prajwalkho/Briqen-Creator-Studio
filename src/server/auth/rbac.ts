import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '../../middleware/auth.ts';
import { recordAdminAuditLog } from '../services/activityService.ts';
import { type PermissionName, userHasPermission } from './permissions.ts';

export type CanonicalRole = 'super_admin' | 'admin' | 'user';

export const CANONICAL_ROLES: CanonicalRole[] = ['user', 'admin', 'super_admin'];

export const ROLE_LEVEL: Record<CanonicalRole, number> = {
  user: 0,
  admin: 1,
  super_admin: 2,
};

export function normalizeRole(rawRole: string | null | undefined): CanonicalRole {
  const val = (rawRole || '').trim().toLowerCase();
  if (val === 'super_admin' || val === 'superadmin') return 'super_admin';
  if (val === 'admin' || val === 'moderator' || val === 'mod') return 'admin';
  return 'user';
}

export function isAdminPanelRole(rawRole: string | null | undefined): boolean {
  const role = normalizeRole(rawRole);
  return role === 'super_admin' || role === 'admin';
}

export function isSuperAdminRole(rawRole: string | null | undefined): boolean {
  return normalizeRole(rawRole) === 'super_admin';
}

export function formatRoleLabel(rawRole: string | null | undefined): string {
  const role = normalizeRole(rawRole);
  switch (role) {
    case 'super_admin':
      return 'Super Admin';
    case 'admin':
      return 'Admin';
    default:
      return 'User';
  }
}

export function requireRole(...allowedRoles: CanonicalRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.dbUser) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Authentication required.',
      });
    }
    const callerRole = normalizeRole(req.dbUser.role);
    if (!allowedRoles.includes(callerRole)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Permission denied for your account role.',
      });
    }
    return next();
  };
}

export function requirePermission(permissionName: PermissionName) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.dbUser) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Authentication required.',
      });
    }
    const callerRole = normalizeRole(req.dbUser.role);
    if (callerRole === 'super_admin') {
      return next();
    }
    if (callerRole !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Administrative permissions required.',
      });
    }

    const granted =
      Array.isArray(req.dbUser.permissions) && req.dbUser.permissions.length > 0
        ? req.dbUser.permissions.includes(permissionName)
        : await userHasPermission(req.dbUser.id, callerRole, permissionName);

    if (!granted) {
      await recordAdminAuditLog({
        adminId: req.dbUser.id,
        action: `permission_denied:${permissionName}`,
        entityType: 'permission',
        entityId: permissionName,
        outcome: 'denied',
        newValues: { path: req.originalUrl, method: req.method, requiredPermission: permissionName },
        ipAddress: req.ip,
      }).catch(() => {});

      return res.status(403).json({
        success: false,
        code: 'PERMISSION_DENIED',
        requiredPermission: permissionName,
        message: `Permission denied: "${permissionName}" has not been granted to your Admin account.`,
      });
    }

    return next();
  };
}

export function canEditTargetUser(
  actorRoleRaw: string,
  targetRoleRaw: string,
  actorId: string,
  targetId: string
): { allowed: boolean; reason?: string } {
  const actorRole = normalizeRole(actorRoleRaw);
  const targetRole = normalizeRole(targetRoleRaw);

  if (actorRole === 'super_admin') {
    return { allowed: true };
  }
  if (actorRole === 'admin') {
    if (targetRole === 'super_admin') {
      return { allowed: false, reason: 'Admins cannot modify Super Admin accounts.' };
    }
    if (targetRole === 'admin' && actorId !== targetId) {
      return { allowed: false, reason: 'Only the Super Admin can modify Administrator accounts.' };
    }
    if (targetRole === 'admin' && actorId === targetId) {
      return {
        allowed: false,
        reason: 'Admins can update personal settings in Account Settings, not via Admin user overrides.',
      };
    }
    return { allowed: true };
  }
  return { allowed: false, reason: 'Insufficient privileges to edit user accounts.' };
}

export function canChangeTargetRole(
  actorRoleRaw: string,
  _targetCurrentRoleRaw: string,
  _nextRoleRaw: string,
  _actorId: string,
  _targetId: string
): { allowed: boolean; reason?: string } {
  const actorRole = normalizeRole(actorRoleRaw);
  if (actorRole === 'super_admin') {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: 'Only the Super Admin (Platform Owner) can manage user and administrator roles.',
  };
}

export function canBanTargetUser(
  actorRoleRaw: string,
  targetRoleRaw: string,
  actorId: string,
  targetId: string
): { allowed: boolean; reason?: string } {
  const actorRole = normalizeRole(actorRoleRaw);
  const targetRole = normalizeRole(targetRoleRaw);

  if (actorId === targetId) {
    return { allowed: false, reason: 'You cannot ban or suspend your own account.' };
  }

  if (actorRole === 'super_admin') {
    return { allowed: true };
  }

  if (actorRole === 'admin') {
    if (targetRole !== 'user') {
      return {
        allowed: false,
        reason: 'Admins can only ban or unban regular user accounts.',
      };
    }
    return { allowed: true };
  }

  return { allowed: false, reason: 'Insufficient permissions to ban or unban accounts.' };
}

export function canSoftDeleteTargetUser(
  actorRoleRaw: string,
  targetRoleRaw: string,
  actorId: string,
  targetId: string
): { allowed: boolean; reason?: string } {
  const actorRole = normalizeRole(actorRoleRaw);
  const targetRole = normalizeRole(targetRoleRaw);

  if (actorId === targetId) {
    return { allowed: false, reason: 'You cannot delete your own active administrative account.' };
  }

  if (actorRole === 'super_admin') {
    return { allowed: true };
  }

  if (actorRole === 'admin') {
    if (targetRole !== 'user') {
      return {
        allowed: false,
        reason: 'Only the Super Admin can delete Administrator or Super Admin accounts.',
      };
    }
    return { allowed: true };
  }

  return { allowed: false, reason: 'Insufficient permissions to delete user accounts.' };
}
