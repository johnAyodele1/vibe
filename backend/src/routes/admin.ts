import { Router } from 'express';
import { authenticateAdmin } from '../middleware/adminAuth';
import {
  adminLogin,
  getAnalytics,
  getAllReports,
  getAllUsers,
  adminAction,
  getViolations,
  updateViolationAction,
  getAdminDiamondRate,
  updateAdminDiamondRate,
  getAnalyticsOverview,
  getDailyUsers,
  getDailyEarnings,
  getEarningsBreakdown,
  getTopProviders,
  getUserRetention,
  getRecentTransactions,
} from '../controllers/admin.controller';
import {
  adminGetTasks,
  adminCreateTask,
  adminUpdateTask,
  adminDeleteTask,
  adminGetStats
} from '../controllers/adultRewards.controller';

const router = Router();

// Public route
router.post('/login', adminLogin);

// Protected admin routes
router.use(authenticateAdmin);

router.get('/analytics', getAnalytics);
router.get('/analytics/overview', getAnalyticsOverview);
router.get('/analytics/users/daily', getDailyUsers);
router.get('/analytics/earnings/daily', getDailyEarnings);
router.get('/analytics/earnings/breakdown', getEarningsBreakdown);
router.get('/analytics/providers/top', getTopProviders);
router.get('/analytics/users/retention', getUserRetention);
router.get('/analytics/transactions/recent', getRecentTransactions);
router.get('/reports', getAllReports);
router.get('/users', getAllUsers);
router.post('/action', adminAction);

router.get('/violations', getViolations);
router.put('/violations/:id/action', updateViolationAction);

router.get('/config/diamond-rate', getAdminDiamondRate);
router.put('/config/diamond-rate', updateAdminDiamondRate);

// Reward Tasks management routes
router.get('/rewards/tasks', adminGetTasks);
router.post('/rewards/tasks', adminCreateTask);
router.put('/rewards/tasks/:id', adminUpdateTask);
router.delete('/rewards/tasks/:id', adminDeleteTask);
router.get('/rewards/stats', adminGetStats);

export default router;
