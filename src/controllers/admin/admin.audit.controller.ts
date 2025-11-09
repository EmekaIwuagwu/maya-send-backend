import { Response } from 'express';
import { AdminRequest } from '../../middleware/admin.middleware';
import adminAuditService from '../../services/admin/admin.audit.service';
import { AuditAction } from '@prisma/client';
import logger from '../../utils/logger';

class AdminAuditController {
  /**
   * Get audit logs
   */
  async getAuditLogs(req: AdminRequest, res: Response) {
    try {
      const {
        adminId,
        action,
        resourceType,
        resourceId,
        startDate,
        endDate,
        page = '1',
        limit = '50',
      } = req.query;

      const result = await adminAuditService.getAuditLogs({
        adminId: adminId as string | undefined,
        action: action as AuditAction | undefined,
        resourceType: resourceType as string | undefined,
        resourceId: resourceId as string | undefined,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        page: parseInt(page as string, 10),
        limit: parseInt(limit as string, 10),
      });

      return res.status(200).json({
        success: true,
        data: result.auditLogs,
        pagination: result.pagination,
      });
    } catch (error: any) {
      logger.error('Get audit logs error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_AUDIT_LOGS_FAILED',
          message: 'Failed to fetch audit logs',
        },
      });
    }
  }

  /**
   * Get audit trail for a specific resource
   */
  async getResourceAuditTrail(req: AdminRequest, res: Response) {
    try {
      const { resourceType, resourceId } = req.params;

      const auditLogs = await adminAuditService.getResourceAuditTrail(
        resourceType,
        resourceId
      );

      return res.status(200).json({
        success: true,
        data: auditLogs,
      });
    } catch (error: any) {
      logger.error('Get resource audit trail error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_AUDIT_TRAIL_FAILED',
          message: 'Failed to fetch audit trail',
        },
      });
    }
  }
}

export default new AdminAuditController();
