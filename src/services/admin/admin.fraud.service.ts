import { prisma } from '../../config/database';
import { FraudAlertStatus, FraudAlertSeverity } from '@prisma/client';
import logger from '../../utils/logger';

class AdminFraudService {
  /**
   * Check transaction against fraud rules
   */
  async checkTransaction(transaction: any) {
    const rules = await prisma.fraudRule.findMany({
      where: { isActive: true },
    });

    const alerts = [];

    for (const rule of rules) {
      const isTriggered = await this.evaluateRule(rule, transaction);

      if (isTriggered) {
        const alert = await prisma.fraudAlert.create({
          data: {
            transactionId: transaction.id,
            userId: transaction.senderId,
            ruleId: rule.id,
            alertType: rule.ruleType,
            severity: rule.severity,
            reason: rule.description || rule.name,
            details: {
              rule: rule.name,
              conditions: rule.conditions,
              transactionAmount: transaction.amount,
            },
          },
        });

        alerts.push(alert);

        logger.warn('Fraud alert created', {
          alertId: alert.id,
          transactionId: transaction.id,
          ruleType: rule.ruleType,
        });
      }
    }

    return alerts;
  }

  /**
   * Evaluate a fraud rule against a transaction
   */
  private async evaluateRule(rule: any, transaction: any): Promise<boolean> {
    const conditions = rule.conditions;

    switch (rule.ruleType) {
      case 'VELOCITY':
        return this.checkVelocity(conditions, transaction);
      case 'AMOUNT_THRESHOLD':
        return this.checkAmountThreshold(conditions, transaction);
      case 'GEOGRAPHIC_ANOMALY':
        return this.checkGeographicAnomaly(conditions, transaction);
      case 'NEW_USER_HIGH_AMOUNT':
        return this.checkNewUserHighAmount(conditions, transaction);
      default:
        return false;
    }
  }

  /**
   * Check transaction velocity
   */
  private async checkVelocity(conditions: any, transaction: any): Promise<boolean> {
    const timeWindow = conditions.timeWindowMinutes || 60;
    const maxTransactions = conditions.maxTransactions || 10;
    const startTime = new Date(Date.now() - timeWindow * 60 * 1000);

    const recentTransactions = await prisma.transaction.count({
      where: {
        senderId: transaction.senderId,
        createdAt: {
          gte: startTime,
        },
      },
    });

    return recentTransactions >= maxTransactions;
  }

  /**
   * Check amount threshold
   */
  private checkAmountThreshold(conditions: any, transaction: any): boolean {
    const threshold = conditions.threshold || 10000;
    return Number(transaction.amount) >= threshold;
  }

  /**
   * Check geographic anomaly
   */
  private async checkGeographicAnomaly(
    conditions: any,
    transaction: any
  ): Promise<boolean> {
    // Implementation would check if transaction is from unusual location
    // This would require IP geolocation data
    return false;
  }

  /**
   * Check new user with high amount transaction
   */
  private checkNewUserHighAmount(conditions: any, transaction: any): boolean {
    const accountAge = Date.now() - transaction.sender.createdAt.getTime();
    const maxAge = (conditions.maxAccountAgeDays || 7) * 24 * 60 * 60 * 1000;
    const minAmount = conditions.minAmount || 1000;

    return accountAge < maxAge && Number(transaction.amount) >= minAmount;
  }

