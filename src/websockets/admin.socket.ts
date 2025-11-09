import { Server } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';
import { config } from '../config';
import logger from '../utils/logger';

export class AdminWebSocket {
  private io: Server;

  constructor(httpServer: HTTPServer) {
    this.io = new Server(httpServer, {
      path: '/admin/socket',
      cors: {
        origin: config.app.frontendUrl,
        credentials: true,
      },
    });

    this.setupAuthentication();
    this.setupEventHandlers();
  }

  private setupAuthentication() {
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;

        if (!token) {
          return next(new Error('Authentication error'));
        }

        const decoded = jwt.verify(token, config.jwt.adminSecret) as any;

        const admin = await prisma.admin.findUnique({
          where: { id: decoded.adminId },
          select: {
            id: true,
            email: true,
            role: true,
            permissions: true,
            isActive: true,
          },
        });

        if (!admin || !admin.isActive) {
          return next(new Error('Authentication error'));
        }

        socket.data.admin = admin;
        next();
      } catch (error) {
        next(new Error('Authentication error'));
      }
    });
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket) => {
      logger.info(`Admin connected: ${socket.data.admin.email}`);

      // Join admin room for broadcasts
      socket.join('admins');

      // Subscribe to specific data streams
      socket.on('subscribe:transactions', () => {
        socket.join('transactions');
        logger.info(`Admin subscribed to transactions: ${socket.data.admin.email}`);
      });

      socket.on('subscribe:users', () => {
        socket.join('users');
        logger.info(`Admin subscribed to users: ${socket.data.admin.email}`);
      });

      socket.on('subscribe:disputes', () => {
        socket.join('disputes');
        logger.info(`Admin subscribed to disputes: ${socket.data.admin.email}`);
      });

      socket.on('subscribe:fraud', () => {
        socket.join('fraud');
        logger.info(`Admin subscribed to fraud alerts: ${socket.data.admin.email}`);
      });

      socket.on('disconnect', () => {
        logger.info(`Admin disconnected: ${socket.data.admin.email}`);
      });
    });
  }

  // Emit events to connected admins
  public emitNewTransaction(transaction: any) {
    this.io.to('transactions').emit('transaction:new', transaction);
    logger.info('Emitted new transaction event', { transactionId: transaction.id });
  }

  public emitNewUser(user: any) {
    this.io.to('users').emit('user:new', user);
    logger.info('Emitted new user event', { userId: user.id });
  }

  public emitNewDispute(dispute: any) {
    this.io.to('disputes').emit('dispute:new', dispute);
    logger.info('Emitted new dispute event', { disputeId: dispute.id });
  }

  public emitFraudAlert(alert: any) {
    this.io.to('admins').emit('fraud:alert', alert);
    this.io.to('fraud').emit('fraud:alert', alert);
    logger.warn('Emitted fraud alert', { alertId: alert.id, severity: alert.severity });
  }

  public emitSystemAlert(alert: any) {
    this.io.to('admins').emit('system:alert', alert);
    logger.warn('Emitted system alert', { type: alert.type });
  }

  public emitTransactionUpdate(transaction: any) {
    this.io.to('transactions').emit('transaction:update', transaction);
    logger.info('Emitted transaction update', { transactionId: transaction.id });
  }

  public emitUserUpdate(user: any) {
    this.io.to('users').emit('user:update', user);
    logger.info('Emitted user update', { userId: user.id });
  }

  public emitDisputeUpdate(dispute: any) {
    this.io.to('disputes').emit('dispute:update', dispute);
    logger.info('Emitted dispute update', { disputeId: dispute.id });
  }
}

export default AdminWebSocket;
