import { prisma } from '../../config/database';
import { AuditAction } from '@prisma/client';
import logger from '../../utils/logger';

interface AuditLogParams {
  adminId: string;
  action: AuditAction;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: any;
}

class AdminAuditService {
  /**
   * Create an audit log entry
   */
  async log(params: AuditLogParams) {
    try {
      const auditLog = await prisma.auditLog.create({
        data: {
          adminId: params.adminId,
          action: params.action,
          resourceType: params.resourceType,
          resourceId: params.resourceId,
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
          metadata: params.metadata || {},
        },
      });

      logger.info('Audit log created', {
        auditLogId: auditLog.id,
        adminId: params.adminId,
        action: params.action,
      });

      return auditLog;
    } catch (error) {
      logger.error('Failed to create audit log', { error, params });
      throw error;
    }
  }

  /**
   * Get audit logs with filtering and pagination
   */
  async getAuditLogs(params: {
    adminId?: string;
    action?: AuditAction;
    resourceType?: string;
    resourceId?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }) {
    const page = params.page || 1;
    const limit = params.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (params.adminId) where.adminId = params.adminId;
    if (params.action) where.action = params.action;
    if (params.resourceType) where.resourceType = params.resourceType;
    if (params.resourceId) where.resourceId = params.resourceId;

    if (params.startDate || params.endDate) {
      where.createdAt = {};
      if (params.startDate) where.createdAt.gte = params.startDate;
      if (params.endDate) where.createdAt.lte = params.endDate;
    }

    const [auditLogs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          admin: {
            select: {
              id: true,
              email: true,
              fullName: true,
              role: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      auditLogs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get audit logs for a specific resource
   */
  async getResourceAuditTrail(resourceType: string, resourceId: string) {
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        resourceType,
        resourceId,
      },
      include: {
        admin: {
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return auditLogs;
  }

  /**
   * Clean up old audit logs based on retention policy
   */
  async cleanupOldLogs(retentionDays: number = 365) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await prisma.auditLog.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    logger.info('Cleaned up old audit logs', {
      deletedCount: result.count,
      retentionDays,
    });

    return result;
  }
}

export default new AdminAuditService();
