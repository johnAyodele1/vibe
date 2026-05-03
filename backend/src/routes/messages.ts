import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import updateOnlineStatus from '../middleware/onlineStatus';
import {
  getConversations,
  getConversation,
  getMessages,
  sendMessage,
  markAsRead,
} from '../controllers/message.controller';

const router = Router();

router.get(
  '/conversations',
  authenticateToken,
  updateOnlineStatus,
  getConversations,
);

router.get(
  '/conversation/:conversationId',
  authenticateToken,
  updateOnlineStatus,
  getConversation,
);

router.get(
  '/:conversationId',
  authenticateToken,
  updateOnlineStatus,
  getMessages,
);

router.put(
  '/conversations/:conversationId/read',
  authenticateToken,
  updateOnlineStatus,
  markAsRead,
);

router.post('/', authenticateToken, updateOnlineStatus, sendMessage);

export default router;
