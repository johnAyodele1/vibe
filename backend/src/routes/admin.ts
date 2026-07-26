import { Router } from 'express';
import { authenticateAdmin } from '../middleware/adminAuth';
import {
  adminLogin,
  getAnalytics,
  getAllReports,
  getAllUsers,
  adminAction,
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
router.get('/reports', getAllReports);
router.get('/users', getAllUsers);
router.post('/action', adminAction);

// Reward Tasks management routes
router.get('/rewards/tasks', adminGetTasks);
router.post('/rewards/tasks', adminCreateTask);
router.put('/rewards/tasks/:id', adminUpdateTask);
router.delete('/rewards/tasks/:id', adminDeleteTask);
router.get('/rewards/stats', adminGetStats);

export default router;
