import { Response } from 'express';
import { AdminRequest } from '../../middleware/admin.middleware';
import { prisma } from '../../config/database';
import { config } from '../../config';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import logger from '../../utils/logger';

class AdminAuthController {
  /**
   * Admin login
   */
  async login(req: AdminRequest, res: Response) {
    try {
      const { email, password, twoFactorCode } = req.body;

      // Validate input
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_CREDENTIALS',
            message: 'Email and password are required',
          },
        });
      }

      // Find admin
      const admin = await prisma.admin.findUnique({
        where: { email: email.toLowerCase() },
      });

      if (!admin) {
        logger.warn('Failed login attempt - admin not found', { email });
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password',
          },
        });
      }

      // Check if admin is active
      if (!admin.isActive || admin.isSuspended) {
        logger.warn('Login attempt by inactive/suspended admin', { email });
        return res.status(403).json({
          success: false,
          error: {
            code: 'ACCOUNT_DISABLED',
            message: 'Your account has been disabled',
          },
        });
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, admin.password);

      if (!isValidPassword) {
        logger.warn('Failed login attempt - invalid password', { email });
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password',
          },
        });
      }

      // Check 2FA if enabled
      if (admin.twoFactorEnabled) {
        if (!twoFactorCode) {
          return res.status(200).json({
            success: true,
            requiresTwoFactor: true,
            message: 'Two-factor authentication required',
          });
        }

        // TODO: Verify 2FA code using speakeasy
        // const isValid2FA = speakeasy.totp.verify({
        //   secret: admin.twoFactorSecret,
        //   encoding: 'base32',
        //   token: twoFactorCode
        // });
        // if (!isValid2FA) {
        //   return res.status(401).json({ error: 'Invalid 2FA code' });
        // }
      }

      // Generate JWT tokens
      const accessToken = jwt.sign(
        { adminId: admin.id, email: admin.email, role: admin.role },
        config.jwt.adminSecret,
        { expiresIn: config.jwt.adminExpiresIn }
      );

      const refreshToken = jwt.sign(
        { adminId: admin.id, type: 'refresh' },
        config.jwt.adminSecret,
        { expiresIn: '30d' }
      );

      // Calculate expiration
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 8); // 8 hours from now

      // Create session
      const session = await prisma.adminSession.create({
        data: {
          adminId: admin.id,
          token: accessToken,
          refreshToken,
          ipAddress: req.ip || req.socket.remoteAddress,
          userAgent: req.headers['user-agent'],
          expiresAt,
        },
      });

      // Update last login
      await prisma.admin.update({
        where: { id: admin.id },
        data: {
          lastLoginAt: new Date(),
        },
      });

      logger.info('Admin logged in successfully', {
        adminId: admin.id,
        email: admin.email,
      });

      return res.status(200).json({
        success: true,
        data: {
          accessToken,
          refreshToken,
          expiresIn: config.jwt.adminExpiresIn,
          admin: {
            id: admin.id,
            email: admin.email,
            fullName: admin.fullName,
            role: admin.role,
            permissions: admin.permissions,
          },
        },
      });
    } catch (error: any) {
      logger.error('Login error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'LOGIN_FAILED',
          message: 'An error occurred during login',
        },
      });
    }
  }

  /**
   * Admin logout
   */
  async logout(req: AdminRequest, res: Response) {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');

      if (token) {
        // Deactivate session
        await prisma.adminSession.updateMany({
          where: {
            token,
            adminId: req.admin!.id,
          },
          data: {
            isActive: false,
          },
        });

        logger.info('Admin logged out', { adminId: req.admin!.id });
      }

      return res.status(200).json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error: any) {
      logger.error('Logout error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'LOGOUT_FAILED',
          message: 'An error occurred during logout',
        },
      });
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(req: AdminRequest, res: Response) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_REFRESH_TOKEN',
            message: 'Refresh token is required',
          },
        });
      }

      // Verify refresh token
      const decoded = jwt.verify(refreshToken, config.jwt.adminSecret) as any;

      if (decoded.type !== 'refresh') {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Invalid refresh token',
          },
        });
      }

      // Find session
      const session = await prisma.adminSession.findFirst({
        where: {
          refreshToken,
          adminId: decoded.adminId,
          isActive: true,
        },
        include: {
          admin: true,
        },
      });

      if (!session) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_SESSION',
            message: 'Session not found or expired',
          },
        });
      }

      // Generate new access token
      const newAccessToken = jwt.sign(
        {
          adminId: session.admin.id,
          email: session.admin.email,
          role: session.admin.role,
        },
        config.jwt.adminSecret,
        { expiresIn: config.jwt.adminExpiresIn }
      );

      // Update session
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 8);

      await prisma.adminSession.update({
        where: { id: session.id },
        data: {
          token: newAccessToken,
          expiresAt,
          lastActivityAt: new Date(),
        },
      });

      logger.info('Admin token refreshed', { adminId: session.adminId });

      return res.status(200).json({
        success: true,
        data: {
          accessToken: newAccessToken,
          expiresIn: config.jwt.adminExpiresIn,
        },
      });
    } catch (error: any) {
      logger.error('Token refresh error', { error: error.message });
      return res.status(401).json({
        success: false,
        error: {
          code: 'REFRESH_FAILED',
          message: 'Failed to refresh token',
        },
      });
    }
  }

  /**
   * Get admin profile
   */
  async getProfile(req: AdminRequest, res: Response) {
    try {
      const admin = await prisma.admin.findUnique({
        where: { id: req.admin!.id },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          permissions: true,
          twoFactorEnabled: true,
          allowedIPs: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!admin) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'ADMIN_NOT_FOUND',
            message: 'Admin not found',
          },
        });
      }

      return res.status(200).json({
        success: true,
        data: admin,
      });
    } catch (error: any) {
      logger.error('Get profile error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'PROFILE_FETCH_FAILED',
          message: 'Failed to fetch profile',
        },
      });
    }
  }
}

export default new AdminAuthController();
