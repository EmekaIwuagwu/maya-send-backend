import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import config from '../../config';
import logger from '../../utils/logger';

class UserAuthController {
  /**
   * Register new user
   */
  async register(req: Request, res: Response) {
    try {
      const { email, password, fullName, phoneNumber } = req.body;

      // Validate required fields
      if (!email || !password || !fullName) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_FIELDS',
            message: 'Email, password, and full name are required',
          },
        });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_EMAIL',
            message: 'Invalid email format',
          },
        });
      }

      // Validate password strength
      if (password.length < 8) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'WEAK_PASSWORD',
            message: 'Password must be at least 8 characters long',
          },
        });
      }

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });

      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'USER_EXISTS',
            message: 'User with this email already exists',
          },
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user
      const user = await prisma.user.create({
        data: {
          email: email.toLowerCase(),
          password: hashedPassword,
          fullName,
          phoneNumber: phoneNumber || null,
          balance: 0,
          kycStatus: 'NONE',
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          phoneNumber: true,
          balance: true,
          kycStatus: true,
          createdAt: true,
        },
      });

      // Generate tokens
      const accessToken = jwt.sign(
        { userId: user.id, email: user.email },
        config.jwt.accessSecret,
        { expiresIn: config.jwt.accessExpiration }
      );

      const refreshToken = jwt.sign(
        { userId: user.id, email: user.email },
        config.jwt.refreshSecret,
        { expiresIn: config.jwt.refreshExpiration }
      );

      // Create session
      await prisma.userSession.create({
        data: {
          userId: user.id,
          refreshToken,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
          ipAddress: req.ip || 'unknown',
          userAgent: req.get('user-agent') || 'unknown',
        },
      });

      logger.info('User registered', {
        userId: user.id,
        email: user.email,
      });

      return res.status(201).json({
        success: true,
        data: {
          user,
          accessToken,
          refreshToken,
        },
        message: 'Registration successful',
      });
    } catch (error: any) {
      logger.error('User registration error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'REGISTRATION_FAILED',
          message: 'Failed to register user',
        },
      });
    }
  }

  /**
   * User login
   */
  async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_CREDENTIALS',
            message: 'Email and password are required',
          },
        });
      }

      // Find user
      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });

      if (!user) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password',
          },
        });
      }

      // Check if user is suspended or deleted
      if (user.isSuspended) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'ACCOUNT_SUSPENDED',
            message: `Your account has been suspended. Reason: ${user.suspensionReason || 'Violation of terms'}`,
          },
        });
      }

      if (user.isDeleted) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'ACCOUNT_DELETED',
            message: 'This account has been deleted',
          },
        });
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password',
          },
        });
      }

      // Generate tokens
      const accessToken = jwt.sign(
        { userId: user.id, email: user.email },
        config.jwt.accessSecret,
        { expiresIn: config.jwt.accessExpiration }
      );

      const refreshToken = jwt.sign(
        { userId: user.id, email: user.email },
        config.jwt.refreshSecret,
        { expiresIn: config.jwt.refreshExpiration }
      );

      // Create session
      await prisma.userSession.create({
        data: {
          userId: user.id,
          refreshToken,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          ipAddress: req.ip || 'unknown',
          userAgent: req.get('user-agent') || 'unknown',
        },
      });

      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      logger.info('User logged in', {
        userId: user.id,
        email: user.email,
      });

      return res.status(200).json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            phoneNumber: user.phoneNumber,
            balance: user.balance,
            kycStatus: user.kycStatus,
            solanaWalletAddress: user.solanaWalletAddress,
          },
          accessToken,
          refreshToken,
        },
        message: 'Login successful',
      });
    } catch (error: any) {
      logger.error('User login error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'LOGIN_FAILED',
          message: 'Failed to login',
        },
      });
    }
  }

  /**
   * Logout user
   */
  async logout(req: Request, res: Response) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_TOKEN',
            message: 'Refresh token is required',
          },
        });
      }

      // Deactivate session
      await prisma.userSession.updateMany({
        where: {
          refreshToken,
          isActive: true,
        },
        data: {
          isActive: false,
        },
      });

      return res.status(200).json({
        success: true,
        message: 'Logout successful',
      });
    } catch (error: any) {
      logger.error('User logout error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'LOGOUT_FAILED',
          message: 'Failed to logout',
        },
      });
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(req: Request, res: Response) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_TOKEN',
            message: 'Refresh token is required',
          },
        });
      }

      // Verify refresh token
      let decoded: any;
      try {
        decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);
      } catch (error) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Invalid or expired refresh token',
          },
        });
      }

      // Check if session exists and is active
      const session = await prisma.userSession.findFirst({
        where: {
          refreshToken,
          userId: decoded.userId,
          isActive: true,
          expiresAt: {
            gt: new Date(),
          },
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
        { userId: decoded.userId, email: decoded.email },
        config.jwt.accessSecret,
        { expiresIn: config.jwt.accessExpiration }
      );

      return res.status(200).json({
        success: true,
        data: {
          accessToken: newAccessToken,
        },
        message: 'Token refreshed successfully',
      });
    } catch (error: any) {
      logger.error('Refresh token error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'REFRESH_FAILED',
          message: 'Failed to refresh token',
        },
      });
    }
  }

  /**
   * Get current user profile
   */
  async getProfile(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;

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
}

export default new UserAuthController();
