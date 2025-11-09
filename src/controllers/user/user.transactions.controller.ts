import { Response } from 'express';
import { UserRequest } from '../../middleware/user.middleware';
import { prisma } from '../../config/database';
import logger from '../../utils/logger';
import adminFraudService from '../../services/admin/admin.fraud.service';

class UserTransactionsController {
  /**
   * Send money to another user (P2P)
   */
  async sendMoney(req: UserRequest, res: Response) {
    try {
      const senderId = req.user!.id;
      const { recipientEmail, amount, description, currency = 'USDC' } = req.body;

      // Validate inputs
      if (!recipientEmail || !amount) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_FIELDS',
            message: 'Recipient email and amount are required',
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

      // Get sender
      const sender = await prisma.user.findUnique({
        where: { id: senderId },
      });

      if (!sender) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'SENDER_NOT_FOUND',
            message: 'Sender not found',
          },
        });
      }

      // Check if sender has sufficient balance
      if (sender.balance < amountNum) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_BALANCE',
            message: 'Insufficient balance',
          },
        });
      }

      // Get recipient
      const recipient = await prisma.user.findUnique({
        where: { email: recipientEmail.toLowerCase() },
      });

      if (!recipient) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'RECIPIENT_NOT_FOUND',
            message: 'Recipient not found',
          },
        });
      }

      // Check if recipient can receive money
      if (recipient.isSuspended || recipient.isDeleted) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'RECIPIENT_UNAVAILABLE',
            message: 'Recipient account is not available',
          },
        });
      }

      // Cannot send to self
      if (sender.id === recipient.id) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'CANNOT_SEND_TO_SELF',
            message: 'Cannot send money to yourself',
          },
        });
      }

      // Process transaction in database transaction
      const result = await prisma.$transaction(async (tx) => {
        // Deduct from sender
        await tx.user.update({
          where: { id: senderId },
          data: {
            balance: {
              decrement: amountNum,
            },
          },
        });

        // Add to recipient
        await tx.user.update({
          where: { id: recipient.id },
          data: {
            balance: {
              increment: amountNum,
            },
          },
        });

        // Create transaction record
        const transaction = await tx.transaction.create({
          data: {
            senderId,
            recipientId: recipient.id,
            amount: amountNum,
            currency,
            transactionType: 'P2P',
            status: 'COMPLETED',
            description: description || null,
          },
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
        });

        return transaction;
      });

      // Run fraud check (async, non-blocking)
      adminFraudService.checkTransaction(result.id).catch((error) => {
        logger.error('Fraud check error', { error: error.message, transactionId: result.id });
      });

      logger.info('P2P transaction completed', {
        transactionId: result.id,
        senderId,
        recipientId: recipient.id,
        amount: amountNum,
      });

      return res.status(201).json({
        success: true,
        data: result,
        message: 'Money sent successfully',
      });
    } catch (error: any) {
      logger.error('Send money error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'SEND_MONEY_FAILED',
          message: 'Failed to send money',
        },
      });
    }
  }

  /**
   * Get transaction history
   */
  async getTransactions(req: UserRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const { type, status, page = '1', limit = '50' } = req.query;

      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);
      const skip = (pageNum - 1) * limitNum;

      const where: any = {
        OR: [{ senderId: userId }, { recipientId: userId }],
      };

      if (type) where.transactionType = type as string;
      if (status) where.status = status as string;

      const [transactions, total] = await Promise.all([
        prisma.transaction.findMany({
          where,
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
          orderBy: { createdAt: 'desc' },
          skip,
          take: limitNum,
        }),
        prisma.transaction.count({ where }),
      ]);

      // Add direction field (sent/received)
      const transactionsWithDirection = transactions.map((tx) => ({
        ...tx,
        direction: tx.senderId === userId ? 'sent' : 'received',
      }));

      return res.status(200).json({
        success: true,
        data: transactionsWithDirection,
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
          code: 'GET_TRANSACTIONS_FAILED',
          message: 'Failed to get transactions',
        },
      });
    }
  }

  /**
   * Get transaction details
   */
  async getTransactionDetails(req: UserRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const { id } = req.params;

      const transaction = await prisma.transaction.findFirst({
        where: {
          id,
          OR: [{ senderId: userId }, { recipientId: userId }],
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
        data: {
          ...transaction,
          direction: transaction.senderId === userId ? 'sent' : 'received',
        },
      });
    } catch (error: any) {
      logger.error('Get transaction details error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'GET_TRANSACTION_FAILED',
          message: 'Failed to get transaction details',
        },
      });
    }
  }
}

export default new UserTransactionsController();
