# Maya Send Backend

A comprehensive USDC payment platform backend with advanced admin features including fraud detection, reporting, analytics, and real-time monitoring.

## Features

### Admin Features
- **User Management**: View, edit, suspend, flag users with detailed audit trails
- **Transaction Management**: Monitor, flag, and refund transactions
- **KYC Management**: Approve/reject KYC submissions with document verification
- **Withdrawal Management**: Approve/reject withdrawals with manual review capabilities
- **Dispute Management**: Handle and resolve user disputes
- **Fraud Detection**: Advanced fraud rule engine with risk scoring
- **Report Generation**: Export reports in PDF, Excel, and CSV formats
- **Analytics Dashboard**: Real-time metrics and insights
- **Audit Logging**: Complete audit trail of all admin actions
- **Role-Based Access Control (RBAC)**: Granular permissions system
- **WebSocket Integration**: Real-time admin notifications

### Core Features
- **Email Payments**: Send USDC to email addresses (claimed later)
- **Escrow Services**: Secure milestone-based payments
- **Transactions**: P2P USDC transfers on Solana
- **Withdrawals**: Withdraw USDC to external wallets
- **Multi-currency Support**: USDC and SOL

## Tech Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Blockchain**: Solana (USDC SPL Token)
- **Authentication**: JWT with 2FA support
- **Real-time**: Socket.IO for WebSocket connections
- **Reporting**: ExcelJS, PDFKit for report generation
- **Email**: Nodemailer
- **Caching**: Redis
- **Queue**: Bull (Redis-based)

## Project Structure

```
maya-send-backend/
├── prisma/
│   └── schema.prisma          # Database schema
├── src/
│   ├── config/
│   │   ├── index.ts           # Configuration management
│   │   └── database.ts        # Prisma client
│   ├── controllers/
│   │   └── admin/             # Admin controllers (stubs)
│   ├── middleware/
│   │   ├── admin.middleware.ts      # Admin authentication
│   │   ├── rbac.middleware.ts       # Role-based access control
│   │   └── auditLog.middleware.ts   # Audit logging
│   ├── routes/
│   │   └── admin.routes.ts    # Admin API routes
│   ├── services/
│   │   └── admin/
│   │       ├── admin.audit.service.ts   # Audit logging service
│   │       ├── admin.fraud.service.ts   # Fraud detection service
│   │       └── admin.reports.service.ts # Report generation service
│   ├── websockets/
│   │   └── admin.socket.ts    # Real-time admin WebSocket
│   ├── utils/
│   │   └── logger.ts          # Winston logger
│   └── index.ts               # Application entry point
├── reports/                   # Generated reports directory
├── .env.example              # Environment variables template
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

## Installation

### Prerequisites
- Node.js 18+ and npm
- PostgreSQL database
- Redis server
- Solana wallet for platform operations

### Setup

1. **Clone the repository**
```bash
git clone <repository-url>
cd maya-send-backend
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Set up the database**
```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# (Optional) Seed database
npm run seed
```

5. **Start the development server**
```bash
npm run dev
```

The server will start on `http://localhost:3000` (or your configured PORT).

## Environment Variables

See `.env.example` for a complete list of environment variables. Key variables include:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/maya_send

# JWT Secrets
JWT_SECRET=your-jwt-secret
JWT_ADMIN_SECRET=your-admin-jwt-secret

# Solana
SOLANA_NETWORK=devnet
SOLANA_RPC_URL=https://api.devnet.solana.com
USDC_MINT_ADDRESS=your-usdc-mint-address

