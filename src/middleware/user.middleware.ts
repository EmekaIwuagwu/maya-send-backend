import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';
import config from '../config';
import logger from '../utils/logger';

export interface UserRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
}

/**
 * Authenticate user via JWT
 */
export const authenticateUser = async (
  req: UserRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'NO_TOKEN',
          message: 'No authentication token provided',
        },
      });
    }

    const token = authHeader.substring(7);

    // Verify JWT
    let decoded: any;
    try {
      decoded = jwt.verify(token, config.jwt.accessSecret);
    } catch (error) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid or expired token',
        },
      });
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        isSuspended: true,
        isDeleted: true,
        suspensionReason: true,
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
      });
    }

    // Check if user is suspended
    if (user.isSuspended) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'ACCOUNT_SUSPENDED',
          message: `Your account has been suspended. Reason: ${user.suspensionReason || 'Violation of terms'}`,
        },
      });
    }

    // Check if user is deleted
    if (user.isDeleted) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'ACCOUNT_DELETED',
          message: 'This account has been deleted',
        },
      });
    }

    // Attach user to request
    req.user = {
      id: user.id,
      email: user.email,
    };

    next();
  } catch (error: any) {
    logger.error('User authentication error', { error: error.message });
    return res.status(500).json({
      success: false,
      error: {
        code: 'AUTH_ERROR',
        message: 'Authentication failed',
      },
    });
  }
};

/**
 * Check if user has completed KYC
 */
export const requireKYC = (req: UserRequest, res: Response, next: NextFunction) => {
  return async (req: UserRequest, res: Response, next: NextFunction) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: { kycStatus: true },
      });

      if (!user || user.kycStatus !== 'VERIFIED') {
        return res.status(403).json({
          success: false,
          error: {
            code: 'KYC_REQUIRED',
            message: 'KYC verification is required for this action',
          },
        });
      }

      next();
    } catch (error: any) {
      logger.error('KYC check error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'KYC_CHECK_FAILED',
          message: 'Failed to verify KYC status',
        },
      });
    }
  };
};
