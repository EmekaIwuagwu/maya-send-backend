import { Response } from 'express';
import { UserRequest } from '../../middleware/user.middleware';
import { prisma } from '../../config/database';
import logger from '../../utils/logger';

class UserDashboardController {
  /**
   * Get user dashboard overview
   */
  async getOverview(req: UserRequest, res: Response) {
    try {
      const userId = req.user!.id;

      // Get user with balance and counts
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          balance: true,
          kycStatus: true,
          _count: {
            select: {
              sentTransactions: true,
              receivedTransactions: true,
              disputes: true,
            },
          },
        },
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

      // Get recent transactions (last 10)
      const recentTransactions = await prisma.transaction.findMany({
        where: {
          OR: [{ senderId: userId }, { recipientId: userId }],
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
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      // Get pending email payments sent
      const pendingEmailPayments = await prisma.emailPayment.count({
        where: {
          senderId: userId,
          status: 'PENDING',
        },
      });

      // Get pending withdrawals
      const pendingWithdrawals = await prisma.withdrawal.count({
        where: {
          userId,
          status: 'PENDING',
        },
      });

      // Get open disputes
      const openDisputes = await prisma.dispute.count({
        where: {
          userId,
          status: {
            in: ['OPEN', 'IN_PROGRESS'],
          },
        },
      });

      // Calculate total sent and received in last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [totalSent, totalReceived] = await Promise.all([
        prisma.transaction.aggregate({
          where: {
            senderId: userId,
            status: 'COMPLETED',
            createdAt: {
              gte: thirtyDaysAgo,
            },
          },
          _sum: {
            amount: true,
          },
        }),
        prisma.transaction.aggregate({
          where: {
            recipientId: userId,
            status: 'COMPLETED',
            createdAt: {
              gte: thirtyDaysAgo,
            },
          },
          _sum: {
            amount: true,
          },
        }),
      ]);

      return res.status(200).json({
        success: true,
        data: {
          balance: user.balance,
          kycStatus: user.kycStatus,
          statistics: {
            totalTransactionsSent: user._count.sentTransactions,
            totalTransactionsReceived: user._count.receivedTransactions,
            totalDisputes: user._count.disputes,
            pendingEmailPayments,
            pendingWithdrawals,
            openDisputes,
          },
          last30Days: {
            totalSent: Number(totalSent._sum.amount || 0),
            totalReceived: Number(totalReceived._sum.amount || 0),
          },
          recentTransactions: recentTransactions.map((tx) => ({
            ...tx,
            direction: tx.senderId === userId ? 'sent' : 'received',
          })),
        },
      });
    } catch (error: any) {
      logger.error('Get dashboard overview error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'GET_DASHBOARD_FAILED',
          message: 'Failed to get dashboard overview',
        },
      });
    }
  }

  /**
   * Get user statistics
   */
  async getStatistics(req: UserRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const { period = '30d' } = req.query;

      // Calculate date range
      const now = new Date();
      let startDate: Date;

      switch (period) {
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }

      // Get transactions in period
      const transactions = await prisma.transaction.findMany({
        where: {
          OR: [{ senderId: userId }, { recipientId: userId }],
          createdAt: {
            gte: startDate,
          },
        },
        select: {
          id: true,
          amount: true,
          status: true,
          transactionType: true,
          senderId: true,
          recipientId: true,
          createdAt: true,
        },
      });

      // Group by day
      const transactionsByDay = transactions.reduce((acc: any, tx) => {
        const date = tx.createdAt.toISOString().split('T')[0];
        if (!acc[date]) {
          acc[date] = {
            sent: 0,
            received: 0,
            sentAmount: 0,
            receivedAmount: 0,
          };
        }

        const amount = Number(tx.amount);
        if (tx.senderId === userId && tx.status === 'COMPLETED') {
          acc[date].sent += 1;
          acc[date].sentAmount += amount;
        } else if (tx.recipientId === userId && tx.status === 'COMPLETED') {
          acc[date].received += 1;
          acc[date].receivedAmount += amount;
        }

        return acc;
      }, {});

      // Calculate totals
      const totals = {
        sent: 0,
        received: 0,
        sentAmount: 0,
        receivedAmount: 0,
        completed: 0,
        pending: 0,
        failed: 0,
      };

      transactions.forEach((tx) => {
        if (tx.status === 'COMPLETED') totals.completed += 1;
        else if (tx.status === 'PENDING') totals.pending += 1;
        else if (tx.status === 'FAILED') totals.failed += 1;

        const amount = Number(tx.amount);
        if (tx.senderId === userId && tx.status === 'COMPLETED') {
          totals.sent += 1;
          totals.sentAmount += amount;
        } else if (tx.recipientId === userId && tx.status === 'COMPLETED') {
          totals.received += 1;
          totals.receivedAmount += amount;
        }
      });

      return res.status(200).json({
        success: true,
        data: {
          period,
          startDate,
          endDate: now,
          totals,
          transactionsByDay,
        },
      });
    } catch (error: any) {
      logger.error('Get statistics error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'GET_STATISTICS_FAILED',
          message: 'Failed to get statistics',
        },
      });
    }
  }
}

export default new UserDashboardController();
