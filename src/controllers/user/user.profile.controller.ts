import { Response } from 'express';
import { UserRequest } from '../../middleware/user.middleware';
import { prisma } from '../../config/database';
import logger from '../../utils/logger';

class UserProfileController {
  /**
   * Get user profile
   */
  async getProfile(req: UserRequest, res: Response) {
    try {
      const userId = req.user!.id;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          fullName: true,
          phoneNumber: true,
          balance: true,
          kycStatus: true,
          solanaWalletAddress: true,
          isSuspended: true,
          isFlagged: true,
          createdAt: true,
          lastLoginAt: true,
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

      return res.status(200).json({
        success: true,
        data: user,
      });
    } catch (error: any) {
      logger.error('Get profile error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'GET_PROFILE_FAILED',
          message: 'Failed to get profile',
        },
      });
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(req: UserRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const { fullName, phoneNumber, solanaWalletAddress } = req.body;

      const updateData: any = {};
      if (fullName !== undefined) updateData.fullName = fullName;
      if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
      if (solanaWalletAddress !== undefined) updateData.solanaWalletAddress = solanaWalletAddress;

      const user = await prisma.user.update({
        where: { id: userId },
        data: updateData,
        select: {
          id: true,
          email: true,
          fullName: true,
          phoneNumber: true,
          solanaWalletAddress: true,
          updatedAt: true,
        },
      });

      logger.info('User profile updated', { userId });

      return res.status(200).json({
        success: true,
        data: user,
        message: 'Profile updated successfully',
      });
    } catch (error: any) {
      logger.error('Update profile error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'UPDATE_PROFILE_FAILED',
          message: 'Failed to update profile',
        },
      });
    }
  }

  /**
   * Change password
   */
  async changePassword(req: UserRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_FIELDS',
            message: 'Current password and new password are required',
          },
        });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'WEAK_PASSWORD',
            message: 'New password must be at least 8 characters long',
          },
        });
      }

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, password: true },
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

      // Verify current password
      const bcrypt = require('bcryptjs');
      const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_PASSWORD',
            message: 'Current password is incorrect',
          },
        });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update password
      await prisma.user.update({
        where: { id: userId },
        data: { password: hashedPassword },
      });

      // Invalidate all existing sessions
      await prisma.userSession.updateMany({
        where: { userId },
        data: { isActive: false },
      });

      logger.info('User password changed', { userId });

      return res.status(200).json({
        success: true,
        message: 'Password changed successfully. Please login again.',
      });
    } catch (error: any) {
      logger.error('Change password error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'CHANGE_PASSWORD_FAILED',
          message: 'Failed to change password',
        },
      });
    }
  }
}

export default new UserProfileController();