# Email
SMTP_HOST=smtp.gmail.com
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
```

## API Documentation

### Admin Endpoints

All admin endpoints require authentication with a Bearer token in the Authorization header.

#### Authentication
- `POST /api/admin/auth/login` - Admin login
- `POST /api/admin/auth/logout` - Admin logout
- `POST /api/admin/auth/refresh` - Refresh access token
- `GET /api/admin/auth/me` - Get admin profile

#### Dashboard
- `GET /api/admin/dashboard/overview` - Dashboard overview
- `GET /api/admin/dashboard/analytics` - Analytics data

#### User Management
- `GET /api/admin/users` - List users
- `GET /api/admin/users/:id` - Get user details
- `PUT /api/admin/users/:id` - Update user
- `POST /api/admin/users/:id/suspend` - Suspend user
- `POST /api/admin/users/:id/unsuspend` - Unsuspend user
- `POST /api/admin/users/:id/flag` - Flag user
- `DELETE /api/admin/users/:id` - Delete user

#### Transaction Management
- `GET /api/admin/transactions` - List transactions
- `GET /api/admin/transactions/:id` - Get transaction details
- `POST /api/admin/transactions/:id/flag` - Flag transaction
- `POST /api/admin/transactions/:id/refund` - Refund transaction

#### Fraud Management
- `GET /api/admin/fraud/alerts` - Get fraud alerts
- `POST /api/admin/fraud/rules` - Create fraud rule

#### Reports
- `GET /api/admin/reports` - List reports
- `POST /api/admin/reports/generate` - Generate report

## Admin WebSocket

Connect to the admin WebSocket for real-time updates:

```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:3000', {
  path: '/admin/socket',
  auth: {
    token: 'your-admin-jwt-token'
  }
});

// Subscribe to transactions
socket.emit('subscribe:transactions');
socket.on('transaction:new', (transaction) => {
  console.log('New transaction:', transaction);
});

// Subscribe to fraud alerts
socket.emit('subscribe:fraud');
socket.on('fraud:alert', (alert) => {
  console.log('Fraud alert:', alert);
});
```

## Fraud Detection

The fraud detection system includes:

1. **Velocity Checks**: Monitor transaction frequency
2. **Amount Thresholds**: Flag large transactions
3. **Geographic Anomalies**: Detect unusual locations
4. **New User High Amount**: Flag large transactions from new accounts
5. **Risk Scoring**: Calculate user risk scores (0-100)

Create custom fraud rules via the API or directly in the database.

## Report Generation

Generate reports in multiple formats:

```typescript
// Generate transaction report
POST /api/admin/reports/generate
{
  "type": "transaction",
  "startDate": "2024-01-01",
  "endDate": "2024-01-31",
  "format": "excel" // or "pdf", "csv"
}
```

Reports are saved to the `reports/` directory and can be downloaded via the returned URL.

## Role-Based Access Control

Admin permissions include:
- `VIEW_USERS`, `EDIT_USERS`, `SUSPEND_USERS`, `DELETE_USERS`
- `VIEW_TRANSACTIONS`, `EDIT_TRANSACTIONS`, `REFUND_TRANSACTIONS`
- `VIEW_KYC`, `APPROVE_KYC`, `REJECT_KYC`
- `VIEW_WITHDRAWALS`, `APPROVE_WITHDRAWALS`
- `VIEW_DISPUTES`, `RESOLVE_DISPUTES`
- `VIEW_FRAUD_ALERTS`, `MANAGE_FRAUD_RULES`
- `VIEW_REPORTS`, `GENERATE_REPORTS`
- `VIEW_SETTINGS`, `EDIT_SETTINGS`
- `VIEW_AUDIT_LOGS`
- `SYSTEM_ADMIN`

Admin roles:
- `SUPER_ADMIN` - Full access
- `ADMIN` - Standard admin access
- `SUPPORT` - Customer support
- `COMPLIANCE` - KYC and compliance
- `FINANCE` - Financial operations

## Development

### Scripts
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm start            # Start production server
npm run lint         # Run ESLint
npm run lint:fix     # Fix ESLint errors
npm test             # Run tests
```

### Database Commands
```bash
npm run prisma:generate  # Generate Prisma client
npm run prisma:migrate   # Run migrations
npm run prisma:studio    # Open Prisma Studio
npm run prisma:push      # Push schema to database
```

## Security

- All admin endpoints require JWT authentication
- RBAC ensures granular permission control
- Session management with automatic expiration
- IP whitelisting support for admin accounts
- 2FA support for sensitive operations
- Complete audit logging of all admin actions
- Rate limiting on all endpoints
- Helmet.js for security headers
- Input validation on all endpoints

## Production Deployment

1. Set `NODE_ENV=production`
2. Configure production database
3. Set strong JWT secrets
4. Enable IP whitelisting for admins
5. Configure email service (e.g., SendGrid)
6. Set up Redis for caching
7. Configure S3 for report storage
8. Set up monitoring and alerts
9. Configure SSL/TLS certificates
10. Set up automated backups

## License

MIT

## Support

For issues and questions, please open an issue on GitHub.
