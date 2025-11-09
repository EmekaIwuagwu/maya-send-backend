import { Response } from 'express';
import { AdminRequest } from '../../middleware/admin.middleware';
import { prisma } from '../../config/database';
import { WithdrawalStatus } from '@prisma/client';
import logger from '../../utils/logger';

class AdminWithdrawalsController {
  /**
   * Get withdrawals list with filtering and pagination
   */
  async getWithdrawals(req: AdminRequest, res: Response) {
    try {
      const {
        status,
        userId,
        minAmount,
        maxAmount,
        startDate,
        endDate,
        page = '1',
        limit = '50',
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = req.query;

      const where: any = {};

      // Status filter
      if (status) where.status = status as WithdrawalStatus;
      if (userId) where.userId = userId as string;

      // Amount filters
      if (minAmount || maxAmount) {
        where.amount = {};
        if (minAmount) where.amount.gte = parseFloat(minAmount as string);
        if (maxAmount) where.amount.lte = parseFloat(maxAmount as string);
      }

      // Date filters
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate as string);
        if (endDate) where.createdAt.lte = new Date(endDate as string);
      }

      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);
      const skip = (pageNum - 1) * limitNum;

      const orderBy: any = {};
      orderBy[sortBy as string] = sortOrder as string;

      const [withdrawals, total] = await Promise.all([
        prisma.withdrawal.findMany({
          where,
          include: {
            user: {
              select: {
                id: true,
                email: true,
                fullName: true,
                kycStatus: true,
                isSuspended: true,
              },
            },
          },
          orderBy,
          skip,
          take: limitNum,
        }),
        prisma.withdrawal.count({ where }),
      ]);

      return res.status(200).json({
        success: true,
        data: withdrawals,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error: any) {
      logger.error('Get withdrawals error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_WITHDRAWALS_FAILED',
          message: 'Failed to fetch withdrawals',
        },
      });
    }
  }

  /**
   * Approve withdrawal request
   */
  async approveWithdrawal(req: AdminRequest, res: Response) {
    try {
      const { id } = req.params;
      const { notes } = req.body;

      // Get withdrawal details
      const withdrawal = await prisma.withdrawal.findUnique({
        where: { id },
        include: {
          user: true,
        },
      });

      if (!withdrawal) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'WITHDRAWAL_NOT_FOUND',
            message: 'Withdrawal request not found',
          },
        });
      }

      if (withdrawal.status !== 'PENDING') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_WITHDRAWAL_STATUS',
            message: `Withdrawal status is ${withdrawal.status}, not PENDING`,
          },
        });
      }

      // Check if user has sufficient balance
      if (withdrawal.user.balance < withdrawal.amount) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_BALANCE',
            message: 'User has insufficient balance',
          },
        });
      }

      // Process withdrawal
      const result = await prisma.$transaction(async (tx) => {
        // Update withdrawal status
        const updatedWithdrawal = await tx.withdrawal.update({
          where: { id },
          data: {
            status: 'APPROVED',
            processedAt: new Date(),
            processedBy: req.admin!.id,
            adminNotes: notes || null,
          },
        });

        // Deduct amount from user balance
        await tx.user.update({
          where: { id: withdrawal.userId },
          data: {
            balance: {
              decrement: Number(withdrawal.amount),
            },
          },
        });

        return updatedWithdrawal;
      });

      logger.info('Withdrawal approved', {
        withdrawalId: id,
        userId: withdrawal.userId,
        amount: withdrawal.amount,
        adminId: req.admin!.id,
        notes,
      });

      // TODO: Process actual blockchain withdrawal
      // TODO: Send email notification to user

      return res.status(200).json({
        success: true,
        data: result,
        message: 'Withdrawal approved successfully',
      });
    } catch (error: any) {
      logger.error('Approve withdrawal error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'APPROVE_WITHDRAWAL_FAILED',
          message: 'Failed to approve withdrawal',
        },
      });
    }
  }

  /**
   * Reject withdrawal request
   */
  async rejectWithdrawal(req: AdminRequest, res: Response) {
    try {
      const { id } = req.params;
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

      // Get withdrawal details
      const withdrawal = await prisma.withdrawal.findUnique({
        where: { id },
      });

      if (!withdrawal) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'WITHDRAWAL_NOT_FOUND',
            message: 'Withdrawal request not found',
          },
        });
      }

      if (withdrawal.status !== 'PENDING') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_WITHDRAWAL_STATUS',
            message: `Withdrawal status is ${withdrawal.status}, not PENDING`,
          },
        });
      }

      // Update withdrawal status
      const updatedWithdrawal = await prisma.withdrawal.update({
        where: { id },
        data: {
          status: 'REJECTED',
          processedAt: new Date(),
          processedBy: req.admin!.id,
          rejectionReason: reason,
        },
      });

      logger.info('Withdrawal rejected', {
        withdrawalId: id,
        userId: withdrawal.userId,
        amount: withdrawal.amount,
        adminId: req.admin!.id,
        reason,
      });

      // TODO: Send email notification to user with rejection reason

      return res.status(200).json({
        success: true,
        data: updatedWithdrawal,
        message: 'Withdrawal rejected successfully',
      });
    } catch (error: any) {
      logger.error('Reject withdrawal error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'REJECT_WITHDRAWAL_FAILED',
          message: 'Failed to reject withdrawal',
        },
      });
    }
  }
}

export default new AdminWithdrawalsController();
