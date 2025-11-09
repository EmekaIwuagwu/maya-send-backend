import { Response } from 'express';
import { UserRequest } from '../../middleware/user.middleware';
import { prisma } from '../../config/database';
import logger from '../../utils/logger';

class UserDisputesController {
  /**
   * File a dispute
   */
  async fileDispute(req: UserRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const { transactionId, reason, description } = req.body;

      // Validate inputs
      if (!transactionId || !reason || !description) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_FIELDS',
            message: 'Transaction ID, reason, and description are required',
          },
        });
      }

      // Get transaction
      const transaction = await prisma.transaction.findFirst({
        where: {
          id: transactionId,
          OR: [{ senderId: userId }, { recipientId: userId }],
        },
      });

      if (!transaction) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'TRANSACTION_NOT_FOUND',
            message: 'Transaction not found or you are not authorized',
          },
        });
      }

      // Check if dispute already exists for this transaction
      const existingDispute = await prisma.dispute.findFirst({
        where: {
          transactionId,
          userId,
        },
      });

      if (existingDispute) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'DISPUTE_EXISTS',
            message: 'A dispute already exists for this transaction',
          },
        });
      }

      // Create dispute
      const dispute = await prisma.dispute.create({
        data: {
          userId,
          transactionId,
          reason,
          description,
          status: 'OPEN',
        },
        include: {
          transaction: {
            select: {
              id: true,
              amount: true,
              transactionType: true,
              createdAt: true,
            },
          },
        },
      });

      logger.info('Dispute filed', {
        disputeId: dispute.id,
        userId,
        transactionId,
      });

      return res.status(201).json({
        success: true,
        data: dispute,
        message: 'Dispute filed successfully. Our team will review it shortly.',
      });
    } catch (error: any) {
      logger.error('File dispute error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'FILE_DISPUTE_FAILED',
          message: 'Failed to file dispute',
        },
      });
    }
  }

  /**
   * Get user's disputes
   */
  async getDisputes(req: UserRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const { status, page = '1', limit = '50' } = req.query;

      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);
      const skip = (pageNum - 1) * limitNum;

      const where: any = { userId };
      if (status) where.status = status as string;

      const [disputes, total] = await Promise.all([
        prisma.dispute.findMany({
          where,
          include: {
            transaction: {
              select: {
                id: true,
                amount: true,
                transactionType: true,
                createdAt: true,
              },
            },
            assignedAdmin: {
              select: {
                fullName: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limitNum,
        }),
        prisma.dispute.count({ where }),
      ]);

      return res.status(200).json({
        success: true,
        data: disputes,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error: any) {
      logger.error('Get disputes error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'GET_DISPUTES_FAILED',
          message: 'Failed to get disputes',
        },
      });
    }
  }

  /**
   * Get dispute details
   */
  async getDisputeDetails(req: UserRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const { id } = req.params;

      const dispute = await prisma.dispute.findFirst({
        where: {
          id,
          userId,
        },
        include: {
          transaction: {
            include: {
              sender: {
                select: {
                  email: true,
                  fullName: true,
                },
              },
              recipient: {
                select: {
                  email: true,
                  fullName: true,
                },
              },
            },
          },
          assignedAdmin: {
            select: {
              fullName: true,
              email: true,
            },
          },
        },
      });

      if (!dispute) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'DISPUTE_NOT_FOUND',
            message: 'Dispute not found',
          },
        });
      }

      return res.status(200).json({
        success: true,
        data: dispute,
      });
    } catch (error: any) {
      logger.error('Get dispute details error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'GET_DISPUTE_FAILED',
          message: 'Failed to get dispute details',
        },
      });
    }
  }
}

export default new UserDisputesController();
