import { Response } from 'express';
import { AdminRequest } from '../../middleware/admin.middleware';
import { prisma } from '../../config/database';
import logger from '../../utils/logger';
import os from 'os';

class AdminSystemController {
  /**
   * Get system health status
   */
  async getHealth(req: AdminRequest, res: Response) {
    try {
      const startTime = Date.now();

      // Test database connection
      let dbStatus = 'healthy';
      let dbLatency = 0;
      try {
        const dbStart = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        dbLatency = Date.now() - dbStart;
      } catch (error) {
        dbStatus = 'unhealthy';
        logger.error('Database health check failed', { error });
      }

      // Get database stats
      const [userCount, transactionCount, adminCount] = await Promise.all([
        prisma.user.count(),
        prisma.transaction.count(),
        prisma.admin.count(),
      ]);

      // System information
      const systemInfo = {
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        loadAverage: os.loadavg(),
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
      };

      const healthCheck = {
        status: dbStatus === 'healthy' ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        responseTime: Date.now() - startTime,
        services: {
          database: {
            status: dbStatus,
            latency: dbLatency,
            stats: {
              users: userCount,
              transactions: transactionCount,
              admins: adminCount,
            },
          },
          api: {
            status: 'healthy',
          },
        },
        system: systemInfo,
      };

      return res.status(200).json({
        success: true,
        data: healthCheck,
      });
    } catch (error: any) {
      logger.error('Health check error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'HEALTH_CHECK_FAILED',
          message: 'Failed to perform health check',
        },
      });
    }
  }

  /**
   * Clear application cache (super admin only)
   */
  async clearCache(req: AdminRequest, res: Response) {
    try {
      // TODO: Implement actual cache clearing logic
      // This would depend on the caching solution used (Redis, Node-cache, etc.)

      logger.warn('Cache cleared', {
        adminId: req.admin!.id,
        adminEmail: req.admin!.email,
      });

      return res.status(200).json({
        success: true,
        message: 'Cache cleared successfully',
        data: {
          clearedAt: new Date().toISOString(),
          clearedBy: req.admin!.email,
        },
      });
    } catch (error: any) {
      logger.error('Clear cache error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'CLEAR_CACHE_FAILED',
          message: 'Failed to clear cache',
        },
      });
    }
  }

  /**
   * Toggle maintenance mode (super admin only)
   */
  async toggleMaintenance(req: AdminRequest, res: Response) {
    try {
      const { enabled, message } = req.body;

      if (enabled === undefined) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_ENABLED',
            message: 'Enabled flag is required',
          },
        });
      }

      // Update or create maintenance mode setting
      const maintenanceSetting = await prisma.setting.upsert({
        where: { key: 'maintenance_mode' },
        update: {
          value: enabled,
          updatedBy: req.admin!.id,
        },
        create: {
          key: 'maintenance_mode',
          value: enabled,
          dataType: 'boolean',
          category: 'system',
          description: 'System maintenance mode',
          updatedBy: req.admin!.id,
        },
      });

      // Update maintenance message if provided
      if (message) {
        await prisma.setting.upsert({
          where: { key: 'maintenance_message' },
          update: {
            value: message,
            updatedBy: req.admin!.id,
          },
          create: {
            key: 'maintenance_message',
            value: message,
            dataType: 'string',
            category: 'system',
            description: 'Maintenance mode message',
            updatedBy: req.admin!.id,
          },
        });
      }

      logger.warn('Maintenance mode toggled', {
        enabled,
        message,
        adminId: req.admin!.id,
        adminEmail: req.admin!.email,
      });

      return res.status(200).json({
        success: true,
        data: {
          maintenanceMode: enabled,
          message: message || null,
          updatedAt: maintenanceSetting.updatedAt,
          updatedBy: req.admin!.email,
        },
        message: `Maintenance mode ${enabled ? 'enabled' : 'disabled'}`,
      });
    } catch (error: any) {
      logger.error('Toggle maintenance error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'TOGGLE_MAINTENANCE_FAILED',
          message: 'Failed to toggle maintenance mode',
        },
      });
    }
  }
}

export default new AdminSystemController();
