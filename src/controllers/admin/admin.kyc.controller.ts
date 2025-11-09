import { Response } from 'express';
import { AdminRequest } from '../../middleware/admin.middleware';
import { prisma } from '../../config/database';
import logger from '../../utils/logger';

class AdminKYCController {
  /**
   * Get pending KYC submissions
   */
  async getPendingKYC(req: AdminRequest, res: Response) {
    try {
      const { page = '1', limit = '50' } = req.query;

      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);
      const skip = (pageNum - 1) * limitNum;

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where: {
            kycStatus: 'PENDING',
          },
          select: {
            id: true,
            email: true,
            fullName: true,
            phoneNumber: true,
            kycStatus: true,
            kycData: true,
            createdAt: true,
            _count: {
              select: {
                sentTransactions: true,
                receivedTransactions: true,
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
          skip,
          take: limitNum,
        }),
        prisma.user.count({
          where: {
            kycStatus: 'PENDING',
          },
        }),
      ]);

      return res.status(200).json({
        success: true,
        data: users,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error: any) {
      logger.error('Get pending KYC error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_PENDING_KYC_FAILED',
          message: 'Failed to fetch pending KYC submissions',
        },
      });
    }
  }

  /**
   * Approve KYC submission
   */
  async approveKYC(req: AdminRequest, res: Response) {
    try {
      const { userId } = req.params;
      const { notes } = req.body;

      // Get user details
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
          },
        });
      }

      if (user.kycStatus !== 'PENDING') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_KYC_STATUS',
            message: `KYC status is ${user.kycStatus}, not PENDING`,
          },
        });
      }

      // Update user KYC status
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          kycStatus: 'VERIFIED',
          kycVerifiedAt: new Date(),
          kycVerifiedBy: req.admin!.id,
          kycNotes: notes || null,
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          kycStatus: true,
          kycVerifiedAt: true,
        },
      });

      logger.info('KYC approved', {
        userId,
        adminId: req.admin!.id,
        adminEmail: req.admin!.email,
        notes,
      });

      // TODO: Send email notification to user

      return res.status(200).json({
        success: true,
        data: updatedUser,
        message: 'KYC approved successfully',
      });
    } catch (error: any) {
      logger.error('Approve KYC error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'APPROVE_KYC_FAILED',
          message: 'Failed to approve KYC',
        },
      });
    }
  }

  /**
   * Reject KYC submission
   */
  async rejectKYC(req: AdminRequest, res: Response) {
    try {
      const { userId } = req.params;
      const { reason } = req.body;

      if (!reason) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_REASON',
            message: 'Rejection reason is required',
          },
        });
      }

      // Get user details
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
          },
        });
      }

      if (user.kycStatus !== 'PENDING') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_KYC_STATUS',
            message: `KYC status is ${user.kycStatus}, not PENDING`,
          },
        });
      }

      // Update user KYC status
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          kycStatus: 'REJECTED',
          kycRejectedAt: new Date(),
          kycRejectedBy: req.admin!.id,
          kycRejectionReason: reason,
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          kycStatus: true,
          kycRejectedAt: true,
          kycRejectionReason: true,
        },
      });

      logger.info('KYC rejected', {
        userId,
        adminId: req.admin!.id,
        adminEmail: req.admin!.email,
        reason,
      });

      // TODO: Send email notification to user with rejection reason

      return res.status(200).json({
        success: true,
        data: updatedUser,
        message: 'KYC rejected successfully',
      });
    } catch (error: any) {
      logger.error('Reject KYC error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'REJECT_KYC_FAILED',
          message: 'Failed to reject KYC',
        },
      });
    }
  }
}

export default new AdminKYCController();
