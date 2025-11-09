import { Response } from 'express';
import { AdminRequest } from '../../middleware/admin.middleware';
import { prisma } from '../../config/database';
import logger from '../../utils/logger';

class AdminSettingsController {
  /**
   * Get all system settings
   */
  async getSettings(req: AdminRequest, res: Response) {
    try {
      const { category } = req.query;

      const where: any = {};
      if (category) where.category = category as string;

      const settings = await prisma.setting.findMany({
        where,
        orderBy: {
          key: 'asc',
        },
      });

      // Group settings by category for easier frontend consumption
      const groupedSettings = settings.reduce((acc: any, setting) => {
        if (!acc[setting.category]) {
          acc[setting.category] = [];
        }
        acc[setting.category].push(setting);
        return acc;
      }, {});

      return res.status(200).json({
        success: true,
        data: {
          settings,
          grouped: groupedSettings,
        },
      });
    } catch (error: any) {
      logger.error('Get settings error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_SETTINGS_FAILED',
          message: 'Failed to fetch settings',
        },
      });
    }
  }

  /**
   * Update a specific setting
   */
  async updateSetting(req: AdminRequest, res: Response) {
    try {
      const { key } = req.params;
      const { value } = req.body;

      if (value === undefined) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_VALUE',
            message: 'Value is required',
          },
        });
      }

      // Check if setting exists
      const existingSetting = await prisma.setting.findUnique({
        where: { key },
      });

      if (!existingSetting) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'SETTING_NOT_FOUND',
            message: 'Setting not found',
          },
        });
      }

      // Validate value based on data type
      let parsedValue = value;
      try {
        if (existingSetting.dataType === 'number') {
          parsedValue = parseFloat(value);
          if (isNaN(parsedValue)) {
            throw new Error('Invalid number');
          }
        } else if (existingSetting.dataType === 'boolean') {
          if (typeof value === 'string') {
            parsedValue = value.toLowerCase() === 'true';
          } else {
            parsedValue = Boolean(value);
          }
        } else if (existingSetting.dataType === 'json') {
          parsedValue = typeof value === 'string' ? JSON.parse(value) : value;
        }
      } catch (parseError) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_VALUE_TYPE',
            message: `Value must be a valid ${existingSetting.dataType}`,
          },
        });
      }

      // Update setting
      const updatedSetting = await prisma.setting.update({
        where: { key },
        data: {
          value: parsedValue,
          updatedBy: req.admin!.id,
        },
      });

      logger.info('Setting updated', {
        key,
        oldValue: existingSetting.value,
        newValue: parsedValue,
        adminId: req.admin!.id,
        adminEmail: req.admin!.email,
      });

      return res.status(200).json({
        success: true,
        data: updatedSetting,
        message: 'Setting updated successfully',
      });
    } catch (error: any) {
      logger.error('Update setting error', { error: error.message });
      return res.status(500).json({
        success: false,
        error: {
          code: 'UPDATE_SETTING_FAILED',
          message: 'Failed to update setting',
        },
      });
    }
  }
}

export default new AdminSettingsController();
