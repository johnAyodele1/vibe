import { Router } from 'express';
import multer from 'multer';
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
import { getReconciledAnalyticsOverview } from '../controllers/adminAccountingOverview.controller';
import { getAccountingSummary } from '../controllers/adminAccounting.controller';
import {
  adminGetTasks,
  adminCreateTask,
  adminUpdateTask,
  adminDeleteTask,
  adminGetStats
} from '../controllers/adultRewards.controller';
import {
  adminGetPayouts,
  adminVerifyPayout,
  adminProcessPayout,
  adminCompletePayout,
  adminRejectPayout,
  adminGetDisputes,
  resolveDispute,
  markRefundCompleted
} from '../controllers/payout.controller';
import {
  listErrors,
  getError,
  resolveError,
  clearResolvedErrors
} from '../controllers/adminErrors.controller';
import {
  adminCreateNotification,
  adminGetNotifications,
  adminGetSupportQueue,
  adminGetSupportMessages,
  adminReplySupportMessage,
  adminManageSupportTags,
  updateOfficialChannelsConfig,
  getOfficialChannelsConfig,
  adminUploadChannelAvatar
} from '../controllers/officialSupport.controller';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const router = Router();

router.post('/login', adminLogin);
router.use(authenticateAdmin);

router.get('/analytics', getAnalytics);
router.get('/analytics/overview', getReconciledAnalyticsOverview);
router.get('/analytics/accounting', getAccountingSummary);
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

router.get('/rewards/tasks', adminGetTasks);
router.post('/rewards/tasks', adminCreateTask);
router.put('/rewards/tasks/:id', adminUpdateTask);
router.delete('/rewards/tasks/:id', adminDeleteTask);
router.get('/rewards/stats', adminGetStats);

router.get('/payouts', adminGetPayouts);
router.put('/payouts/:requestId/verify', adminVerifyPayout);
router.put('/payouts/:requestId/process', adminProcessPayout);
router.put('/payouts/:requestId/complete', adminCompletePayout);
router.put('/payouts/:requestId/reject', adminRejectPayout);

router.get('/disputes', adminGetDisputes);
router.put('/disputes/:reportId/resolve', resolveDispute);
router.put('/disputes/:reportId/refund-complete', markRefundCompleted);

router.post('/official-notifications', adminCreateNotification);
router.get('/official-notifications', adminGetNotifications);
router.get('/support/conversations', adminGetSupportQueue);
router.get('/support/conversations/:conversationId/messages', adminGetSupportMessages);
router.post('/support/conversations/:conversationId/messages', adminReplySupportMessage);
router.put('/support/conversations/:conversationId/tags', adminManageSupportTags);
router.get('/official-channels/config', getOfficialChannelsConfig);
router.put('/official-channels/config', updateOfficialChannelsConfig);
router.post('/official-channels/upload-avatar', upload.single('file'), adminUploadChannelAvatar);

router.get('/errors', listErrors);
router.get('/errors/:errorId', getError);
router.put('/errors/:errorId/resolve', resolveError);
router.delete('/errors/resolved', clearResolvedErrors);

export default router;
