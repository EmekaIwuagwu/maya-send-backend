import { Response } from 'express';
import { AdminRequest } from '../../middleware/admin.middleware';
import { prisma } from '../../config/database';
import logger from '../../utils/logger';

class AdminAnalyticsController {
  /**
   * Get user analytics
   */
  async getUserAnalytics(req: AdminRequest, res: Response) {
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

      // Get user statistics
      const [
        totalUsers,
        newUsers,
        activeUsers,
        verifiedUsers,
        suspendedUsers,
        kycBreakdown,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({
          where: {
            createdAt: {
              gte: startDate,
            },
          },
        }),
        prisma.user.count({
          where: {
            lastLoginAt: {
              gte: startDate,
            },
          },
        }),
        prisma.user.count({
          where: {
            kycStatus: 'VERIFIED',
          },
        }),
        prisma.user.count({
          where: {
            isSuspended: true,
          },
        }),
        prisma.user.groupBy({
          by: ['kycStatus'],
          _count: true,
        }),
      ]);

      // Get user growth over time
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

      // Group users by day for chart data
      const userGrowth = users.reduce((acc: any, user) => {
        const date = user.createdAt.toISOString().split('T')[0];
        acc[date] = (acc[date] || 0) + 1;
        return acc;
      }, {});

      return res.status(200).json({
        success: true,
        data: {
          period,
          startDate,
          endDate: now,
          summary: {
            totalUsers,
            newUsers,
            activeUsers,
            verifiedUsers,
            suspendedUsers,
          },
          kycBreakdown: kycBreakdown.reduce((acc: any, item) => {
            acc[item.kycStatus] = item._count;
            return acc;
          }, {}),
          userGrowth,
        },
      });
    } catch (error: any) {
      logger.error('Get user analytics error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_USER_ANALYTICS_FAILED',
          message: 'Failed to fetch user analytics',
        },
      });
    }
  }

  /**
   * Get transaction analytics
   */
  async getTransactionAnalytics(req: AdminRequest, res: Response) {
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

      // Get transaction statistics
      const [
        totalTransactions,
        newTransactions,
        statusBreakdown,
        typeBreakdown,
        totalVolume,
        averageTransaction,
      ] = await Promise.all([
        prisma.transaction.count(),
        prisma.transaction.count({
          where: {
            createdAt: {
              gte: startDate,
            },
          },
        }),
        prisma.transaction.groupBy({
          by: ['status'],
          where: {
            createdAt: {
              gte: startDate,
            },
          },
          _count: true,
        }),
        prisma.transaction.groupBy({
          by: ['transactionType'],
          where: {
            createdAt: {
              gte: startDate,
            },
          },
          _count: true,
        }),
        prisma.transaction.aggregate({
          where: {
            createdAt: {
              gte: startDate,
            },
            status: 'COMPLETED',
          },
          _sum: {
            amount: true,
          },
        }),
        prisma.transaction.aggregate({
          where: {
            createdAt: {
              gte: startDate,
            },
            status: 'COMPLETED',
          },
          _avg: {
            amount: true,
          },
        }),
      ]);

      // Get transactions over time for chart
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

      // Group by day
      const transactionsByDay = transactions.reduce((acc: any, tx) => {
        const date = tx.createdAt.toISOString().split('T')[0];
        if (!acc[date]) {
          acc[date] = {
            count: 0,
            volume: 0,
            completed: 0,
            pending: 0,
            failed: 0,
          };
        }
        acc[date].count += 1;
        if (tx.status === 'COMPLETED') {
          acc[date].volume += Number(tx.amount);
          acc[date].completed += 1;
        } else if (tx.status === 'PENDING') {
          acc[date].pending += 1;
        } else if (tx.status === 'FAILED') {
          acc[date].failed += 1;
        }
        return acc;
      }, {});

      return res.status(200).json({
        success: true,
        data: {
          period,
          startDate,
          endDate: now,
          summary: {
            totalTransactions,
            newTransactions,
            totalVolume: Number(totalVolume._sum.amount || 0),
            averageTransaction: Number(averageTransaction._avg.amount || 0),
          },
          statusBreakdown: statusBreakdown.reduce((acc: any, item) => {
            acc[item.status] = item._count;
            return acc;
          }, {}),
          typeBreakdown: typeBreakdown.reduce((acc: any, item) => {
            acc[item.transactionType] = item._count;
            return acc;
          }, {}),
          transactionsByDay,
        },
      });
    } catch (error: any) {
      logger.error('Get transaction analytics error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_TRANSACTION_ANALYTICS_FAILED',
          message: 'Failed to fetch transaction analytics',
        },
      });
    }
  }

  /**
   * Get revenue analytics
   */
  async getRevenueAnalytics(req: AdminRequest, res: Response) {
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

      // Get fee revenue from completed transactions
      // Assuming a 1% platform fee (this should come from settings)
      const FEE_PERCENTAGE = 0.01;

      const [transactionVolume, withdrawalVolume] = await Promise.all([
        prisma.transaction.aggregate({
          where: {
            createdAt: {
              gte: startDate,
            },
            status: 'COMPLETED',
          },
          _sum: {
            amount: true,
          },
          _count: true,
        }),
        prisma.withdrawal.aggregate({
          where: {
            createdAt: {
              gte: startDate,
            },
            status: 'APPROVED',
          },
          _sum: {
            amount: true,
          },
          _count: true,
        }),
      ]);

      const totalVolume = Number(transactionVolume._sum.amount || 0);
      const estimatedRevenue = totalVolume * FEE_PERCENTAGE;

      // Get daily revenue breakdown
      const transactions = await prisma.transaction.findMany({
        where: {
          createdAt: {
            gte: startDate,
          },
          status: 'COMPLETED',
        },
        select: {
          createdAt: true,
          amount: true,
        },
      });

      const revenueByDay = transactions.reduce((acc: any, tx) => {
        const date = tx.createdAt.toISOString().split('T')[0];
        if (!acc[date]) {
          acc[date] = {
            volume: 0,
            revenue: 0,
            transactions: 0,
          };
        }
        const amount = Number(tx.amount);
        acc[date].volume += amount;
        acc[date].revenue += amount * FEE_PERCENTAGE;
        acc[date].transactions += 1;
        return acc;
      }, {});

      return res.status(200).json({
        success: true,
        data: {
          period,
          startDate,
          endDate: now,
          summary: {
            totalVolume,
            estimatedRevenue,
            feePercentage: FEE_PERCENTAGE * 100,
            transactionCount: transactionVolume._count,
            withdrawalCount: withdrawalVolume._count,
            withdrawalVolume: Number(withdrawalVolume._sum.amount || 0),
          },
          revenueByDay,
        },
      });
    } catch (error: any) {
      logger.error('Get revenue analytics error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_REVENUE_ANALYTICS_FAILED',
          message: 'Failed to fetch revenue analytics',
        },
      });
    }
  }
}

export default new AdminAnalyticsController();
