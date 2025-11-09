import winston from 'winston';
import { config } from '../config';

const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'maya-send-backend' },
  transports: [
    new winston.transports.File({
      filename: `${config.logging.filePath}/error.log`,
      level: 'error',
    }),
    new winston.transports.File({
      filename: `${config.logging.filePath}/combined.log`,
    }),
  ],
});

if (config.app.env !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  );
}

export default logger;
