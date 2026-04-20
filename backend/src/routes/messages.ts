import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import updateOnlineStatus from '../middleware/onlineStatus';
import {
  getConversations,
  getConversation,
  getMessages,
  sendMessage,
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

router.post('/', authenticateToken, updateOnlineStatus, sendMessage);

export default router;
