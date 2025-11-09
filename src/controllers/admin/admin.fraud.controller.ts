import { Response } from 'express';
import { AdminRequest } from '../../middleware/admin.middleware';
import adminFraudService from '../../services/admin/admin.fraud.service';
import { FraudAlertStatus, FraudAlertSeverity } from '@prisma/client';
import logger from '../../utils/logger';

class AdminFraudController {
  /**
   * Get fraud alerts
   */
  async getAlerts(req: AdminRequest, res: Response) {
    try {
      const {
        status,
        severity,
        userId,
        page = '1',
        limit = '50',
      } = req.query;

      const result = await adminFraudService.getAlerts({
        status: status as FraudAlertStatus | undefined,
        severity: severity as FraudAlertSeverity | undefined,
        userId: userId as string | undefined,
        page: parseInt(page as string, 10),
        limit: parseInt(limit as string, 10),
      });

      return res.status(200).json({
        success: true,
        data: result.alerts,
        pagination: result.pagination,
      });
    } catch (error: any) {
      logger.error('Get fraud alerts error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_ALERTS_FAILED',
          message: 'Failed to fetch fraud alerts',
        },
      });
    }
  }

  /**
   * Get fraud statistics
   */
  async getStats(req: AdminRequest, res: Response) {
    try {
      const { period = '30d' } = req.query;

      const stats = await adminFraudService.getFraudStats(
        period as '24h' | '7d' | '30d'
      );

      return res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error: any) {
      logger.error('Get fraud stats error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_STATS_FAILED',
          message: 'Failed to fetch fraud statistics',
        },
      });
    }
  }

  /**
   * Update fraud alert status
   */
  async updateAlert(req: AdminRequest, res: Response) {
    try {
      const { id } = req.params;
      const { status, reviewNotes } = req.body;

      if (!status) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_STATUS',
            message: 'Status is required',
          },
        });
      }

      const alert = await adminFraudService.updateAlertStatus(
        id,
        status as FraudAlertStatus,
        req.admin!.id,
        reviewNotes
      );

      return res.status(200).json({
        success: true,
        data: alert,
        message: 'Fraud alert updated successfully',
      });
    } catch (error: any) {
      logger.error('Update fraud alert error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'UPDATE_ALERT_FAILED',
          message: 'Failed to update fraud alert',
        },
      });
    }
  }

  /**
   * Calculate user risk score
   */
  async calculateRiskScore(req: AdminRequest, res: Response) {
    try {
      const { userId } = req.params;

      const riskScore = await adminFraudService.calculateUserRiskScore(userId);

      return res.status(200).json({
        success: true,
        data: {
          userId,
          riskScore,
          riskLevel:
            riskScore >= 70
              ? 'HIGH'
              : riskScore >= 40
              ? 'MEDIUM'
              : 'LOW',
        },
      });
    } catch (error: any) {
      logger.error('Calculate risk score error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'RISK_CALCULATION_FAILED',
          message: 'Failed to calculate risk score',
        },
      });
    }
  }

  /**
   * Get fraud rules
   */
  async getRules(req: AdminRequest, res: Response) {
    try {
      const { activeOnly = 'false' } = req.query;

      const rules = await adminFraudService.getRules(activeOnly === 'true');

      return res.status(200).json({
        success: true,
        data: rules,
      });
    } catch (error: any) {
      logger.error('Get fraud rules error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_RULES_FAILED',
          message: 'Failed to fetch fraud rules',
        },
      });
    }
  }

  /**
   * Create fraud rule
   */
  async createRule(req: AdminRequest, res: Response) {
    try {
      const { name, description, ruleType, conditions, severity } = req.body;

      // Validate input
      if (!name || !ruleType || !conditions || !severity) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_FIELDS',
            message: 'Name, ruleType, conditions, and severity are required',
          },
        });
      }

      const rule = await adminFraudService.createRule({
        name,
        description,
        ruleType,
        conditions,
        severity: severity as FraudAlertSeverity,
      });

      return res.status(201).json({
        success: true,
        data: rule,
        message: 'Fraud rule created successfully',
      });
    } catch (error: any) {
      logger.error('Create fraud rule error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'CREATE_RULE_FAILED',
          message: 'Failed to create fraud rule',
        },
      });
    }
  }

  /**
   * Update fraud rule
   */
  async updateRule(req: AdminRequest, res: Response) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const rule = await adminFraudService.updateRule(id, updateData);

      return res.status(200).json({
        success: true,
        data: rule,
        message: 'Fraud rule updated successfully',
      });
    } catch (error: any) {
      logger.error('Update fraud rule error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'UPDATE_RULE_FAILED',
          message: 'Failed to update fraud rule',
        },
      });
    }
  }

  /**
   * Delete fraud rule
   */
  async deleteRule(req: AdminRequest, res: Response) {
    try {
      const { id } = req.params;

      await adminFraudService.deleteRule(id);

      return res.status(200).json({
        success: true,
        message: 'Fraud rule deleted successfully',
      });
    } catch (error: any) {
      logger.error('Delete fraud rule error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'DELETE_RULE_FAILED',
          message: 'Failed to delete fraud rule',
        },
      });
    }
  }
}

export default new AdminFraudController();
