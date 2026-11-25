import type { NextFunction, Request, Response } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { getOrCreateUser, getUserById, toPublicUser } from '../db/users.ts';
import type { PublicUser } from '../db/users.ts';
import { adminAuth } from '../lib/firebase-admin.ts';
import { verifyAccessToken } from '../server/auth/security.ts';

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
  dbUser?: PublicUser;
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
      const userRow = await getUserById(localClaims.sub);
      if (
        !userRow ||
        !userRow.isActive ||
        userRow.deletedAt !== null ||
        (localClaims.tokenVersion !== undefined && localClaims.tokenVersion !== userRow.tokenVersion)
      ) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized: Invalid or expired session.',
        });
      }
      req.dbUser = toPublicUser(userRow);
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

    const dbUserRow = await getOrCreateUser(
      decodedToken.uid,
      decodedToken.email || `${decodedToken.uid}@user.local`,
      decodedToken.name || null,
      decodedToken.picture || null
    );
    if (!dbUserRow.isActive || dbUserRow.deletedAt !== null) {
      return res.status(403).json({
        success: false,
        message: 'This account has been deactivated.',
      });
    }
    req.dbUser = toPublicUser(dbUserRow);
    return next();
  } catch {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: Invalid or expired token.',
    });
  }
};
