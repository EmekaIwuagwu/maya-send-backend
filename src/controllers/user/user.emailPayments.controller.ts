import { Response } from 'express';
import { UserRequest } from '../../middleware/user.middleware';
import { prisma } from '../../config/database';
import logger from '../../utils/logger';
import crypto from 'crypto';

class UserEmailPaymentsController {
  /**
   * Send money via email
   */
  async sendViaEmail(req: UserRequest, res: Response) {
    try {
      const senderId = req.user!.id;
      const { recipientEmail, amount, message, expiryDays = 7, currency = 'USDC' } = req.body;

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

      // Check balance
      if (sender.balance < amountNum) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_BALANCE',
            message: 'Insufficient balance',
          },
        });
      }

      // Generate claim code
      const claimCode = crypto.randomBytes(16).toString('hex');

      // Calculate expiry date
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + (expiryDays || 7));

      // Create email payment in transaction
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

        // Create email payment
        const emailPayment = await tx.emailPayment.create({
          data: {
            senderId,
            recipientEmail: recipientEmail.toLowerCase(),
            amount: amountNum,
            currency,
            message: message || null,
            claimCode,
            expiresAt,
            status: 'PENDING',
          },
          include: {
            sender: {
              select: {
                email: true,
                fullName: true,
              },
            },
          },
        });

        return emailPayment;
      });

      logger.info('Email payment created', {
        emailPaymentId: result.id,
        senderId,
        recipientEmail,
        amount: amountNum,
      });

      // TODO: Send email to recipient with claim code

      return res.status(201).json({
        success: true,
        data: result,
        message: 'Email payment sent successfully',
      });
    } catch (error: any) {
      logger.error('Send via email error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'SEND_VIA_EMAIL_FAILED',
          message: 'Failed to send email payment',
        },
      });
    }
  }

  /**
   * Claim email payment
   */
  async claimPayment(req: UserRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const { claimCode } = req.body;

      if (!claimCode) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_CLAIM_CODE',
            message: 'Claim code is required',
          },
        });
      }

      // Get email payment
      const emailPayment = await prisma.emailPayment.findFirst({
        where: {
          claimCode,
          status: 'PENDING',
        },
      });

      if (!emailPayment) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'PAYMENT_NOT_FOUND',
            message: 'Email payment not found or already claimed',
          },
        });
      }

      // Check if expired
      if (emailPayment.expiresAt < new Date()) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'PAYMENT_EXPIRED',
            message: 'This email payment has expired',
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

      // Check if user email matches recipient email
      if (user.email !== emailPayment.recipientEmail) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'This payment is not for your email address',
          },
        });
      }

      // Claim payment in transaction
      const result = await prisma.$transaction(async (tx) => {
        // Update email payment status
        const updatedPayment = await tx.emailPayment.update({
          where: { id: emailPayment.id },
          data: {
            status: 'CLAIMED',
            claimedById: userId,
            claimedAt: new Date(),
          },
          include: {
            sender: {
              select: {
                email: true,
                fullName: true,
              },
            },
          },
        });

        // Add to user balance
        await tx.user.update({
          where: { id: userId },
          data: {
            balance: {
              increment: Number(emailPayment.amount),
            },
          },
        });

        // Create transaction record
        await tx.transaction.create({
          data: {
            senderId: emailPayment.senderId,
            recipientId: userId,
            amount: emailPayment.amount,
            currency: emailPayment.currency,
            transactionType: 'EMAIL_PAYMENT',
            status: 'COMPLETED',
            description: `Email payment claimed: ${emailPayment.message || ''}`,
            metadata: {
              emailPaymentId: emailPayment.id,
              claimCode: emailPayment.claimCode,
            },
          },
        });

        return updatedPayment;
      });

      logger.info('Email payment claimed', {
        emailPaymentId: result.id,
        claimedById: userId,
        amount: emailPayment.amount,
      });

      return res.status(200).json({
        success: true,
        data: result,
        message: 'Payment claimed successfully',
      });
    } catch (error: any) {
      logger.error('Claim payment error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'CLAIM_PAYMENT_FAILED',
          message: 'Failed to claim payment',
        },
      });
    }
  }

  /**
   * Get sent email payments
   */
  async getSentPayments(req: UserRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const { status, page = '1', limit = '50' } = req.query;

      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);
      const skip = (pageNum - 1) * limitNum;

      const where: any = { senderId: userId };
      if (status) where.status = status as string;

      const [payments, total] = await Promise.all([
        prisma.emailPayment.findMany({
          where,
          include: {
            claimedBy: {
              select: {
                email: true,
                fullName: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limitNum,
        }),
        prisma.emailPayment.count({ where }),
      ]);

      // Mark expired payments
      const now = new Date();
      const paymentsWithExpiry = payments.map((payment) => ({
        ...payment,
        isExpired: payment.expiresAt < now && payment.status === 'PENDING',
      }));

      return res.status(200).json({
        success: true,
        data: paymentsWithExpiry,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error: any) {
      logger.error('Get sent payments error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'GET_SENT_PAYMENTS_FAILED',
          message: 'Failed to get sent payments',
        },
      });
    }
  }

  /**
   * Cancel email payment
   */
  async cancelPayment(req: UserRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const { id } = req.params;

      // Get email payment
      const emailPayment = await prisma.emailPayment.findFirst({
        where: {
          id,
          senderId: userId,
        },
      });

      if (!emailPayment) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'PAYMENT_NOT_FOUND',
            message: 'Email payment not found',
          },
        });
      }

      if (emailPayment.status !== 'PENDING') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'PAYMENT_NOT_PENDING',
            message: 'Only pending payments can be cancelled',
          },
        });
      }

      // Cancel payment and refund sender
      const result = await prisma.$transaction(async (tx) => {
        // Update payment status
        const updatedPayment = await tx.emailPayment.update({
          where: { id },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
          },
        });

        // Refund sender
        await tx.user.update({
          where: { id: userId },
          data: {
            balance: {
              increment: Number(emailPayment.amount),
            },
          },
        });

        return updatedPayment;
      });

      logger.info('Email payment cancelled', {
        emailPaymentId: id,
        senderId: userId,
        amount: emailPayment.amount,
      });

      return res.status(200).json({
        success: true,
        data: result,
        message: 'Payment cancelled and refunded successfully',
      });
    } catch (error: any) {
      logger.error('Cancel payment error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'CANCEL_PAYMENT_FAILED',
          message: 'Failed to cancel payment',
        },
      });
    }
  }
}

export default new UserEmailPaymentsController();
