import { Router } from 'express';
import { authenticateAdmin } from '../middleware/admin.middleware';
import { requirePermission, requireRole } from '../middleware/rbac.middleware';
import { auditLog } from '../middleware/auditLog.middleware';
import { AdminPermission, AuditAction } from '@prisma/client';

// Import controllers (stubs for now)
import adminAuthController from '../controllers/admin/admin.auth.controller';
import adminDashboardController from '../controllers/admin/admin.dashboard.controller';
import adminUsersController from '../controllers/admin/admin.users.controller';
import adminTransactionsController from '../controllers/admin/admin.transactions.controller';
import adminEmailPaymentsController from '../controllers/admin/admin.emailPayments.controller';
import adminKYCController from '../controllers/admin/admin.kyc.controller';
import adminWithdrawalsController from '../controllers/admin/admin.withdrawals.controller';
import adminDisputesController from '../controllers/admin/admin.disputes.controller';
import adminFraudController from '../controllers/admin/admin.fraud.controller';
import adminSettingsController from '../controllers/admin/admin.settings.controller';
import adminReportsController from '../controllers/admin/admin.reports.controller';
import adminAnalyticsController from '../controllers/admin/admin.analytics.controller';
import adminAuditController from '../controllers/admin/admin.audit.controller';
import adminSystemController from '../controllers/admin/admin.system.controller';

const router = Router();

// ============= AUTHENTICATION =============
router.post('/auth/login', adminAuthController.login);
router.post('/auth/logout', authenticateAdmin, adminAuthController.logout);
router.post('/auth/refresh', adminAuthController.refreshToken);
router.get('/auth/me', authenticateAdmin, adminAuthController.getProfile);

// ============= DASHBOARD =============
router.get(
  '/dashboard/overview',
  authenticateAdmin,
  adminDashboardController.handler
);
router.get(
  '/dashboard/analytics',
  authenticateAdmin,
  adminDashboardController.handler
);

// ============= USER MANAGEMENT =============
router.get(
  '/users',
  authenticateAdmin,
  requirePermission(AdminPermission.VIEW_USERS),
  adminUsersController.handler
);
router.get(
  '/users/:id',
  authenticateAdmin,
  requirePermission(AdminPermission.VIEW_USERS),
  adminUsersController.handler
);
router.put(
  '/users/:id',
  authenticateAdmin,
  requirePermission(AdminPermission.EDIT_USERS),
  auditLog(AuditAction.USER_UPDATED, 'users'),
  adminUsersController.handler
);
router.post(
  '/users/:id/suspend',
  authenticateAdmin,
  requirePermission(AdminPermission.SUSPEND_USERS),
  auditLog(AuditAction.USER_SUSPENDED, 'users'),
  adminUsersController.handler
);
router.post(
  '/users/:id/unsuspend',
  authenticateAdmin,
  requirePermission(AdminPermission.SUSPEND_USERS),
  auditLog(AuditAction.USER_UPDATED, 'users'),
  adminUsersController.handler
);
router.post(
  '/users/:id/flag',
  authenticateAdmin,
  requirePermission(AdminPermission.EDIT_USERS),
  adminUsersController.handler
);
router.post(
  '/users/:id/unflag',
  authenticateAdmin,
  requirePermission(AdminPermission.EDIT_USERS),
  adminUsersController.handler
);
router.post(
  '/users/:id/adjust-balance',
  authenticateAdmin,
  requireRole('SUPER_ADMIN'),
  auditLog(AuditAction.USER_UPDATED, 'users'),
  adminUsersController.handler
);
router.post(
  '/users/:id/notes',
  authenticateAdmin,
  requirePermission(AdminPermission.VIEW_USERS),
  adminUsersController.handler
);
router.delete(
  '/users/:id',
  authenticateAdmin,
  requirePermission(AdminPermission.DELETE_USERS),
  auditLog(AuditAction.USER_DELETED, 'users'),
  adminUsersController.handler
);

