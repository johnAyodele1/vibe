import express from 'express';
import multer from 'multer';
import * as authController from '../controllers/adultAuth.controller';
import * as uploadController from '../controllers/adultUpload.controller';
import { validateRequest } from '../middleware/validateRequest';
import {
  registerSchema,
  loginSchema,
  verifyEmailQuerySchema,
  applyAsProviderSchema,
  updateProviderProfileSchema,
  updateProviderStatusSchema,
  purchaseCreditsSchema,
  tipSchema,
  subscribeSchema,
  createRoomSchema,
  sendMessageSchema,
  startStreamSchema
} from '../schemas/adult.schemas';
import { authLimiter, loginLimiter } from '../middleware/rateLimiter';
import { verifyAdultJWT, optionalAdultJWT, requireAdultRole, requireAdultAge } from '../middleware/adultAuth';
import * as providerController from '../controllers/adultProviders.controller';
import * as creditsController from '../controllers/adultCredits.controller';
import { getRooms, createRoom, joinRoom } from '../controllers/adultRooms.controller';
import * as messagesController from '../controllers/adultMessages.controller';
import * as camsController from '../controllers/adultCams.controller';

const router = express.Router();

// Auth
router.post('/auth/register', authLimiter, validateRequest(registerSchema), authController.register);
router.get('/auth/verify-email', validateRequest(verifyEmailQuerySchema), authController.verifyEmail);
router.post('/auth/login', loginLimiter, validateRequest(loginSchema), authController.login);
router.post('/auth/logout', authController.logout);
router.post('/auth/verify-age', verifyAdultJWT, authController.verifyAge);
router.get('/auth/me', verifyAdultJWT, authController.getMe);

// Providers
router.get('/providers', providerController.getProviders);
router.post('/providers/apply', verifyAdultJWT, validateRequest(applyAsProviderSchema), providerController.applyAsProvider);
router.patch('/providers/profile', verifyAdultJWT, validateRequest(updateProviderProfileSchema), providerController.updateProviderProfile);
router.patch('/providers/:id/status', verifyAdultJWT, validateRequest(updateProviderStatusSchema), providerController.updateProviderStatus); // Admin check should be added

// Credits
router.get('/credits/balance', verifyAdultJWT, creditsController.getBalance);
router.get('/credits/history', verifyAdultJWT, creditsController.getHistory);
router.post('/credits/purchase', verifyAdultJWT, validateRequest(purchaseCreditsSchema), creditsController.purchaseCredits);
router.post('/credits/tip', verifyAdultJWT, requireAdultAge, validateRequest(tipSchema), creditsController.tip);
router.post('/credits/subscribe', verifyAdultJWT, validateRequest(subscribeSchema), creditsController.subscribeToTier);

// Rooms
router.get('/rooms', optionalAdultJWT, getRooms);
router.post('/rooms', verifyAdultJWT, requireAdultAge, validateRequest(createRoomSchema), createRoom);
router.post('/rooms/:id/join', verifyAdultJWT, requireAdultAge, joinRoom);

// Messages
router.get('/messages/conversations', verifyAdultJWT, requireAdultAge, messagesController.getConversations);
router.get('/messages/:conversationId', verifyAdultJWT, requireAdultAge, messagesController.getMessages);
router.post('/messages/send', verifyAdultJWT, requireAdultAge, validateRequest(sendMessageSchema), messagesController.sendMessage);
router.post('/messages/:messageId/unlock', verifyAdultJWT, requireAdultAge, messagesController.unlockMedia);

// Multer Configuration for Adult Zone Media
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800'), // 50MB default for video support
  },
  fileFilter: (req, file, cb) => {
    const isImage = /jpeg|jpg|png|gif|webp/.test(file.mimetype) || /jpeg|jpg|png|gif|webp/.test(file.originalname.toLowerCase());
    const isVideo = /mp4|webm|quicktime|ogg/.test(file.mimetype) || /mp4|webm|mov|ogg/.test(file.originalname.toLowerCase());

    if (isImage || isVideo) {
      return cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed!'));
    }
  },
});

// Cams
router.get('/cams', camsController.getCams);
router.post('/cams/stream/start', verifyAdultJWT, requireAdultRole('provider'), validateRequest(startStreamSchema), camsController.startStream);
router.patch('/cams/stream/:sessionId/end', verifyAdultJWT, camsController.endStream);
router.post('/cams/:sessionId/join', verifyAdultJWT, requireAdultAge, camsController.joinStream);
router.get('/cams/:sessionId/token', optionalAdultJWT, camsController.getCamViewerToken);

// Uploads
router.post('/upload/photo', verifyAdultJWT, upload.single('photo'), uploadController.uploadAdultPhoto);
router.post('/upload/video', verifyAdultJWT, upload.single('video'), uploadController.uploadAdultVideo);

export default router;
