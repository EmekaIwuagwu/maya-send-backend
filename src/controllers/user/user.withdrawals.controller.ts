import { Response } from 'express';
import { UserRequest } from '../../middleware/user.middleware';
import { prisma } from '../../config/database';
import logger from '../../utils/logger';

class UserWithdrawalsController {
  /**
   * Request withdrawal
   */
  async requestWithdrawal(req: UserRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const { amount, solanaAddress } = req.body;

      // Validate inputs
      if (!amount || !solanaAddress) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_FIELDS',
            message: 'Amount and Solana address are required',
          },
        });
      }

      const amountNum = parseFloat(amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_AMOUNT',
            message: 'Amount must be a positive number',
          },
        });
      }

      // Get user
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

      // Check KYC status
      if (user.kycStatus !== 'VERIFIED') {
        return res.status(403).json({
          success: false,
          error: {
            code: 'KYC_REQUIRED',
            message: 'KYC verification is required for withdrawals',
          },
        });
      }

      // Check balance
      if (user.balance < amountNum) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_BALANCE',
            message: 'Insufficient balance',
          },
        });
      }

      // Create withdrawal request
      const withdrawal = await prisma.withdrawal.create({
        data: {
          userId,
          amount: amountNum,
          solanaAddress,
          status: 'PENDING',
        },
      });

      logger.info('Withdrawal requested', {
        withdrawalId: withdrawal.id,
        userId,
        amount: amountNum,
      });

      return res.status(201).json({
        success: true,
        data: withdrawal,
        message: 'Withdrawal request submitted successfully. Awaiting admin approval.',
      });
    } catch (error: any) {
      logger.error('Request withdrawal error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'REQUEST_WITHDRAWAL_FAILED',
          message: 'Failed to request withdrawal',
        },
      });
    }
  }

  /**
   * Get withdrawal history
   */
  async getWithdrawals(req: UserRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const { status, page = '1', limit = '50' } = req.query;

      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);
      const skip = (pageNum - 1) * limitNum;

      const where: any = { userId };
      if (status) where.status = status as string;

      const [withdrawals, total] = await Promise.all([
        prisma.withdrawal.findMany({
          where,
          orderBy: { createdAt: 'desc' },
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
          code: 'GET_WITHDRAWALS_FAILED',
          message: 'Failed to get withdrawals',
        },
      });
    }
  }
}

export default new UserWithdrawalsController();
