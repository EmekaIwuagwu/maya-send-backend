import { Response } from 'express';
import { AdminRequest } from '../../middleware/admin.middleware';
import { prisma } from '../../config/database';
import { EmailPaymentStatus } from '@prisma/client';
import logger from '../../utils/logger';

class AdminEmailPaymentsController {
  /**
   * Get email payments list with filtering and pagination
   */
  async getEmailPayments(req: AdminRequest, res: Response) {
    try {
      const {
        status,
        senderId,
        recipientEmail,
        minAmount,
        maxAmount,
        startDate,
        endDate,
        expired,
        page = '1',
        limit = '50',
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = req.query;

      const where: any = {};

      // Status and user filters
      if (status) where.status = status as EmailPaymentStatus;
      if (senderId) where.senderId = senderId as string;
      if (recipientEmail)
        where.recipientEmail = {
          contains: recipientEmail as string,
          mode: 'insensitive',
        };

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

      // Expired filter
      if (expired === 'true') {
        where.expiresAt = {
          lt: new Date(),
        };
        where.status = 'PENDING';
      }

      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);
      const skip = (pageNum - 1) * limitNum;

      const orderBy: any = {};
      orderBy[sortBy as string] = sortOrder as string;

      const [emailPayments, total] = await Promise.all([
        prisma.emailPayment.findMany({
          where,
          include: {
            sender: {
              select: {
                id: true,
                email: true,
                fullName: true,
              },
            },
            claimedBy: {
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
        prisma.emailPayment.count({ where }),
      ]);

      // Mark expired payments
      const now = new Date();
      const paymentsWithExpiry = emailPayments.map((payment) => ({
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
      logger.error('Get email payments error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_EMAIL_PAYMENTS_FAILED',
          message: 'Failed to fetch email payments',
        },
      });
    }
  }

  /**
   * Cancel email payment
   */
  async cancelEmailPayment(req: AdminRequest, res: Response) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      if (!reason) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_REASON',
            message: 'Cancellation reason is required',
          },
        });
      }

      // Get email payment details
      const emailPayment = await prisma.emailPayment.findUnique({
        where: { id },
      });

      if (!emailPayment) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'EMAIL_PAYMENT_NOT_FOUND',
            message: 'Email payment not found',
          },
        });
      }

      if (emailPayment.status !== 'PENDING') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PAYMENT_STATUS',
            message: `Email payment status is ${emailPayment.status}, not PENDING`,
          },
        });
      }

      // Cancel payment and refund sender
      const result = await prisma.$transaction(async (tx) => {
        // Update email payment status
        const updatedPayment = await tx.emailPayment.update({
          where: { id },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            cancellationReason: reason,
          },
        });

        // Refund sender
        await tx.user.update({
          where: { id: emailPayment.senderId },
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
        senderId: emailPayment.senderId,
        amount: emailPayment.amount,
        adminId: req.admin!.id,
        reason,
      });

      return res.status(200).json({
        success: true,
        data: result,
        message: 'Email payment cancelled and sender refunded',
      });
    } catch (error: any) {
      logger.error('Cancel email payment error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'CANCEL_EMAIL_PAYMENT_FAILED',
          message: 'Failed to cancel email payment',
        },
      });
    }
  }

  /**
   * Extend email payment expiry
   */
  async extendEmailPayment(req: AdminRequest, res: Response) {
    try {
      const { id } = req.params;
      const { days } = req.body;

      if (!days || days <= 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_DAYS',
            message: 'Days must be a positive number',
          },
        });
      }

      // Get email payment details
      const emailPayment = await prisma.emailPayment.findUnique({
        where: { id },
      });

      if (!emailPayment) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'EMAIL_PAYMENT_NOT_FOUND',
            message: 'Email payment not found',
          },
        });
      }

      if (emailPayment.status !== 'PENDING') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PAYMENT_STATUS',
            message: `Email payment status is ${emailPayment.status}, not PENDING`,
          },
        });
      }

      // Extend expiry date
      const daysNum = parseInt(days, 10);
      const newExpiryDate = new Date(emailPayment.expiresAt);
      newExpiryDate.setDate(newExpiryDate.getDate() + daysNum);

      const updatedPayment = await prisma.emailPayment.update({
        where: { id },
        data: {
          expiresAt: newExpiryDate,
        },
        include: {
          sender: {
            select: {
              id: true,
              email: true,
              fullName: true,
            },
          },
        },
      });

      logger.info('Email payment expiry extended', {
        emailPaymentId: id,
        oldExpiry: emailPayment.expiresAt,
        newExpiry: newExpiryDate,
        daysExtended: daysNum,
        adminId: req.admin!.id,
      });

      // TODO: Send email notification to recipient about extension

      return res.status(200).json({
        success: true,
        data: updatedPayment,
        message: `Email payment expiry extended by ${daysNum} days`,
      });
    } catch (error: any) {
      logger.error('Extend email payment error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'EXTEND_EMAIL_PAYMENT_FAILED',
          message: 'Failed to extend email payment',
        },
      });
    }
  }
}

export default new AdminEmailPaymentsController();
