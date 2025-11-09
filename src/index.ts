import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { config } from './config';
import logger from './utils/logger';
import adminRoutes from './routes/admin.routes';
import userRoutes from './routes/user.routes';
import AdminWebSocket from './websockets/admin.socket';

const app = express();
const httpServer = createServer(app);

// Initialize WebSocket
const adminSocket = new AdminWebSocket(httpServer);

// Middleware
app.use(helmet());
app.use(
  cors({
    origin: config.app.frontendUrl,
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Maya Send Backend is running',
    timestamp: new Date().toISOString(),
    environment: config.app.env,
  });
});

// Routes
app.use('/api/admin', adminRoutes);
app.use('/api/user', userRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found',
    },
  });
});

// Error handler
app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    logger.error('Unhandled error', { error: err });

    res.status(err.status || 500).json({
      success: false,
      error: {
        code: err.code || 'INTERNAL_SERVER_ERROR',
        message:
          config.app.env === 'production'
            ? 'An error occurred'
            : err.message || 'An error occurred',
      },
    });
  }
);

// Start server
const PORT = config.app.port;

httpServer.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`📡 Environment: ${config.app.env}`);
  logger.info(`🔗 Admin WebSocket: ws://localhost:${PORT}/admin/socket`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

export { adminSocket };
export default app;
