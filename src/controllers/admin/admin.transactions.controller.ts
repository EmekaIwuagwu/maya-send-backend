import { Response } from 'express';
import { AdminRequest } from '../../middleware/admin.middleware';
import { prisma } from '../../config/database';
import { TransactionStatus, TransactionType } from '@prisma/client';
import logger from '../../utils/logger';

class AdminTransactionsController {
  /**
   * Get transactions list with filtering and pagination
   */
  async getTransactions(req: AdminRequest, res: Response) {
    try {
      const {
        status,
        transactionType,
        senderId,
        recipientId,
        minAmount,
        maxAmount,
        startDate,
        endDate,
        isFlagged,
        page = '1',
        limit = '50',
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = req.query;

      const where: any = {};

      // Status and type filters
      if (status) where.status = status as TransactionStatus;
      if (transactionType) where.transactionType = transactionType as TransactionType;
      if (senderId) where.senderId = senderId as string;
      if (recipientId) where.recipientId = recipientId as string;
      if (isFlagged !== undefined) where.isFlagged = isFlagged === 'true';

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

      const [transactions, total] = await Promise.all([
        prisma.transaction.findMany({
          where,
          include: {
            sender: {
              select: {
                id: true,
                email: true,
                fullName: true,
                kycStatus: true,
              },
            },
            recipient: {
              select: {
                id: true,
                email: true,
                fullName: true,
                kycStatus: true,
              },
            },
          },
          orderBy,
          skip,
          take: limitNum,
        }),
        prisma.transaction.count({ where }),
      ]);

      return res.status(200).json({
        success: true,
        data: transactions,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error: any) {
      logger.error('Get transactions error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_TRANSACTIONS_FAILED',
          message: 'Failed to fetch transactions',
        },
      });
    }
  }

  /**
   * Get detailed transaction information
   */
  async getTransactionDetails(req: AdminRequest, res: Response) {
    try {
      const { id } = req.params;

      const transaction = await prisma.transaction.findUnique({
        where: { id },
        include: {
          sender: {
            select: {
              id: true,
              email: true,
              fullName: true,
              kycStatus: true,
              isSuspended: true,
              isFlagged: true,
            },
          },
          recipient: {
            select: {
              id: true,
              email: true,
              fullName: true,
              kycStatus: true,
              isSuspended: true,
              isFlagged: true,
            },
          },
          fraudAlerts: {
            include: {
              rule: true,
            },
          },
        },
      });

      if (!transaction) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'TRANSACTION_NOT_FOUND',
            message: 'Transaction not found',
          },
        });
      }

      return res.status(200).json({
        success: true,
        data: transaction,
      });
    } catch (error: any) {
      logger.error('Get transaction details error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_TRANSACTION_FAILED',
          message: 'Failed to fetch transaction details',
        },
      });
    }
  }

  /**
   * Flag transaction as suspicious
   */
  async flagTransaction(req: AdminRequest, res: Response) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      if (!reason) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_REASON',
            message: 'Flag reason is required',
          },
        });
      }

      const transaction = await prisma.transaction.update({
        where: { id },
        data: {
          isFlagged: true,
          flagReason: reason,
        },
        include: {
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
      });

      logger.warn('Transaction flagged', {
        transactionId: id,
        adminId: req.admin!.id,
        reason,
        amount: transaction.amount,
        senderId: transaction.senderId,
        recipientId: transaction.recipientId,
      });

      return res.status(200).json({
        success: true,
        data: transaction,
        message: 'Transaction flagged successfully',
      });
    } catch (error: any) {
      logger.error('Flag transaction error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'FLAG_TRANSACTION_FAILED',
          message: 'Failed to flag transaction',
        },
      });
    }
  }

  /**
   * Process transaction refund
   */
  async refundTransaction(req: AdminRequest, res: Response) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      if (!reason) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_REASON',
            message: 'Refund reason is required',
          },
        });
      }

      // Get transaction details
      const transaction = await prisma.transaction.findUnique({
        where: { id },
        include: {
          sender: true,
          recipient: true,
        },
      });

      if (!transaction) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'TRANSACTION_NOT_FOUND',
            message: 'Transaction not found',
          },
        });
      }

      // Validate transaction can be refunded
      if (transaction.status !== 'COMPLETED') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_TRANSACTION_STATUS',
            message: 'Only completed transactions can be refunded',
          },
        });
      }

      if (transaction.isRefunded) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'ALREADY_REFUNDED',
            message: 'Transaction has already been refunded',
          },
        });
      }

      // Process refund in a transaction
      const result = await prisma.$transaction(async (tx) => {
        // Update original transaction
        const updatedTransaction = await tx.transaction.update({
          where: { id },
          data: {
            isRefunded: true,
            refundReason: reason,
            refundedAt: new Date(),
            refundedBy: req.admin!.id,
          },
        });

        // Return funds to sender
        await tx.user.update({
          where: { id: transaction.senderId },
          data: {
            balance: {
              increment: Number(transaction.amount),
            },
          },
        });

        // Deduct funds from recipient
        await tx.user.update({
          where: { id: transaction.recipientId },
          data: {
            balance: {
              decrement: Number(transaction.amount),
            },
          },
        });

        // Create refund transaction record
        const refundTransaction = await tx.transaction.create({
          data: {
            senderId: transaction.recipientId,
            recipientId: transaction.senderId,
            amount: transaction.amount,
            currency: transaction.currency,
            transactionType: 'REFUND',
            status: 'COMPLETED',
            description: `Refund for transaction ${transaction.id}: ${reason}`,
            metadata: {
              originalTransactionId: transaction.id,
              refundReason: reason,
              processedBy: req.admin!.id,
            },
          },
        });

        return {
          originalTransaction: updatedTransaction,
          refundTransaction,
        };
      });

      logger.warn('Transaction refunded', {
        transactionId: id,
        adminId: req.admin!.id,
        reason,
        amount: transaction.amount,
        senderId: transaction.senderId,
        recipientId: transaction.recipientId,
        refundTransactionId: result.refundTransaction.id,
      });

      return res.status(200).json({
        success: true,
        data: result,
        message: 'Transaction refunded successfully',
      });
    } catch (error: any) {
      logger.error('Refund transaction error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'REFUND_FAILED',
          message: 'Failed to process refund',
        },
      });
    }
  }
}

export default new AdminTransactionsController();
