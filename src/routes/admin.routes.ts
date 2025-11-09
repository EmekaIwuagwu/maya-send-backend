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
  adminDashboardController.getOverview
);
router.get(
  '/dashboard/analytics',
  authenticateAdmin,
  adminDashboardController.getAnalytics
);

// ============= USER MANAGEMENT =============
router.get(
  '/users',
  authenticateAdmin,
  requirePermission(AdminPermission.VIEW_USERS),
  adminUsersController.getUsers
);
router.get(
  '/users/:id',
  authenticateAdmin,
  requirePermission(AdminPermission.VIEW_USERS),
  adminUsersController.getUserDetails
);
router.put(
  '/users/:id',
  authenticateAdmin,
  requirePermission(AdminPermission.EDIT_USERS),
  auditLog(AuditAction.USER_UPDATED, 'users'),
  adminUsersController.updateUser
);
router.post(
  '/users/:id/suspend',
  authenticateAdmin,
  requirePermission(AdminPermission.SUSPEND_USERS),
  auditLog(AuditAction.USER_SUSPENDED, 'users'),
  adminUsersController.suspendUser
);
router.post(
  '/users/:id/unsuspend',
  authenticateAdmin,
  requirePermission(AdminPermission.SUSPEND_USERS),
  auditLog(AuditAction.USER_UPDATED, 'users'),
  adminUsersController.unsuspendUser
);
router.post(
  '/users/:id/flag',
  authenticateAdmin,
  requirePermission(AdminPermission.EDIT_USERS),
  adminUsersController.flagUser
);
router.post(
  '/users/:id/unflag',
  authenticateAdmin,
  requirePermission(AdminPermission.EDIT_USERS),
  adminUsersController.unflagUser
);
router.post(
  '/users/:id/adjust-balance',
  authenticateAdmin,
  requireRole('SUPER_ADMIN'),
  auditLog(AuditAction.USER_UPDATED, 'users'),
  adminUsersController.adjustBalance
);
router.post(
  '/users/:id/notes',
  authenticateAdmin,
  requirePermission(AdminPermission.VIEW_USERS),
  adminUsersController.addNote
);
router.delete(
  '/users/:id',
  authenticateAdmin,
  requirePermission(AdminPermission.DELETE_USERS),
  auditLog(AuditAction.USER_DELETED, 'users'),
  adminUsersController.deleteUser
);

// ============= TRANSACTION MANAGEMENT =============
router.get(
  '/transactions',
  authenticateAdmin,
  requirePermission(AdminPermission.VIEW_TRANSACTIONS),
  adminTransactionsController.getTransactions
);
router.get(
  '/transactions/:id',
  authenticateAdmin,
  requirePermission(AdminPermission.VIEW_TRANSACTIONS),
  auditLog(AuditAction.TRANSACTION_VIEWED, 'transactions'),
  adminTransactionsController.getTransactionDetails
);
router.post(
  '/transactions/:id/flag',
  authenticateAdmin,
  requirePermission(AdminPermission.EDIT_TRANSACTIONS),
  auditLog(AuditAction.TRANSACTION_FLAGGED, 'transactions'),
  adminTransactionsController.flagTransaction
);
router.post(
  '/transactions/:id/refund',
  authenticateAdmin,
  requirePermission(AdminPermission.REFUND_TRANSACTIONS),
  auditLog(AuditAction.TRANSACTION_REFUNDED, 'transactions'),
  adminTransactionsController.refundTransaction
);

// ============= EMAIL PAYMENT MANAGEMENT =============
router.get(
  '/email-payments',
  authenticateAdmin,
  requirePermission(AdminPermission.VIEW_EMAIL_PAYMENTS),
  adminEmailPaymentsController.getEmailPayments
);
router.post(
  '/email-payments/:id/cancel',
  authenticateAdmin,
  requirePermission(AdminPermission.MANAGE_EMAIL_PAYMENTS),
  adminEmailPaymentsController.cancelEmailPayment
);
router.post(
  '/email-payments/:id/extend',
  authenticateAdmin,
  requirePermission(AdminPermission.MANAGE_EMAIL_PAYMENTS),
  adminEmailPaymentsController.extendEmailPayment
);

// ============= KYC MANAGEMENT =============
router.get(
  '/kyc/pending',
  authenticateAdmin,
  requirePermission(AdminPermission.VIEW_KYC),
  adminKYCController.getPendingKYC
);
router.post(
  '/kyc/:userId/approve',
  authenticateAdmin,
  requirePermission(AdminPermission.APPROVE_KYC),
  auditLog(AuditAction.KYC_APPROVED, 'users'),
  adminKYCController.approveKYC
);
router.post(
  '/kyc/:userId/reject',
  authenticateAdmin,
  requirePermission(AdminPermission.REJECT_KYC),
  auditLog(AuditAction.KYC_REJECTED, 'users'),
  adminKYCController.rejectKYC
);

// ============= WITHDRAWAL MANAGEMENT =============
router.get(
  '/withdrawals',
  authenticateAdmin,
  requirePermission(AdminPermission.VIEW_WITHDRAWALS),
  adminWithdrawalsController.getWithdrawals
);
router.post(
  '/withdrawals/:id/approve',
  authenticateAdmin,
  requirePermission(AdminPermission.APPROVE_WITHDRAWALS),
  auditLog(AuditAction.WITHDRAWAL_APPROVED, 'withdrawals'),
  adminWithdrawalsController.approveWithdrawal
);
router.post(
  '/withdrawals/:id/reject',
  authenticateAdmin,
  requirePermission(AdminPermission.APPROVE_WITHDRAWALS),
  auditLog(AuditAction.WITHDRAWAL_REJECTED, 'withdrawals'),
  adminWithdrawalsController.rejectWithdrawal
);

// ============= DISPUTE MANAGEMENT =============
router.get(
  '/disputes',
  authenticateAdmin,
  requirePermission(AdminPermission.VIEW_DISPUTES),
  adminDisputesController.getDisputes
);
router.post(
  '/disputes/:id/assign',
  authenticateAdmin,
  requirePermission(AdminPermission.RESOLVE_DISPUTES),
  adminDisputesController.assignDispute
);
router.post(
  '/disputes/:id/resolve',
  authenticateAdmin,
  requirePermission(AdminPermission.RESOLVE_DISPUTES),
  auditLog(AuditAction.DISPUTE_RESOLVED, 'disputes'),
  adminDisputesController.resolveDispute
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
  adminSettingsController.getSettings
);
router.put(
  '/settings/:key',
  authenticateAdmin,
  requirePermission(AdminPermission.EDIT_SETTINGS),
  auditLog(AuditAction.SETTINGS_CHANGED, 'settings'),
  adminSettingsController.updateSetting
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
router.get('/analytics/users', authenticateAdmin, adminAnalyticsController.getUserAnalytics);
router.get(
  '/analytics/transactions',
  authenticateAdmin,
  adminAnalyticsController.getTransactionAnalytics
);
router.get('/analytics/revenue', authenticateAdmin, adminAnalyticsController.getRevenueAnalytics);

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
router.get('/system/health', authenticateAdmin, adminSystemController.getHealth);
router.post(
  '/system/clear-cache',
  authenticateAdmin,
  requireRole('SUPER_ADMIN'),
  adminSystemController.clearCache
);
router.post(
  '/system/maintenance',
  authenticateAdmin,
  requireRole('SUPER_ADMIN'),
  adminSystemController.toggleMaintenance
);

export default router;
