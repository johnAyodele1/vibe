import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import updateOnlineStatus from '../middleware/onlineStatus';
import {
  getProfile,
  updateProfile,
  discover,
  deleteAccount,
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
router.get('/discover', authenticateToken, updateOnlineStatus, discover);
router.get('/favourites', authenticateToken, updateOnlineStatus, getFavourites);
router.delete('/account', authenticateToken, updateOnlineStatus, deleteAccount);

router.post('/:id/super-like', authenticateToken, updateOnlineStatus, superLike);
router.post('/:id/like', authenticateToken, updateOnlineStatus, like);
router.post('/:id/dislike', authenticateToken, updateOnlineStatus, dislike);

export default router;
