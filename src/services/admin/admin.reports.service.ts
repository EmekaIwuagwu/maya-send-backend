import { prisma } from '../../config/database';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import logger from '../../utils/logger';

class AdminReportsService {
  /**
   * Generate comprehensive transaction report
   */
  async generateTransactionReport(params: {
    startDate: Date;
    endDate: Date;
    format: 'pdf' | 'excel' | 'csv';
    adminId: string;
  }) {
    const transactions = await prisma.transaction.findMany({
      where: {
        createdAt: {
          gte: params.startDate,
          lte: params.endDate,
        },
      },
      include: {
        sender: {
          select: {
            email: true,
            fullName: true,
          },
        },
        recipient: {
          select: {
            email: true,
            fullName: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const reportData = {
      title: 'Transaction Report',
      period: `${params.startDate.toLocaleDateString()} - ${params.endDate.toLocaleDateString()}`,
      generatedAt: new Date(),
      summary: {
        totalTransactions: transactions.length,
        totalVolume: transactions.reduce((sum, t) => sum + Number(t.amount), 0),
        totalFees: transactions.reduce((sum, t) => sum + Number(t.fee), 0),
        successfulTransactions: transactions.filter((t) => t.status === 'COMPLETED')
          .length,
        failedTransactions: transactions.filter((t) => t.status === 'FAILED').length,
      },
      transactions,
    };

    let fileUrl: string;

    switch (params.format) {
      case 'excel':
        fileUrl = await this.generateExcelReport(reportData);
        break;
      case 'pdf':
        fileUrl = await this.generatePDFReport(reportData);
        break;
      case 'csv':
        fileUrl = await this.generateCSVReport(reportData);
        break;
      default:
        throw new Error('Unsupported format');
    }

    // Save report record
    const report = await prisma.report.create({
      data: {
        reportType: 'CUSTOM',
        reportName: 'Transaction Report',
        startDate: params.startDate,
        endDate: params.endDate,
        data: reportData.summary,
        generatedBy: params.adminId,
        fileUrl,
      },
    });

    logger.info('Transaction report generated', {
      reportId: report.id,
      format: params.format,
      adminId: params.adminId,
    });

    return {
      reportId: report.id,
      fileUrl,
      summary: reportData.summary,
    };
  }

  /**
   * Generate user activity report
   */
  async generateUserReport(params: {
    startDate: Date;
    endDate: Date;
    format: 'pdf' | 'excel' | 'csv';
    adminId: string;
  }) {
    const users = await prisma.user.findMany({
      where: {
        createdAt: {
          gte: params.startDate,
          lte: params.endDate,
        },
      },
      include: {
        wallets: true,
        _count: {
          select: {
            transactions: true,
            disputes: true,
          },
        },
      },
    });

    const reportData = {
      title: 'User Activity Report',
      period: `${params.startDate.toLocaleDateString()} - ${params.endDate.toLocaleDateString()}`,
      summary: {
        totalUsers: users.length,
        verifiedUsers: users.filter((u) => u.kycStatus === 'VERIFIED').length,
        activeUsers: users.filter(
          (u) => u.lastLoginAt && u.lastLoginAt >= params.startDate
        ).length,
        suspendedUsers: users.filter((u) => u.isSuspended).length,
        flaggedUsers: users.filter((u) => u.isFlagged).length,
      },
      users,
    };

    let fileUrl: string;

    switch (params.format) {
      case 'excel':
        fileUrl = await this.generateUserExcelReport(reportData);
        break;
      case 'pdf':
        fileUrl = await this.generateUserPDFReport(reportData);
        break;
      case 'csv':
        fileUrl = await this.generateUserCSVReport(reportData);
        break;
      default:
        throw new Error('Unsupported format');
    }

    const report = await prisma.report.create({
      data: {
        reportType: 'CUSTOM',
        reportName: 'User Activity Report',
        startDate: params.startDate,
        endDate: params.endDate,
        data: reportData.summary,
        generatedBy: params.adminId,
        fileUrl,
      },
    });

    logger.info('User report generated', {
      reportId: report.id,
      format: params.format,
      adminId: params.adminId,
    });

    return {
      reportId: report.id,
      fileUrl,
      summary: reportData.summary,
    };
  }

  /**
   * Generate daily automated report
   */
  async generateDailyReport() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      newUsers,
      transactions,
      emailPayments,
      kycSubmissions,
      withdrawals,
      disputes,
    ] = await Promise.all([
      prisma.user.count({
        where: {
          createdAt: {
            gte: yesterday,
            lt: today,
          },
        },
      }),
      prisma.transaction.findMany({
        where: {
          createdAt: {
            gte: yesterday,
            lt: today,
          },
        },
      }),
      prisma.emailPayment.count({
        where: {
          createdAt: {
            gte: yesterday,
            lt: today,
          },
        },
      }),
      prisma.user.count({
        where: {
          kycSubmittedAt: {
            gte: yesterday,
            lt: today,
          },
        },
      }),
      prisma.withdrawal.count({
        where: {
          createdAt: {
            gte: yesterday,
            lt: today,
          },
        },
      }),
      prisma.dispute.count({
        where: {
          createdAt: {
            gte: yesterday,
            lt: today,
          },
        },
      }),
    ]);

    const reportData = {
      date: yesterday.toLocaleDateString(),
      metrics: {
        newUsers,
        totalTransactions: transactions.length,
        transactionVolume: transactions.reduce((sum, t) => sum + Number(t.amount), 0),
        successfulTransactions: transactions.filter((t) => t.status === 'COMPLETED')
          .length,
        failedTransactions: transactions.filter((t) => t.status === 'FAILED').length,
        emailPayments,
        kycSubmissions,
        withdrawals,
        newDisputes: disputes,
      },
    };

    // Save report
    const report = await prisma.report.create({
      data: {
        reportType: 'DAILY',
        reportName: `Daily Report - ${yesterday.toLocaleDateString()}`,
        startDate: yesterday,
        endDate: today,
        data: reportData,
        generatedBy: 'system',
      },
    });

    // Send email to admins
    await this.emailDailyReportToAdmins(reportData);

    logger.info('Daily report generated', {
      reportId: report.id,
      date: yesterday.toLocaleDateString(),
    });

    return report;
  }

  /**
   * Generate Excel report
   */
  private async generateExcelReport(data: any): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Transactions');

    // Add headers
    worksheet.columns = [
      { header: 'Transaction ID', key: 'id', width: 20 },
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Sender', key: 'sender', width: 25 },
      { header: 'Recipient', key: 'recipient', width: 25 },
      { header: 'Amount (USDC)', key: 'amount', width: 15 },
      { header: 'Fee', key: 'fee', width: 10 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Type', key: 'type', width: 15 },
    ];

    // Add data
    data.transactions.forEach((tx: any) => {
      worksheet.addRow({
        id: tx.id,
        date: tx.createdAt.toLocaleDateString(),
        sender: tx.sender?.email || 'N/A',
        recipient: tx.recipient?.email || tx.recipientEmail || 'N/A',
        amount: Number(tx.amount),
        fee: Number(tx.fee),
        status: tx.status,
        type: tx.transactionType,
      });
    });

    // Add summary sheet
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.addRow(['Report Summary']);
    summarySheet.addRow(['Period', data.period]);
    summarySheet.addRow(['Total Transactions', data.summary.totalTransactions]);
    summarySheet.addRow(['Total Volume', data.summary.totalVolume]);
    summarySheet.addRow(['Total Fees', data.summary.totalFees]);
    summarySheet.addRow(['Successful', data.summary.successfulTransactions]);
    summarySheet.addRow(['Failed', data.summary.failedTransactions]);

    // Save file
    const fileName = `transaction-report-${Date.now()}.xlsx`;
    const filePath = path.join(__dirname, '../../../reports', fileName);

    // Ensure directory exists
    if (!fs.existsSync(path.dirname(filePath))) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
    }

    await workbook.xlsx.writeFile(filePath);

    // In production, upload to S3 and return URL
    return `/reports/${fileName}`;
  }

  /**
   * Generate PDF report
   */
  private async generatePDFReport(data: any): Promise<string> {
    const doc = new PDFDocument();
    const fileName = `transaction-report-${Date.now()}.pdf`;
    const filePath = path.join(__dirname, '../../../reports', fileName);

    // Ensure directory exists
    if (!fs.existsSync(path.dirname(filePath))) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
    }

    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Title
    doc.fontSize(20).text('Transaction Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Period: ${data.period}`, { align: 'center' });
    doc.moveDown(2);

    // Summary
    doc.fontSize(16).text('Summary');
    doc.moveDown();
    doc.fontSize(12);
    doc.text(`Total Transactions: ${data.summary.totalTransactions}`);
    doc.text(`Total Volume: $${data.summary.totalVolume.toFixed(2)}`);
    doc.text(`Total Fees: $${data.summary.totalFees.toFixed(2)}`);
    doc.text(`Successful: ${data.summary.successfulTransactions}`);
    doc.text(`Failed: ${data.summary.failedTransactions}`);
    doc.moveDown(2);

    // Transaction table (simplified)
    doc.fontSize(16).text('Transactions');
    doc.moveDown();
    doc.fontSize(10);

    data.transactions.slice(0, 50).forEach((tx: any) => {
      doc.text(
        `${tx.createdAt.toLocaleDateString()} - ${tx.sender?.email || 'N/A'} → ${
          tx.recipient?.email || tx.recipientEmail || 'N/A'
        } - $${Number(tx.amount).toFixed(2)} - ${tx.status}`
      );
    });

    if (data.transactions.length > 50) {
      doc.moveDown();
      doc.text(`... and ${data.transactions.length - 50} more transactions`);
    }

    doc.end();

    return new Promise((resolve, reject) => {
      stream.on('finish', () => {
        resolve(`/reports/${fileName}`);
      });
      stream.on('error', reject);
    });
  }

  /**
   * Generate CSV report
   */
  private async generateCSVReport(data: any): Promise<string> {
    const fileName = `transaction-report-${Date.now()}.csv`;
    const filePath = path.join(__dirname, '../../../reports', fileName);

    // Ensure directory exists
    if (!fs.existsSync(path.dirname(filePath))) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
    }

    const headers = [
      'Transaction ID',
      'Date',
      'Sender',
      'Recipient',
      'Amount',
      'Fee',
      'Status',
      'Type',
    ];
    const rows = data.transactions.map((tx: any) => [
      tx.id,
      tx.createdAt.toISOString(),
      tx.sender?.email || 'N/A',
      tx.recipient?.email || tx.recipientEmail || 'N/A',
      Number(tx.amount),
      Number(tx.fee),
      tx.status,
      tx.transactionType,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row: any[]) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    fs.writeFileSync(filePath, csvContent);

    return `/reports/${fileName}`;
  }

  // Similar methods for user reports
  private async generateUserExcelReport(data: any): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Users');

    worksheet.columns = [
      { header: 'User ID', key: 'id', width: 20 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Full Name', key: 'fullName', width: 25 },
      { header: 'KYC Status', key: 'kycStatus', width: 15 },
      { header: 'Suspended', key: 'isSuspended', width: 12 },
      { header: 'Flagged', key: 'isFlagged', width: 12 },
      { header: 'Created At', key: 'createdAt', width: 15 },
    ];

    data.users.forEach((user: any) => {
      worksheet.addRow({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        kycStatus: user.kycStatus,
        isSuspended: user.isSuspended ? 'Yes' : 'No',
        isFlagged: user.isFlagged ? 'Yes' : 'No',
        createdAt: user.createdAt.toLocaleDateString(),
      });
    });

    const fileName = `user-report-${Date.now()}.xlsx`;
    const filePath = path.join(__dirname, '../../../reports', fileName);

    if (!fs.existsSync(path.dirname(filePath))) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
    }

    await workbook.xlsx.writeFile(filePath);
    return `/reports/${fileName}`;
  }

  private async generateUserPDFReport(data: any): Promise<string> {
    const doc = new PDFDocument();
    const fileName = `user-report-${Date.now()}.pdf`;
    const filePath = path.join(__dirname, '../../../reports', fileName);

    if (!fs.existsSync(path.dirname(filePath))) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
    }

    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    doc.fontSize(20).text('User Activity Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Period: ${data.period}`, { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(16).text('Summary');
    doc.moveDown();
    doc.fontSize(12);
    doc.text(`Total Users: ${data.summary.totalUsers}`);
    doc.text(`Verified Users: ${data.summary.verifiedUsers}`);
    doc.text(`Active Users: ${data.summary.activeUsers}`);
    doc.text(`Suspended Users: ${data.summary.suspendedUsers}`);
    doc.text(`Flagged Users: ${data.summary.flaggedUsers}`);

    doc.end();

    return new Promise((resolve, reject) => {
      stream.on('finish', () => resolve(`/reports/${fileName}`));
      stream.on('error', reject);
    });
  }

  private async generateUserCSVReport(data: any): Promise<string> {
    const fileName = `user-report-${Date.now()}.csv`;
    const filePath = path.join(__dirname, '../../../reports', fileName);

    if (!fs.existsSync(path.dirname(filePath))) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
    }

    const headers = [
      'User ID',
      'Email',
      'Full Name',
      'KYC Status',
      'Suspended',
      'Flagged',
      'Created At',
    ];
    const rows = data.users.map((user: any) => [
      user.id,
      user.email,
      user.fullName,
      user.kycStatus,
      user.isSuspended ? 'Yes' : 'No',
      user.isFlagged ? 'Yes' : 'No',
      user.createdAt.toISOString(),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row: any[]) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    fs.writeFileSync(filePath, csvContent);
    return `/reports/${fileName}`;
  }

  private async emailDailyReportToAdmins(reportData: any) {
    // Get all admins with report permission
    const admins = await prisma.admin.findMany({
      where: {
        isActive: true,
        permissions: {
          has: 'VIEW_REPORTS',
        },
      },
    });

    // TODO: Send email to each admin
    // Implementation with email service
    logger.info('Daily report email sent to admins', {
      adminCount: admins.length,
      date: reportData.date,
    });
  }
}

export default new AdminReportsService();
