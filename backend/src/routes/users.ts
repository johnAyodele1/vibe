import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import updateOnlineStatus from '../middleware/onlineStatus';
import {
  getProfile,
  updateProfile,
  discover,
  deleteAccount,
  getUserById,
  blockUser,
  reportUser,
  updatePushToken,
  updateLocation,
} from '../controllers/user.controller';
import {
  like,
  dislike,
  superLike,
  getFavourites,
} from '../controllers/interaction.controller';

const router = Router();

router.get('/profile', authenticateToken, updateOnlineStatus, getProfile);
router.put('/profile', authenticateToken, updateOnlineStatus, updateProfile);
router.post('/push-token', authenticateToken, updateOnlineStatus, updatePushToken);
router.put('/location', authenticateToken, updateOnlineStatus, updateLocation);
router.get('/discover', authenticateToken, updateOnlineStatus, discover);
router.get('/favourites', authenticateToken, updateOnlineStatus, getFavourites);
router.delete('/account', authenticateToken, updateOnlineStatus, deleteAccount);

router.get('/:id', authenticateToken, updateOnlineStatus, getUserById);
router.post('/:id/block', authenticateToken, updateOnlineStatus, blockUser);
router.post('/:id/report', authenticateToken, updateOnlineStatus, reportUser);

router.post('/:id/super-like', authenticateToken, updateOnlineStatus, superLike);
router.post('/:id/like', authenticateToken, updateOnlineStatus, like);
router.post('/:id/dislike', authenticateToken, updateOnlineStatus, dislike);

export default router;
