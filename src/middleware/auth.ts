import type { NextFunction, Request, Response } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { getOrCreateUser, getUserById, toPublicUser } from '../db/users.ts';
import type { PublicUser } from '../db/users.ts';
import { adminAuth } from '../lib/firebase-admin.ts';
import { getUserPermissions } from '../server/auth/permissions.ts';
import { verifyAccessToken } from '../server/auth/security.ts';
import { syncExpiredBanIfNeeded } from '../server/services/activityService.ts';

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
  dbUser?: PublicUser;
}

function formatRestrictionMessage(userRow: {
  accountStatus: string;
  banReason: string | null;
  banExpiresAt: Date | null;
}): string {
  if (userRow.accountStatus === 'banned') {
    const expiryNote = userRow.banExpiresAt
      ? ` Restriction expires on ${userRow.banExpiresAt.toLocaleString()}.`
      : ' This restriction is permanent.';
    return `Your account has been banned${userRow.banReason ? `: ${userRow.banReason}` : '.'}${expiryNote}`;
  }
  return 'Your account is currently suspended. Please contact support.';
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: Missing authentication token.',
    });
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: Missing authentication token.',
    });
  }

  // 1. Try verifying as our short-lived local JWT access token
  const localClaims = verifyAccessToken(token);
  if (localClaims) {
    try {
      const rawUserRow = await getUserById(localClaims.sub);
      if (!rawUserRow || rawUserRow.deletedAt !== null) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized: Invalid or expired session.',
        });
      }

      const userRow = await syncExpiredBanIfNeeded(rawUserRow);
      if (userRow.accountStatus === 'banned' || userRow.accountStatus === 'suspended') {
        return res.status(403).json({
          success: false,
          code: 'ACCOUNT_RESTRICTED',
          message: formatRestrictionMessage(userRow),
        });
      }

      if (
        !userRow.isActive ||
        userRow.accountStatus !== 'active' ||
        (localClaims.tokenVersion !== undefined && localClaims.tokenVersion !== userRow.tokenVersion)
      ) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized: Invalid or expired session.',
        });
      }
      const resolvedPerms = await getUserPermissions(userRow.id, userRow.role);
      req.dbUser = toPublicUser(userRow, resolvedPerms);
      return next();
    } catch (error) {
      console.error('Database lookup error during JWT auth:', error);
      return res.status(500).json({
        success: false,
        message: 'Authentication service unavailable.',
      });
    }
  }

  // 2. Fallback: verify Firebase ID token (Google OAuth sign-in)
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;

    const rawDbUser = await getOrCreateUser(
      decodedToken.uid,
      decodedToken.email || `${decodedToken.uid}@user.local`,
      decodedToken.name || null,
      decodedToken.picture || null
    );
    const dbUserRow = await syncExpiredBanIfNeeded(rawDbUser);
    if (dbUserRow.accountStatus === 'banned' || dbUserRow.accountStatus === 'suspended') {
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_RESTRICTED',
        message: formatRestrictionMessage(dbUserRow),
      });
    }
    if (!dbUserRow.isActive || dbUserRow.deletedAt !== null || dbUserRow.accountStatus !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'This account has been deactivated.',
      });
    }
    const resolvedPerms = await getUserPermissions(dbUserRow.id, dbUserRow.role);
    req.dbUser = toPublicUser(dbUserRow, resolvedPerms);
    return next();
  } catch {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: Invalid or expired token.',
    });
  }
};
