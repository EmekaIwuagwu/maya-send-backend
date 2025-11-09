import { Response } from 'express';
import { UserRequest } from '../../middleware/user.middleware';
import { prisma } from '../../config/database';
import logger from '../../utils/logger';

class UserKYCController {
  /**
   * Submit KYC documents
   */
  async submitKYC(req: UserRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const { documentType, documentNumber, dateOfBirth, address, city, country, postalCode } =
        req.body;

      // Validate inputs
      if (
        !documentType ||
        !documentNumber ||
        !dateOfBirth ||
        !address ||
        !city ||
        !country ||
        !postalCode
      ) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_FIELDS',
            message: 'All KYC fields are required',
          },
        });
      }

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { kycStatus: true },
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

      // Check if already verified
      if (user.kycStatus === 'VERIFIED') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'ALREADY_VERIFIED',
            message: 'Your KYC is already verified',
          },
        });
      }

      // Check if pending
      if (user.kycStatus === 'PENDING') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'PENDING_VERIFICATION',
            message: 'Your KYC submission is pending review',
          },
        });
      }

      // Update user with KYC data
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          kycStatus: 'PENDING',
          kycData: {
            documentType,
            documentNumber,
            dateOfBirth,
            address,
            city,
            country,
            postalCode,
            submittedAt: new Date().toISOString(),
          },
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          kycStatus: true,
          kycData: true,
        },
      });

      logger.info('KYC submitted', { userId });

      return res.status(200).json({
        success: true,
        data: updatedUser,
        message: 'KYC documents submitted successfully. Pending admin review.',
      });
    } catch (error: any) {
      logger.error('Submit KYC error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'SUBMIT_KYC_FAILED',
          message: 'Failed to submit KYC documents',
        },
      });
    }
  }

  /**
   * Get KYC status
   */
  async getKYCStatus(req: UserRequest, res: Response) {
    try {
      const userId = req.user!.id;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          kycStatus: true,
          kycData: true,
          kycVerifiedAt: true,
          kycRejectedAt: true,
          kycRejectionReason: true,
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
      logger.error('Get KYC status error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'GET_KYC_STATUS_FAILED',
          message: 'Failed to get KYC status',
        },
      });
    }
  }
}

export default new UserKYCController();
