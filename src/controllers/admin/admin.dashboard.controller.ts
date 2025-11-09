import { Response } from 'express';
import { AdminRequest } from '../../middleware/admin.middleware';
import { prisma } from '../../config/database';
import logger from '../../utils/logger';

class AdminDashboardController {
  /**
   * Get dashboard overview statistics
   */
  async getOverview(req: AdminRequest, res: Response) {
    try {
      const now = new Date();
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Get comprehensive statistics
      const [
        // User stats
        totalUsers,
        newUsersToday,
        newUsersWeek,
        verifiedUsers,
        pendingKYC,
        suspendedUsers,
        flaggedUsers,

        // Transaction stats
        totalTransactions,
        transactionsToday,
        transactionsWeek,
        completedTransactions,
        pendingTransactions,
        failedTransactions,

        // Email payment stats
        totalEmailPayments,
        pendingEmailPayments,
        claimedEmailPayments,

        // Escrow stats
        totalEscrows,
        activeEscrows,

        // Withdrawal stats
        totalWithdrawals,
        pendingWithdrawals,

        // Dispute stats
        totalDisputes,
        openDisputes,

        // Fraud stats
        totalFraudAlerts,
        openFraudAlerts,
      ] = await Promise.all([
        // Users
        prisma.user.count(),
        prisma.user.count({ where: { createdAt: { gte: last24h } } }),
        prisma.user.count({ where: { createdAt: { gte: last7d } } }),
        prisma.user.count({ where: { kycStatus: 'VERIFIED' } }),
        prisma.user.count({ where: { kycStatus: 'PENDING' } }),
        prisma.user.count({ where: { isSuspended: true } }),
        prisma.user.count({ where: { isFlagged: true } }),

        // Transactions
        prisma.transaction.count(),
        prisma.transaction.count({ where: { createdAt: { gte: last24h } } }),
        prisma.transaction.count({ where: { createdAt: { gte: last7d } } }),
        prisma.transaction.count({ where: { status: 'COMPLETED' } }),
        prisma.transaction.count({ where: { status: 'PENDING' } }),
        prisma.transaction.count({ where: { status: 'FAILED' } }),

        // Email Payments
        prisma.emailPayment.count(),
        prisma.emailPayment.count({ where: { status: 'PENDING' } }),
        prisma.emailPayment.count({ where: { status: 'CLAIMED' } }),

        // Escrows
        prisma.escrow.count(),
        prisma.escrow.count({ where: { status: { in: ['PENDING', 'FUNDED'] } } }),

        // Withdrawals
        prisma.withdrawal.count(),
        prisma.withdrawal.count({ where: { status: 'PENDING' } }),

        // Disputes
        prisma.dispute.count(),
        prisma.dispute.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),

        // Fraud
        prisma.fraudAlert.count(),
        prisma.fraudAlert.count({ where: { status: 'OPEN' } }),
      ]);

      // Calculate transaction volume
      const transactionVolume = await prisma.transaction.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { amount: true },
      });

      const volumeToday = await prisma.transaction.aggregate({
        where: {
          status: 'COMPLETED',
          createdAt: { gte: last24h },
        },
        _sum: { amount: true },
      });

      const volumeWeek = await prisma.transaction.aggregate({
        where: {
          status: 'COMPLETED',
          createdAt: { gte: last7d },
        },
        _sum: { amount: true },
      });

      // Get recent activity
      const recentTransactions = await prisma.transaction.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          amount: true,
          status: true,
          transactionType: true,
          createdAt: true,
          sender: { select: { email: true, fullName: true } },
          recipient: { select: { email: true, fullName: true } },
        },
      });

      return res.status(200).json({
        success: true,
        data: {
          users: {
            total: totalUsers,
            newToday: newUsersToday,
            newThisWeek: newUsersWeek,
            verified: verifiedUsers,
            pendingKYC,
            suspended: suspendedUsers,
            flagged: flaggedUsers,
          },
          transactions: {
            total: totalTransactions,
            today: transactionsToday,
            thisWeek: transactionsWeek,
            completed: completedTransactions,
            pending: pendingTransactions,
            failed: failedTransactions,
            volume: {
              total: Number(transactionVolume._sum.amount || 0),
              today: Number(volumeToday._sum.amount || 0),
              thisWeek: Number(volumeWeek._sum.amount || 0),
            },
          },
          emailPayments: {
            total: totalEmailPayments,
            pending: pendingEmailPayments,
            claimed: claimedEmailPayments,
          },
          escrows: {
            total: totalEscrows,
            active: activeEscrows,
          },
          withdrawals: {
            total: totalWithdrawals,
            pending: pendingWithdrawals,
          },
          disputes: {
            total: totalDisputes,
            open: openDisputes,
          },
          fraud: {
            totalAlerts: totalFraudAlerts,
            openAlerts: openFraudAlerts,
          },
          recentActivity: recentTransactions,
        },
      });
    } catch (error: any) {
      logger.error('Get dashboard overview error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'DASHBOARD_FETCH_FAILED',
          message: 'Failed to fetch dashboard overview',
        },
      });
    }
  }

  /**
   * Get analytics data
   */
  async getAnalytics(req: AdminRequest, res: Response) {
    try {
      const { period = '30d' } = req.query;

      // Calculate date range
      const now = new Date();
      let startDate: Date;

      switch (period) {
        case '24h':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
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

      // Get time-series data for charts
      const transactions = await prisma.transaction.findMany({
        where: {
          createdAt: {
            gte: startDate,
          },
        },
        select: {
          createdAt: true,
          amount: true,
          status: true,
        },
      });

      const users = await prisma.user.findMany({
        where: {
          createdAt: {
            gte: startDate,
          },
        },
        select: {
          createdAt: true,
        },
      });

      return res.status(200).json({
        success: true,
        data: {
          period,
          startDate,
          endDate: now,
          transactions: {
            count: transactions.length,
            byStatus: {
              completed: transactions.filter((t) => t.status === 'COMPLETED').length,
              pending: transactions.filter((t) => t.status === 'PENDING').length,
              failed: transactions.filter((t) => t.status === 'FAILED').length,
            },
            totalVolume: transactions
              .filter((t) => t.status === 'COMPLETED')
              .reduce((sum, t) => sum + Number(t.amount), 0),
          },
          users: {
            newSignups: users.length,
          },
        },
      });
    } catch (error: any) {
      logger.error('Get analytics error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'ANALYTICS_FETCH_FAILED',
          message: 'Failed to fetch analytics data',
        },
      });
    }
  }
}

export default new AdminDashboardController();
