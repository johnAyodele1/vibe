import { Router } from 'express';
import { authenticateAdmin } from '../middleware/adminAuth';
import {
  adminLogin,
  getAnalytics,
  getAllReports,
  getAllUsers,
  adminAction,
} from '../controllers/admin.controller';

const router = Router();

// Public route
router.post('/login', adminLogin);

// Protected admin routes
router.use(authenticateAdmin);

router.get('/analytics', getAnalytics);
router.get('/reports', getAllReports);
router.get('/users', getAllUsers);
router.post('/action', adminAction);

export default router;
