import dotenv from 'dotenv';

dotenv.config();

export const config = {
  app: {
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
    name: process.env.APP_NAME || 'Maya Send',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3001',
    backendUrl: process.env.BACKEND_URL || 'http://localhost:3000',
  },

  database: {
    url: process.env.DATABASE_URL || '',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'default-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'default-refresh-secret',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
    adminSecret: process.env.JWT_ADMIN_SECRET || 'default-admin-secret',
    adminExpiresIn: process.env.JWT_ADMIN_EXPIRES_IN || '8h',
  },

  admin: {
    sessionTimeout: process.env.ADMIN_SESSION_TIMEOUT || '8h',
    twoFactorRequired: process.env.ADMIN_2FA_REQUIRED === 'true',
    ipWhitelistEnabled: process.env.ADMIN_IP_WHITELIST_ENABLED === 'true',
    maxLoginAttempts: parseInt(process.env.ADMIN_MAX_LOGIN_ATTEMPTS || '3', 10),
    lockoutDuration: process.env.ADMIN_LOCKOUT_DURATION || '30m',
  },

  solana: {
    network: process.env.SOLANA_NETWORK || 'devnet',
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    wssUrl: process.env.SOLANA_WSS_URL || 'wss://api.devnet.solana.com',
    usdcMintAddress: process.env.USDC_MINT_ADDRESS || '',
    platformWalletPrivateKey: process.env.PLATFORM_WALLET_PRIVATE_KEY || '',
    platformWalletPublicKey: process.env.PLATFORM_WALLET_PUBLIC_KEY || '',
  },

  email: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.EMAIL_FROM || 'noreply@maya-send.com',
    adminAlertEmail: process.env.ADMIN_ALERT_EMAIL || 'admin-alerts@maya-send.com',
    sendDailyReports: process.env.SEND_DAILY_REPORTS === 'true',
    sendFraudAlerts: process.env.SEND_FRAUD_ALERTS === 'true',
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || '',
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },

  fees: {
    platformFeePercentage: parseFloat(process.env.PLATFORM_FEE_PERCENTAGE || '0.5'),
    minTransactionAmount: parseFloat(process.env.MIN_TRANSACTION_AMOUNT || '0.01'),
    maxTransactionAmount: parseFloat(process.env.MAX_TRANSACTION_AMOUNT || '100000'),
    escrowFeePercentage: parseFloat(process.env.ESCROW_FEE_PERCENTAGE || '1.0'),
  },

  emailPayment: {
    expiryDays: parseInt(process.env.EMAIL_PAYMENT_EXPIRY_DAYS || '7', 10),
    maxAmount: parseFloat(process.env.MAX_EMAIL_PAYMENT_AMOUNT || '10000'),
  },

  withdrawal: {
    minAmount: parseFloat(process.env.WITHDRAWAL_MIN_AMOUNT || '10'),
    maxAmount: parseFloat(process.env.WITHDRAWAL_MAX_AMOUNT || '100000'),
    fee: parseFloat(process.env.WITHDRAWAL_FEE || '1'),
    autoApproveLimit: parseFloat(process.env.WITHDRAWAL_AUTO_APPROVE_LIMIT || '1000'),
  },

  kyc: {
    autoApprove: process.env.KYC_AUTO_APPROVE === 'true',
    documentStorage: process.env.KYC_DOCUMENT_STORAGE || 's3',
    maxFileSize: parseInt(process.env.KYC_MAX_FILE_SIZE || '10485760', 10),
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
    strictMaxRequests: parseInt(process.env.STRICT_RATE_LIMIT_MAX || '5', 10),
  },

  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
    passwordMinLength: parseInt(process.env.PASSWORD_MIN_LENGTH || '8', 10),
    passwordRequireUppercase: process.env.PASSWORD_REQUIRE_UPPERCASE === 'true',
    passwordRequireNumber: process.env.PASSWORD_REQUIRE_NUMBER === 'true',
    passwordRequireSpecial: process.env.PASSWORD_REQUIRE_SPECIAL === 'true',
  },

  fraud: {
    detectionEnabled: process.env.FRAUD_DETECTION_ENABLED === 'true',
    autoFlagHighRisk: process.env.AUTO_FLAG_HIGH_RISK === 'true',
    riskScoreThreshold: parseInt(process.env.RISK_SCORE_THRESHOLD || '70', 10),
    maxTransactionVelocity: parseInt(process.env.MAX_TRANSACTION_VELOCITY || '10', 10),
    velocityTimeWindow: parseInt(process.env.VELOCITY_TIME_WINDOW || '3600000', 10),
  },

  reports: {
    storagePath: process.env.REPORT_STORAGE_PATH || './reports',
    retentionDays: parseInt(process.env.REPORT_RETENTION_DAYS || '90', 10),
  },

  monitoring: {
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '60000', 10),
    alertOnHighCpu: parseInt(process.env.ALERT_ON_HIGH_CPU || '80', 10),
    alertOnHighMemory: parseInt(process.env.ALERT_ON_HIGH_MEMORY || '85', 10),
    alertOnLowDisk: parseInt(process.env.ALERT_ON_LOW_DISK || '20', 10),
  },

  audit: {
    retentionDays: parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || '365', 10),
  },

  compliance: {
    requireManualReviewAmount: parseFloat(process.env.REQUIRE_MANUAL_REVIEW_AMOUNT || '10000'),
    autoSuspendHighRisk: process.env.AUTO_SUSPEND_HIGH_RISK === 'true',
    maxFailedLoginAttempts: parseInt(process.env.MAX_FAILED_LOGIN_ATTEMPTS || '5', 10),
  },

  session: {
    secret: process.env.SESSION_SECRET || 'default-session-secret',
    expiry: parseInt(process.env.SESSION_EXPIRY || '86400000', 10),
  },

  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    region: process.env.AWS_REGION || 'us-east-1',
    s3Bucket: process.env.AWS_S3_BUCKET || 'maya-send-uploads',
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    filePath: process.env.LOG_FILE_PATH || './logs',
  },

  maintenance: {
    mode: process.env.MAINTENANCE_MODE === 'true',
    message: process.env.MAINTENANCE_MESSAGE || 'System is under maintenance. Please try again later.',
  },
};

export default config;
