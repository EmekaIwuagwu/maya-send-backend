import { Response } from 'express';
import { AdminRequest } from '../../middleware/admin.middleware';
import { prisma } from '../../config/database';
import { KYCStatus } from '@prisma/client';
import logger from '../../utils/logger';

class AdminUsersController {
  /**
   * Get users list with filtering and pagination
   */
  async getUsers(req: AdminRequest, res: Response) {
    try {
      const {
        search,
        kycStatus,
        isSuspended,
        isFlagged,
        minBalance,
        maxBalance,
        page = '1',
        limit = '50',
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = req.query;

      const where: any = {};

      // Search filter (email or full name)
      if (search) {
        where.OR = [
          { email: { contains: search as string, mode: 'insensitive' } },
          { fullName: { contains: search as string, mode: 'insensitive' } },
        ];
      }

      // Status filters
      if (kycStatus) where.kycStatus = kycStatus as KYCStatus;
      if (isSuspended !== undefined) where.isSuspended = isSuspended === 'true';
      if (isFlagged !== undefined) where.isFlagged = isFlagged === 'true';

      // Balance filters
      if (minBalance || maxBalance) {
        where.balance = {};
        if (minBalance) where.balance.gte = parseFloat(minBalance as string);
        if (maxBalance) where.balance.lte = parseFloat(maxBalance as string);
      }

      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);
      const skip = (pageNum - 1) * limitNum;

      const orderBy: any = {};
      orderBy[sortBy as string] = sortOrder as string;

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          select: {
            id: true,
            email: true,
            fullName: true,
            phoneNumber: true,
            balance: true,
            kycStatus: true,
            isSuspended: true,
            isFlagged: true,
            solanaWalletAddress: true,
            createdAt: true,
            lastLoginAt: true,
            _count: {
              select: {
                sentTransactions: true,
                receivedTransactions: true,
                disputes: true,
                fraudAlerts: true,
              },
            },
          },
          orderBy,
          skip,
          take: limitNum,
        }),
        prisma.user.count({ where }),
      ]);

      return res.status(200).json({
        success: true,
        data: users,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error: any) {
      logger.error('Get users error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_USERS_FAILED',
          message: 'Failed to fetch users',
        },
      });
    }
  }

  /**
   * Get detailed user information
   */
  async getUserDetails(req: AdminRequest, res: Response) {
    try {
      const { id } = req.params;

      const user = await prisma.user.findUnique({
        where: { id },
        include: {
          sentTransactions: {
            take: 10,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              amount: true,
              status: true,
              transactionType: true,
              createdAt: true,
              recipient: { select: { email: true, fullName: true } },
            },
          },
          receivedTransactions: {
            take: 10,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              amount: true,
              status: true,
              transactionType: true,
              createdAt: true,
              sender: { select: { email: true, fullName: true } },
            },
          },
          disputes: {
            take: 5,
            orderBy: { createdAt: 'desc' },
          },
          fraudAlerts: {
            take: 5,
            orderBy: { createdAt: 'desc' },
          },
          withdrawals: {
            take: 5,
            orderBy: { createdAt: 'desc' },
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

      return res.status(200).json({
        success: true,
        data: user,
      });
    } catch (error: any) {
      logger.error('Get user details error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_USER_FAILED',
          message: 'Failed to fetch user details',
        },
      });
    }
  }

  /**
   * Update user information
   */
  async updateUser(req: AdminRequest, res: Response) {
    try {
      const { id } = req.params;
      const { fullName, phoneNumber, kycStatus, solanaWalletAddress } = req.body;

      const updateData: any = {};
      if (fullName !== undefined) updateData.fullName = fullName;
      if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
      if (kycStatus !== undefined) updateData.kycStatus = kycStatus as KYCStatus;
      if (solanaWalletAddress !== undefined)
        updateData.solanaWalletAddress = solanaWalletAddress;

      const user = await prisma.user.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          email: true,
          fullName: true,
          phoneNumber: true,
          kycStatus: true,
          solanaWalletAddress: true,
          updatedAt: true,
        },
      });

      return res.status(200).json({
        success: true,
        data: user,
        message: 'User updated successfully',
      });
    } catch (error: any) {
      logger.error('Update user error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'UPDATE_USER_FAILED',
          message: 'Failed to update user',
        },
      });
    }
  }

  /**
   * Suspend user account
   */
  async suspendUser(req: AdminRequest, res: Response) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      if (!reason) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_REASON',
            message: 'Suspension reason is required',
          },
        });
      }

      const user = await prisma.user.update({
        where: { id },
        data: {
          isSuspended: true,
          suspensionReason: reason,
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          isSuspended: true,
          suspensionReason: true,
        },
      });

      logger.info('User suspended', {
        userId: id,
        adminId: req.admin!.id,
        reason,
      });

      return res.status(200).json({
        success: true,
        data: user,
        message: 'User suspended successfully',
      });
    } catch (error: any) {
      logger.error('Suspend user error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'SUSPEND_USER_FAILED',
          message: 'Failed to suspend user',
        },
      });
    }
  }

  /**
   * Unsuspend user account
   */
  async unsuspendUser(req: AdminRequest, res: Response) {
    try {
      const { id } = req.params;

      const user = await prisma.user.update({
        where: { id },
        data: {
          isSuspended: false,
          suspensionReason: null,
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          isSuspended: true,
        },
      });

      logger.info('User unsuspended', {
        userId: id,
        adminId: req.admin!.id,
      });

      return res.status(200).json({
        success: true,
        data: user,
        message: 'User unsuspended successfully',
      });
    } catch (error: any) {
      logger.error('Unsuspend user error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'UNSUSPEND_USER_FAILED',
          message: 'Failed to unsuspend user',
        },
      });
    }
  }

  /**
   * Flag user for review
   */
  async flagUser(req: AdminRequest, res: Response) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const user = await prisma.user.update({
        where: { id },
        data: {
          isFlagged: true,
          flagReason: reason || null,
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          isFlagged: true,
          flagReason: true,
        },
      });

      logger.info('User flagged', {
        userId: id,
        adminId: req.admin!.id,
        reason,
      });

      return res.status(200).json({
        success: true,
        data: user,
        message: 'User flagged successfully',
      });
    } catch (error: any) {
      logger.error('Flag user error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'FLAG_USER_FAILED',
          message: 'Failed to flag user',
        },
      });
    }
  }

  /**
   * Unflag user
   */
  async unflagUser(req: AdminRequest, res: Response) {
    try {
      const { id } = req.params;

      const user = await prisma.user.update({
        where: { id },
        data: {
          isFlagged: false,
          flagReason: null,
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          isFlagged: true,
        },
      });

      logger.info('User unflagged', {
        userId: id,
        adminId: req.admin!.id,
      });

      return res.status(200).json({
        success: true,
        data: user,
        message: 'User unflagged successfully',
      });
    } catch (error: any) {
      logger.error('Unflag user error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'UNFLAG_USER_FAILED',
          message: 'Failed to unflag user',
        },
      });
    }
  }

  /**
   * Adjust user balance (super admin only)
   */
  async adjustBalance(req: AdminRequest, res: Response) {
    try {
      const { id } = req.params;
      const { amount, reason } = req.body;

      if (!amount || !reason) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_FIELDS',
            message: 'Amount and reason are required',
          },
        });
      }

      const amountNum = parseFloat(amount);
      if (isNaN(amountNum)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_AMOUNT',
            message: 'Invalid amount',
          },
        });
      }

      const user = await prisma.user.update({
        where: { id },
        data: {
          balance: {
            increment: amountNum,
          },
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          balance: true,
        },
      });

      logger.warn('User balance adjusted', {
        userId: id,
        adminId: req.admin!.id,
        amount: amountNum,
        reason,
        newBalance: user.balance,
      });

      return res.status(200).json({
        success: true,
        data: user,
        message: 'Balance adjusted successfully',
      });
    } catch (error: any) {
      logger.error('Adjust balance error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'ADJUST_BALANCE_FAILED',
          message: 'Failed to adjust balance',
        },
      });
    }
  }

  /**
   * Add admin note to user
   */
  async addNote(req: AdminRequest, res: Response) {
    try {
      const { id } = req.params;
      const { note } = req.body;

      if (!note) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_NOTE',
            message: 'Note is required',
          },
        });
      }

      // Get existing notes or create new array
      const user = await prisma.user.findUnique({
        where: { id },
        select: { adminNotes: true },
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

      const existingNotes = (user.adminNotes as any[]) || [];
      const newNote = {
        note,
        addedBy: req.admin!.id,
        addedByEmail: req.admin!.email,
        addedAt: new Date().toISOString(),
      };

      const updatedUser = await prisma.user.update({
        where: { id },
        data: {
          adminNotes: [...existingNotes, newNote],
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          adminNotes: true,
        },
      });

      return res.status(201).json({
        success: true,
        data: updatedUser,
        message: 'Note added successfully',
      });
    } catch (error: any) {
      logger.error('Add note error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'ADD_NOTE_FAILED',
          message: 'Failed to add note',
        },
      });
    }
  }

  /**
   * Delete user account (soft delete)
   */
  async deleteUser(req: AdminRequest, res: Response) {
    try {
      const { id } = req.params;
      const { permanent = false } = req.body;

      if (permanent) {
        // Hard delete - only for super admins, use with caution
        await prisma.user.delete({
          where: { id },
        });

        logger.warn('User permanently deleted', {
          userId: id,
          adminId: req.admin!.id,
        });

        return res.status(200).json({
          success: true,
          message: 'User permanently deleted',
        });
      } else {
        // Soft delete - mark as deleted
        const user = await prisma.user.update({
          where: { id },
          data: {
            isDeleted: true,
            deletedAt: new Date(),
            isSuspended: true,
            suspensionReason: 'Account deleted',
          },
          select: {
            id: true,
            email: true,
            isDeleted: true,
            deletedAt: true,
          },
        });

        logger.info('User soft deleted', {
          userId: id,
          adminId: req.admin!.id,
        });

        return res.status(200).json({
          success: true,
          data: user,
          message: 'User account deleted',
        });
      }
    } catch (error: any) {
      logger.error('Delete user error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'DELETE_USER_FAILED',
          message: 'Failed to delete user',
        },
      });
    }
  }
}

export default new AdminUsersController();