// ============= TRANSACTION MANAGEMENT =============
router.get(
  '/transactions',
  authenticateAdmin,
  requirePermission(AdminPermission.VIEW_TRANSACTIONS),
  adminTransactionsController.handler
);
router.get(
  '/transactions/:id',
  authenticateAdmin,
  requirePermission(AdminPermission.VIEW_TRANSACTIONS),
  auditLog(AuditAction.TRANSACTION_VIEWED, 'transactions'),
  adminTransactionsController.handler
);
router.post(
  '/transactions/:id/flag',
  authenticateAdmin,
  requirePermission(AdminPermission.EDIT_TRANSACTIONS),
  auditLog(AuditAction.TRANSACTION_FLAGGED, 'transactions'),
  adminTransactionsController.handler
);
router.post(
  '/transactions/:id/refund',
  authenticateAdmin,
  requirePermission(AdminPermission.REFUND_TRANSACTIONS),
  auditLog(AuditAction.TRANSACTION_REFUNDED, 'transactions'),
  adminTransactionsController.handler
);

// ============= EMAIL PAYMENT MANAGEMENT =============
router.get(
  '/email-payments',
  authenticateAdmin,
  requirePermission(AdminPermission.VIEW_EMAIL_PAYMENTS),
  adminEmailPaymentsController.handler
);
router.post(
  '/email-payments/:id/cancel',
  authenticateAdmin,
  requirePermission(AdminPermission.MANAGE_EMAIL_PAYMENTS),
  adminEmailPaymentsController.handler
);
router.post(
  '/email-payments/:id/extend',
  authenticateAdmin,
  requirePermission(AdminPermission.MANAGE_EMAIL_PAYMENTS),
  adminEmailPaymentsController.handler
);

// ============= KYC MANAGEMENT =============
router.get(
  '/kyc/pending',
  authenticateAdmin,
  requirePermission(AdminPermission.VIEW_KYC),
  adminKYCController.handler
);
router.post(
  '/kyc/:userId/approve',
  authenticateAdmin,
  requirePermission(AdminPermission.APPROVE_KYC),
  auditLog(AuditAction.KYC_APPROVED, 'users'),
  adminKYCController.handler
);
router.post(
  '/kyc/:userId/reject',
  authenticateAdmin,
  requirePermission(AdminPermission.REJECT_KYC),
  auditLog(AuditAction.KYC_REJECTED, 'users'),
  adminKYCController.handler
);

// ============= WITHDRAWAL MANAGEMENT =============
router.get(
  '/withdrawals',
  authenticateAdmin,
  requirePermission(AdminPermission.VIEW_WITHDRAWALS),
  adminWithdrawalsController.handler
);
router.post(
  '/withdrawals/:id/approve',
  authenticateAdmin,
  requirePermission(AdminPermission.APPROVE_WITHDRAWALS),
  auditLog(AuditAction.WITHDRAWAL_APPROVED, 'withdrawals'),
  adminWithdrawalsController.handler
);
router.post(
  '/withdrawals/:id/reject',
  authenticateAdmin,
  requirePermission(AdminPermission.APPROVE_WITHDRAWALS),
  auditLog(AuditAction.WITHDRAWAL_REJECTED, 'withdrawals'),
  adminWithdrawalsController.handler
);

// ============= DISPUTE MANAGEMENT =============
router.get(
  '/disputes',
  authenticateAdmin,
  requirePermission(AdminPermission.VIEW_DISPUTES),
  adminDisputesController.handler
);
router.post(
  '/disputes/:id/assign',
  authenticateAdmin,
  requirePermission(AdminPermission.RESOLVE_DISPUTES),
  adminDisputesController.handler
);
router.post(
  '/disputes/:id/resolve',
  authenticateAdmin,
  requirePermission(AdminPermission.RESOLVE_DISPUTES),
  auditLog(AuditAction.DISPUTE_RESOLVED, 'disputes'),
  adminDisputesController.handler
);

