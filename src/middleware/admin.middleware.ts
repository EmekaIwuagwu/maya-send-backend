import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';
import { config } from '../config';

export interface AdminRequest extends Request {
  admin?: {
    id: string;
    email: string;
    role: string;
    permissions: string[];
  };
}

export const authenticateAdmin = async (
  req: AdminRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Admin authentication required',
        },
      });
    }

    // Verify JWT
    const decoded = jwt.verify(token, config.jwt.adminSecret) as any;

    // Get admin from database
    const admin = await prisma.admin.findUnique({
      where: { id: decoded.adminId },
      select: {
        id: true,
        email: true,
        role: true,
        permissions: true,
        isActive: true,
        isSuspended: true,
        allowedIPs: true,
      },
    });

    if (!admin) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid admin token',
        },
      });
    }

    if (!admin.isActive || admin.isSuspended) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'ACCOUNT_SUSPENDED',
          message: 'Admin account is suspended or inactive',
        },
      });
    }

    // Check IP whitelist if configured
    if (admin.allowedIPs && Array.isArray(admin.allowedIPs) && admin.allowedIPs.length > 0) {
      const clientIP = req.ip || req.socket.remoteAddress;
      if (clientIP && !admin.allowedIPs.includes(clientIP)) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'IP_NOT_ALLOWED',
            message: 'Access denied from this IP address',
          },
        });
      }
    }

    // Verify session
    const session = await prisma.adminSession.findFirst({
      where: {
        token,
        adminId: admin.id,
        isActive: true,
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    if (!session) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'SESSION_EXPIRED',
          message: 'Admin session expired',
        },
      });
    }

    // Update last activity
    await prisma.adminSession.update({
      where: { id: session.id },
      data: {
        lastActivityAt: new Date(),
      },
    });

    // Attach admin to request
    req.admin = {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      permissions: admin.permissions,
    };

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'AUTHENTICATION_FAILED',
        message: 'Admin authentication failed',
      },
    });
  }
};
