import { Response } from 'express';
import { AdminRequest } from '../../middleware/admin.middleware';

class Controller {
  async handler(req: AdminRequest, res: Response) {
    res.status(501).json({ success: false, message: 'Not implemented yet' });
  }
}

export default new Controller();
