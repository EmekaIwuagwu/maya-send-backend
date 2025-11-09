import { Response } from 'express';
import { AdminRequest } from '../../middleware/admin.middleware';

class AdminAuthController {
  async login(req: AdminRequest, res: Response) {
    res.status(501).json({ success: false, message: 'Not implemented yet' });
  }

  async logout(req: AdminRequest, res: Response) {
    res.status(501).json({ success: false, message: 'Not implemented yet' });
  }

  async refreshToken(req: AdminRequest, res: Response) {
    res.status(501).json({ success: false, message: 'Not implemented yet' });
  }

  async getProfile(req: AdminRequest, res: Response) {
    res.status(501).json({ success: false, message: 'Not implemented yet' });
  }
}

export default new AdminAuthController();
