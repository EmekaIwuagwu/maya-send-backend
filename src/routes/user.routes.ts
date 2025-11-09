import { Router } from 'express';
import { authenticateUser } from '../middleware/user.middleware';

// Import user controllers
import userAuthController from '../controllers/user/user.auth.controller';
import userProfileController from '../controllers/user/user.profile.controller';
import userTransactionsController from '../controllers/user/user.transactions.controller';
import userEmailPaymentsController from '../controllers/user/user.emailPayments.controller';
import userWithdrawalsController from '../controllers/user/user.withdrawals.controller';
import userDisputesController from '../controllers/user/user.disputes.controller';
import userKYCController from '../controllers/user/user.kyc.controller';
import userDashboardController from '../controllers/user/user.dashboard.controller';

const router = Router();

// ============= AUTHENTICATION =============
router.post('/auth/register', userAuthController.register);
router.post('/auth/login', userAuthController.login);
router.post('/auth/logout', userAuthController.logout);
router.post('/auth/refresh', userAuthController.refreshToken);
router.get('/auth/me', authenticateUser, userAuthController.getProfile);

// ============= PROFILE =============
router.get('/profile', authenticateUser, userProfileController.getProfile);
router.put('/profile', authenticateUser, userProfileController.updateProfile);
router.post('/profile/change-password', authenticateUser, userProfileController.changePassword);

// ============= DASHBOARD =============
router.get('/dashboard', authenticateUser, userDashboardController.getOverview);
router.get('/dashboard/statistics', authenticateUser, userDashboardController.getStatistics);

// ============= TRANSACTIONS =============
router.post('/transactions/send', authenticateUser, userTransactionsController.sendMoney);
router.get('/transactions', authenticateUser, userTransactionsController.getTransactions);
router.get('/transactions/:id', authenticateUser, userTransactionsController.getTransactionDetails);

// ============= EMAIL PAYMENTS =============
router.post('/email-payments/send', authenticateUser, userEmailPaymentsController.sendViaEmail);
router.post('/email-payments/claim', authenticateUser, userEmailPaymentsController.claimPayment);
router.get('/email-payments', authenticateUser, userEmailPaymentsController.getSentPayments);
router.post('/email-payments/:id/cancel', authenticateUser, userEmailPaymentsController.cancelPayment);

// ============= WITHDRAWALS =============
router.post('/withdrawals/request', authenticateUser, userWithdrawalsController.requestWithdrawal);
router.get('/withdrawals', authenticateUser, userWithdrawalsController.getWithdrawals);

// ============= DISPUTES =============
router.post('/disputes', authenticateUser, userDisputesController.fileDispute);
router.get('/disputes', authenticateUser, userDisputesController.getDisputes);
router.get('/disputes/:id', authenticateUser, userDisputesController.getDisputeDetails);

// ============= KYC =============
router.post('/kyc/submit', authenticateUser, userKYCController.submitKYC);
router.get('/kyc/status', authenticateUser, userKYCController.getKYCStatus);

export default router;
