import { Response } from 'express';
import { AdminRequest } from '../../middleware/admin.middleware';
import { prisma } from '../../config/database';
import { DisputeStatus } from '@prisma/client';
import logger from '../../utils/logger';

class AdminDisputesController {
  /**
   * Get disputes list with filtering and pagination
   */
  async getDisputes(req: AdminRequest, res: Response) {
    try {
      const {
        status,
        userId,
        transactionId,
        assignedTo,
        startDate,
        endDate,
        page = '1',
        limit = '50',
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = req.query;

      const where: any = {};

      // Status and assignment filters
      if (status) where.status = status as DisputeStatus;
      if (userId) where.userId = userId as string;
      if (transactionId) where.transactionId = transactionId as string;
      if (assignedTo) where.assignedTo = assignedTo as string;

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

      const [disputes, total] = await Promise.all([
        prisma.dispute.findMany({
          where,
          include: {
            user: {
              select: {
                id: true,
                email: true,
                fullName: true,
              },
            },
            transaction: {
              select: {
                id: true,
                amount: true,
                transactionType: true,
                status: true,
                sender: {
                  select: {
                    id: true,
                    email: true,
                    fullName: true,
                  },
                },
                recipient: {
                  select: {
                    id: true,
                    email: true,
                    fullName: true,
                  },
                },
              },
            },
            assignedAdmin: {
              select: {
                id: true,
                email: true,
                fullName: true,
              },
            },
          },
          orderBy,
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
          code: 'FETCH_DISPUTES_FAILED',
          message: 'Failed to fetch disputes',
        },
      });
    }
  }

  /**
   * Assign dispute to admin
   */
  async assignDispute(req: AdminRequest, res: Response) {
    try {
      const { id } = req.params;
      const { adminId } = req.body;

      // Use current admin if no adminId provided
      const assignTo = adminId || req.admin!.id;

      // Get dispute details
      const dispute = await prisma.dispute.findUnique({
        where: { id },
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

      if (dispute.status === 'RESOLVED' || dispute.status === 'CLOSED') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_DISPUTE_STATUS',
            message: 'Cannot assign a resolved or closed dispute',
          },
        });
      }

      // Update dispute assignment and status
      const updatedDispute = await prisma.dispute.update({
        where: { id },
        data: {
          assignedTo: assignTo,
          status: 'IN_PROGRESS',
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
            },
          },
          transaction: {
            select: {
              id: true,
              amount: true,
            },
          },
          assignedAdmin: {
            select: {
              id: true,
              email: true,
              fullName: true,
            },
          },
        },
      });

      logger.info('Dispute assigned', {
        disputeId: id,
        assignedTo: assignTo,
        assignedBy: req.admin!.id,
      });

      return res.status(200).json({
        success: true,
        data: updatedDispute,
        message: 'Dispute assigned successfully',
      });
    } catch (error: any) {
      logger.error('Assign dispute error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'ASSIGN_DISPUTE_FAILED',
          message: 'Failed to assign dispute',
        },
      });
    }
  }

  /**
   * Resolve dispute
   */
  async resolveDispute(req: AdminRequest, res: Response) {
    try {
      const { id } = req.params;
      const { resolution, refundAmount, notes } = req.body;

      if (!resolution) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_RESOLUTION',
            message: 'Resolution is required',
          },
        });
      }

      // Get dispute details with transaction
      const dispute = await prisma.dispute.findUnique({
        where: { id },
        include: {
          transaction: true,
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

      if (dispute.status === 'RESOLVED' || dispute.status === 'CLOSED') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'DISPUTE_ALREADY_RESOLVED',
            message: 'Dispute has already been resolved',
          },
        });
      }

      // Process refund if refundAmount is provided
      let refundTransactionId = null;
      if (refundAmount && refundAmount > 0) {
        const refundAmountNum = parseFloat(refundAmount);

        if (refundAmountNum > Number(dispute.transaction.amount)) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'INVALID_REFUND_AMOUNT',
              message: 'Refund amount cannot exceed transaction amount',
            },
          });
        }

        // Process refund in a transaction
        const refundResult = await prisma.$transaction(async (tx) => {
          // Return funds to sender
          await tx.user.update({
            where: { id: dispute.transaction.senderId },
            data: {
              balance: {
                increment: refundAmountNum,
              },
            },
          });

          // Deduct funds from recipient
          await tx.user.update({
            where: { id: dispute.transaction.recipientId },
            data: {
              balance: {
                decrement: refundAmountNum,
              },
            },
          });

          // Create refund transaction
          const refundTransaction = await tx.transaction.create({
            data: {
              senderId: dispute.transaction.recipientId,
              recipientId: dispute.transaction.senderId,
              amount: refundAmountNum,
              currency: dispute.transaction.currency,
              transactionType: 'REFUND',
              status: 'COMPLETED',
              description: `Dispute resolution refund for transaction ${dispute.transaction.id}`,
              metadata: {
                originalTransactionId: dispute.transaction.id,
                disputeId: dispute.id,
                processedBy: req.admin!.id,
              },
            },
          });

          return refundTransaction.id;
        });

        refundTransactionId = refundResult;
      }

      // Update dispute status
      const updatedDispute = await prisma.dispute.update({
        where: { id },
        data: {
          status: 'RESOLVED',
          resolution,
          resolvedAt: new Date(),
          resolvedBy: req.admin!.id,
          refundAmount: refundAmount ? parseFloat(refundAmount) : null,
          adminNotes: notes || null,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
            },
          },
          transaction: {
            select: {
              id: true,
              amount: true,
            },
          },
          assignedAdmin: {
            select: {
              id: true,
              email: true,
              fullName: true,
            },
          },
        },
      });

      logger.info('Dispute resolved', {
        disputeId: id,
        resolution,
        refundAmount: refundAmount || 0,
        refundTransactionId,
        resolvedBy: req.admin!.id,
      });

      // TODO: Send email notification to user with resolution

      return res.status(200).json({
        success: true,
        data: {
          dispute: updatedDispute,
          refundTransactionId,
        },
        message: 'Dispute resolved successfully',
      });
    } catch (error: any) {
      logger.error('Resolve dispute error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'RESOLVE_DISPUTE_FAILED',
          message: 'Failed to resolve dispute',
        },
      });
    }
  }
}

export default new AdminDisputesController();