  /**
   * Calculate risk score for user
   */
  async calculateUserRiskScore(userId: string): Promise<number> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        transactions: {
          where: {
            createdAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
            },
          },
        },
        disputes: {
          where: {
            status: {
              in: ['OPEN', 'IN_PROGRESS'],
            },
          },
        },
      },
    });

    if (!user) return 0;

    let score = 0;

    // Factor 1: Account age (newer = higher risk)
    const accountAgeDays =
      (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (accountAgeDays < 7) score += 20;
    else if (accountAgeDays < 30) score += 10;
    else if (accountAgeDays < 90) score += 5;

    // Factor 2: KYC status
    if (user.kycStatus === 'UNVERIFIED') score += 15;
    else if (user.kycStatus === 'PENDING') score += 10;

    // Factor 3: Transaction patterns
    const failedTxCount = user.transactions.filter((t) => t.status === 'FAILED').length;
    const flaggedTxCount = user.transactions.filter((t) => t.isFlagged).length;
    score += failedTxCount * 3;
    score += flaggedTxCount * 5;

    // Factor 4: Active disputes
    score += user.disputes.length * 10;

    // Factor 5: Previously flagged
    if (user.isFlagged) score += 15;

    // Factor 6: High velocity
    const txCount = user.transactions.length;
    if (txCount > 20) score += 10;
    if (txCount > 50) score += 15;

    // Cap score at 100
    return Math.min(score, 100);
  }

  /**
   * Get fraud statistics
   */
  async getFraudStats(period: '24h' | '7d' | '30d' = '30d') {
    const periodStart = this.getPeriodStart(period);

    const [
      totalAlerts,
      openAlerts,
      confirmedFraud,
      falsePositives,
      flaggedUsers,
      flaggedTransactions,
    ] = await Promise.all([
      prisma.fraudAlert.count({
        where: {
          createdAt: {
            gte: periodStart,
          },
        },
      }),
      prisma.fraudAlert.count({
        where: {
          status: 'OPEN',
          createdAt: {
            gte: periodStart,
          },
        },
      }),
      prisma.fraudAlert.count({
        where: {
          status: 'RESOLVED',
          createdAt: {
            gte: periodStart,
          },
          reviewNotes: {
            contains: 'confirmed_fraud',
          },
        },
      }),
      prisma.fraudAlert.count({
        where: {
          status: 'FALSE_POSITIVE',
          createdAt: {
            gte: periodStart,
          },
        },
      }),
      prisma.user.count({
        where: {
          isFlagged: true,
        },
      }),
      prisma.transaction.count({
        where: {
          isFlagged: true,
          reviewedAt: null,
        },
      }),
    ]);

    return {
      totalAlerts,
      openAlerts,
      confirmedFraud,
      falsePositives,
      flaggedUsers,
      flaggedTransactions,
      accuracy:
        totalAlerts > 0
          ? ((confirmedFraud / (confirmedFraud + falsePositives)) * 100).toFixed(2)
          : 0,
    };
  }

  private getPeriodStart(period: string): Date {
    const now = new Date();
    switch (period) {
      case '24h':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case '7d':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case '30d':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      default:
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
  }

  /**
   * Get fraud alerts with filtering
   */
  async getAlerts(params: {
    status?: FraudAlertStatus;
    severity?: FraudAlertSeverity;
    userId?: string;
    page?: number;
    limit?: number;
  }) {
    const page = params.page || 1;
    const limit = params.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.status) where.status = params.status;
    if (params.severity) where.severity = params.severity;
    if (params.userId) where.userId = params.userId;

    const [alerts, total] = await Promise.all([
      prisma.fraudAlert.findMany({
        where,
        include: {
          transaction: {
            select: {
              id: true,
              amount: true,
              createdAt: true,
              sender: {
                select: {
                  id: true,
                  email: true,
                  fullName: true,
                },
              },
            },
          },
          rule: {
            select: {
              id: true,
              name: true,
              ruleType: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      prisma.fraudAlert.count({ where }),
    ]);

    return {
      alerts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update fraud alert status
   */
  async updateAlertStatus(
    alertId: string,
    status: FraudAlertStatus,
    reviewedBy: string,
    reviewNotes?: string
  ) {
    const alert = await prisma.fraudAlert.update({
      where: { id: alertId },
      data: {
        status,
        reviewedBy,
        reviewedAt: new Date(),
        reviewNotes,
      },
    });

    logger.info('Fraud alert updated', {
      alertId,
      status,
      reviewedBy,
    });

    return alert;
  }

  /**
   * Create fraud rule
   */
  async createRule(data: {
    name: string;
    description?: string;
    ruleType: string;
    conditions: any;
    severity: FraudAlertSeverity;
  }) {
    const rule = await prisma.fraudRule.create({
      data: {
        name: data.name,
        description: data.description,
        ruleType: data.ruleType,
        conditions: data.conditions,
        severity: data.severity,
        isActive: true,
      },
    });

    logger.info('Fraud rule created', {
      ruleId: rule.id,
      name: data.name,
      ruleType: data.ruleType,
    });

    return rule;
  }

  /**
   * Update fraud rule
   */
  async updateRule(ruleId: string, data: any) {
    const rule = await prisma.fraudRule.update({
      where: { id: ruleId },
      data,
    });

    logger.info('Fraud rule updated', {
      ruleId,
      name: rule.name,
    });

    return rule;
  }

  /**
   * Delete fraud rule
   */
  async deleteRule(ruleId: string) {
    await prisma.fraudRule.delete({
      where: { id: ruleId },
    });

    logger.info('Fraud rule deleted', { ruleId });
  }

  /**
   * Get all fraud rules
   */
  async getRules(activeOnly: boolean = false) {
    const where = activeOnly ? { isActive: true } : {};

    const rules = await prisma.fraudRule.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
    });

    return rules;
  }
}

export default new AdminFraudService();
