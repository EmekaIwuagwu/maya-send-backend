import { Response } from 'express';
import { AdminRequest } from '../../middleware/admin.middleware';
import adminReportsService from '../../services/admin/admin.reports.service';
import { prisma } from '../../config/database';
import logger from '../../utils/logger';

class AdminReportsController {
  /**
   * Generate report
   */
  async generateReport(req: AdminRequest, res: Response) {
    try {
      const { type, startDate, endDate, format = 'pdf' } = req.body;

      // Validate input
      if (!type || !startDate || !endDate) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_FIELDS',
            message: 'Type, startDate, and endDate are required',
          },
        });
      }

      if (!['pdf', 'excel', 'csv'].includes(format)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_FORMAT',
            message: 'Format must be pdf, excel, or csv',
          },
        });
      }

      const start = new Date(startDate);
      const end = new Date(endDate);

      let result;

      if (type === 'transaction') {
        result = await adminReportsService.generateTransactionReport({
          startDate: start,
          endDate: end,
          format: format as 'pdf' | 'excel' | 'csv',
          adminId: req.admin!.id,
        });
      } else if (type === 'user') {
        result = await adminReportsService.generateUserReport({
          startDate: start,
          endDate: end,
          format: format as 'pdf' | 'excel' | 'csv',
          adminId: req.admin!.id,
        });
      } else {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_TYPE',
            message: 'Type must be transaction or user',
          },
        });
      }

      return res.status(201).json({
        success: true,
        data: result,
        message: 'Report generated successfully',
      });
    } catch (error: any) {
      logger.error('Generate report error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'REPORT_GENERATION_FAILED',
          message: 'Failed to generate report',
        },
      });
    }
  }

  /**
   * Get reports list
   */
  async getReports(req: AdminRequest, res: Response) {
    try {
      const {
        reportType,
        generatedBy,
        page = '1',
        limit = '50',
      } = req.query;

      const where: any = {};
      if (reportType) where.reportType = reportType;
      if (generatedBy) where.generatedBy = generatedBy;

      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);
      const skip = (pageNum - 1) * limitNum;

      const [reports, total] = await Promise.all([
        prisma.report.findMany({
          where,
          include: {
            admin: {
              select: {
                id: true,
                email: true,
                fullName: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          skip,
          take: limitNum,
        }),
        prisma.report.count({ where }),
      ]);

      return res.status(200).json({
        success: true,
        data: reports,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error: any) {
      logger.error('Get reports error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_REPORTS_FAILED',
          message: 'Failed to fetch reports',
        },
      });
    }
  }

  /**
   * Get report by ID
   */
  async getReportById(req: AdminRequest, res: Response) {
    try {
      const { id } = req.params;

      const report = await prisma.report.findUnique({
        where: { id },
        include: {
          admin: {
            select: {
              id: true,
              email: true,
              fullName: true,
            },
          },
        },
      });

      if (!report) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'REPORT_NOT_FOUND',
            message: 'Report not found',
          },
        });
      }

      return res.status(200).json({
        success: true,
        data: report,
      });
    } catch (error: any) {
      logger.error('Get report by ID error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_REPORT_FAILED',
          message: 'Failed to fetch report',
        },
      });
    }
  }

  /**
   * Generate daily report (can be called manually or scheduled)
   */
  async generateDailyReport(req: AdminRequest, res: Response) {
    try {
      const report = await adminReportsService.generateDailyReport();

      return res.status(201).json({
        success: true,
        data: report,
        message: 'Daily report generated successfully',
      });
    } catch (error: any) {
      logger.error('Generate daily report error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'DAILY_REPORT_FAILED',
          message: 'Failed to generate daily report',
        },
      });
    }
  }
}

export default new AdminReportsController();