// ============= FRAUD MANAGEMENT =============
router.get(
  '/fraud/alerts',
  authenticateAdmin,
  requirePermission(AdminPermission.VIEW_FRAUD_ALERTS),
  adminFraudController.getAlerts
);
router.get(
  '/fraud/stats',
  authenticateAdmin,
  requirePermission(AdminPermission.VIEW_FRAUD_ALERTS),
  adminFraudController.getStats
);
router.put(
  '/fraud/alerts/:id',
  authenticateAdmin,
  requirePermission(AdminPermission.VIEW_FRAUD_ALERTS),
  adminFraudController.updateAlert
);
router.get(
  '/fraud/users/:userId/risk-score',
  authenticateAdmin,
  requirePermission(AdminPermission.VIEW_FRAUD_ALERTS),
  adminFraudController.calculateRiskScore
);
router.get(
  '/fraud/rules',
  authenticateAdmin,
  requirePermission(AdminPermission.VIEW_FRAUD_ALERTS),
  adminFraudController.getRules
);
router.post(
  '/fraud/rules',
  authenticateAdmin,
  requirePermission(AdminPermission.MANAGE_FRAUD_RULES),
  auditLog(AuditAction.FRAUD_RULE_ADDED, 'fraud_rules'),
  adminFraudController.createRule
);
router.put(
  '/fraud/rules/:id',
  authenticateAdmin,
  requirePermission(AdminPermission.MANAGE_FRAUD_RULES),
  auditLog(AuditAction.FRAUD_RULE_UPDATED, 'fraud_rules'),
  adminFraudController.updateRule
);
router.delete(
  '/fraud/rules/:id',
  authenticateAdmin,
  requirePermission(AdminPermission.MANAGE_FRAUD_RULES),
  adminFraudController.deleteRule
);

// ============= SETTINGS =============
router.get(
  '/settings',
  authenticateAdmin,
  requirePermission(AdminPermission.VIEW_SETTINGS),
  adminSettingsController.handler
);
router.put(
  '/settings/:key',
  authenticateAdmin,
  requirePermission(AdminPermission.EDIT_SETTINGS),
  auditLog(AuditAction.SETTINGS_CHANGED, 'settings'),
  adminSettingsController.handler
);

// ============= REPORTS =============
router.get(
  '/reports',
  authenticateAdmin,
  requirePermission(AdminPermission.VIEW_REPORTS),
  adminReportsController.getReports
);
router.get(
  '/reports/:id',
  authenticateAdmin,
  requirePermission(AdminPermission.VIEW_REPORTS),
  adminReportsController.getReportById
);
router.post(
  '/reports/generate',
  authenticateAdmin,
  requirePermission(AdminPermission.GENERATE_REPORTS),
  auditLog(AuditAction.REPORT_GENERATED, 'reports'),
  adminReportsController.generateReport
);
router.post(
  '/reports/daily',
  authenticateAdmin,
  requirePermission(AdminPermission.GENERATE_REPORTS),
  adminReportsController.generateDailyReport
);

// ============= ANALYTICS =============
router.get('/analytics/users', authenticateAdmin, adminAnalyticsController.handler);
router.get(
  '/analytics/transactions',
  authenticateAdmin,
  adminAnalyticsController.handler
);
router.get('/analytics/revenue', authenticateAdmin, adminAnalyticsController.handler);

// ============= AUDIT LOGS =============
router.get(
  '/audit-logs',
  authenticateAdmin,
  requirePermission(AdminPermission.VIEW_AUDIT_LOGS),
  adminAuditController.getAuditLogs
);
router.get(
  '/audit-logs/:resourceType/:resourceId',
  authenticateAdmin,
  requirePermission(AdminPermission.VIEW_AUDIT_LOGS),
  adminAuditController.getResourceAuditTrail
);

// ============= SYSTEM =============
router.get('/system/health', authenticateAdmin, adminSystemController.handler);
router.post(
  '/system/clear-cache',
  authenticateAdmin,
  requireRole('SUPER_ADMIN'),
  adminSystemController.handler
);
router.post(
  '/system/maintenance',
  authenticateAdmin,
  requireRole('SUPER_ADMIN'),
  adminSystemController.handler
);

export default router;
