import express from 'express';
import * as authController from '../controllers/adultAuth.controller';
import { validateRequest } from '../middleware/validateRequest';
import { registerSchema, loginSchema } from '../schemas/adult.schemas';
import { authLimiter, loginLimiter } from '../middleware/rateLimiter';
import { verifyAdultJWT, requireAdultRole, requireAdultAge } from '../middleware/adultAuth';
import * as providerController from '../controllers/adultProviders.controller';
import * as creditsController from '../controllers/adultCredits.controller';
import * as roomsController from '../controllers/adultRooms.controller';
import * as messagesController from '../controllers/adultMessages.controller';
import * as camsController from '../controllers/adultCams.controller';
import { tipSchema, startStreamSchema } from '../schemas/adult.schemas';

const router = express.Router();

// Auth
router.post('/auth/register', authLimiter, validateRequest(registerSchema), authController.register);
router.get('/auth/verify-email', authController.verifyEmail);
router.post('/auth/login', loginLimiter, validateRequest(loginSchema), authController.login);
router.post('/auth/logout', authController.logout);
router.post('/auth/verify-age', verifyAdultJWT, authController.verifyAge);
router.get('/auth/me', verifyAdultJWT, authController.getMe);

// Providers
router.get('/providers', providerController.getProviders);
router.post('/providers/apply', verifyAdultJWT, providerController.applyAsProvider);
router.patch('/providers/:id/status', verifyAdultJWT, providerController.updateProviderStatus); // Admin check should be added

// Credits
router.get('/credits/balance', verifyAdultJWT, creditsController.getBalance);
router.get('/credits/history', verifyAdultJWT, creditsController.getHistory);
router.post('/credits/purchase', verifyAdultJWT, creditsController.purchaseCredits);
router.post('/credits/tip', verifyAdultJWT, requireAdultAge, validateRequest(tipSchema), creditsController.tip);

// Rooms
router.get('/rooms', verifyAdultJWT, roomsController.getRooms);
router.post('/rooms', verifyAdultJWT, requireAdultAge, roomsController.createRoom);
router.post('/rooms/:id/join', verifyAdultJWT, requireAdultAge, roomsController.joinRoom);

// Messages
router.get('/messages/conversations', verifyAdultJWT, requireAdultAge, messagesController.getConversations);
router.get('/messages/:conversationId', verifyAdultJWT, requireAdultAge, messagesController.getMessages);
router.post('/messages/send', verifyAdultJWT, requireAdultAge, messagesController.sendMessage);
router.post('/messages/:messageId/unlock', verifyAdultJWT, requireAdultAge, messagesController.unlockMedia);

// Cams
router.get('/cams', camsController.getCams);
router.post('/cams/stream/start', verifyAdultJWT, requireAdultRole('provider'), validateRequest(startStreamSchema), camsController.startStream);
router.patch('/cams/stream/:sessionId/end', verifyAdultJWT, camsController.endStream);
router.post('/cams/:sessionId/join', verifyAdultJWT, requireAdultAge, camsController.joinStream);

export default router;
