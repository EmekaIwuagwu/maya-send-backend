import { Response, NextFunction } from 'express';
import { AdminRequest } from './admin.middleware';
import adminAuditService from '../services/admin/admin.audit.service';
import { AuditAction } from '@prisma/client';

export const auditLog = (action: AuditAction, resourceType?: string) => {
  return async (req: AdminRequest, res: Response, next: NextFunction) => {
    // Store original send function
    const originalSend = res.send;

    // Override send to capture response
    res.send = function (data: any): Response {
      // Only log successful operations (2xx status codes)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const resourceId = req.params.id || req.body?.id;

        // Log asynchronously (don't wait for it)
        adminAuditService
          .log({
            adminId: req.admin!.id,
            action,
            resourceType,
            resourceId,
            ipAddress: req.ip || req.socket.remoteAddress,
            userAgent: req.headers['user-agent'],
            metadata: {
              method: req.method,
              path: req.path,
              body: req.body,
              query: req.query,
            },
          })
          .catch((err) => {
            console.error('Failed to create audit log:', err);
          });
      }

      // Call original send
      return originalSend.call(this, data);
    };

    next();
  };
};
