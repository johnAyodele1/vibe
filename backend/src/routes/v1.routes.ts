import express from 'express';
import { getCountries, getStatesByCountry, getCities } from '../controllers/sharedLocation.controller';
import { verifyAdultJWT } from '../middleware/adultAuth';
import {
  getPresignedUrl,
  handleMockUpload,
  getMyProfile,
  updateProfile,
  updateServices,
  updatePricing,
  updateLocation,
  updatePayout,
  updateStatus,
  updatePhotos
} from '../controllers/providerOnboarding.controller';
import {
  getWallet,
  getBundles,
  getTransactions,
  createPurchaseIntent,
  simulateWebhookSuccess,
  getSubscriptionPlans
} from '../controllers/wallet.controller';
import {
  startConversation,
  getConversations,
  getMessages,
  sendMessage,
  unlockMedia,
  markAsRead
} from '../controllers/adultSext.controller';

const router = express.Router();

// Shared location routes (unprotected)
router.get('/shared/countries', getCountries);
router.get('/shared/countries/:code/states', getStatesByCountry);
router.get('/shared/cities', getCities);

// Media uploads simulation
router.get('/adult/media/presigned-url', verifyAdultJWT, getPresignedUrl);
router.put('/adult/media/upload-mock', handleMockUpload);

// Wallet & Subscription routes
router.get('/adult/wallet', verifyAdultJWT, getWallet);
router.get('/adult/wallet/bundles', getBundles);
router.get('/adult/wallet/transactions', verifyAdultJWT, getTransactions);
router.post('/adult/wallet/purchase/intent', verifyAdultJWT, createPurchaseIntent);
router.post('/adult/wallet/purchase/webhook', simulateWebhookSuccess);
router.get('/adult/subscriptions/plans', getSubscriptionPlans);

// Adult Sext Messaging routes
router.get('/adult/sext/conversations', verifyAdultJWT, getConversations);
router.post('/adult/sext/conversations/:userId/start', verifyAdultJWT, startConversation);
router.get('/adult/sext/conversations/:conversationId/messages', verifyAdultJWT, getMessages);
router.post('/adult/sext/messages/:conversationId', verifyAdultJWT, sendMessage);
router.post('/adult/sext/messages/:messageId/unlock', verifyAdultJWT, unlockMedia);
router.put('/adult/sext/conversations/:conversationId/read', verifyAdultJWT, markAsRead);

// Provider Onboarding & Profile update routes
router.get('/adult/providers/me', verifyAdultJWT, getMyProfile);
router.put('/adult/providers/me/profile', verifyAdultJWT, updateProfile);
router.put('/adult/providers/me/services', verifyAdultJWT, updateServices);
router.put('/adult/providers/me/pricing', verifyAdultJWT, updatePricing);
router.put('/adult/providers/me/location', verifyAdultJWT, updateLocation);
router.put('/adult/providers/me/payout', verifyAdultJWT, updatePayout);
router.put('/adult/providers/me/status', verifyAdultJWT, updateStatus);
router.put('/adult/providers/me/photos', verifyAdultJWT, updatePhotos);

export default router;
