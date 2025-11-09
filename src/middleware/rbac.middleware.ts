import { Response, NextFunction } from 'express';
import { AdminRequest } from './admin.middleware';
import { AdminPermission } from '@prisma/client';

export const requirePermission = (...permissions: AdminPermission[]) => {
  return (req: AdminRequest, res: Response, next: NextFunction) => {
    if (!req.admin) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Admin authentication required',
        },
      });
    }

    // Super admins have all permissions
    if (req.admin.role === 'SUPER_ADMIN') {
      return next();
    }

    // Check if admin has required permissions
    const hasPermission = permissions.some((permission) =>
      req.admin!.permissions.includes(permission)
    );

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: 'You do not have permission to perform this action',
          required: permissions,
        },
      });
    }

    next();
  };
};

export const requireRole = (...roles: string[]) => {
  return (req: AdminRequest, res: Response, next: NextFunction) => {
    if (!req.admin) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Admin authentication required',
        },
      });
    }

    if (!roles.includes(req.admin.role)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_ROLE',
          message: 'Your role does not have access to this resource',
          required: roles,
        },
      });
    }

    next();
  };
};
