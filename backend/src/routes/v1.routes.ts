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
  updatePhotos,
  updateSchedule,
  getProviderDashboard,
  getProviderEarnings,
  requestPayout
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
  markAsRead,
  getConversationById,
  deleteConversation,
  muteConversation,
  deleteMessage,
  reactMessage,
  requestPhoto,
  fulfillPhotoRequest,
  declinePhotoRequest,
  getGiftsCatalogue,
  sendGift,
  initiateCall,
  acceptCall,
  declineCall,
  endCall,
  getCallHistory
} from '../controllers/adultSext.controller';
import * as roomsController from '../controllers/adultRooms.controller';

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
router.post('/adult/sext/conversations', verifyAdultJWT, startConversation);
router.post('/adult/sext/conversations/:userId/start', verifyAdultJWT, startConversation);
router.get('/adult/sext/conversations/:conversationId', verifyAdultJWT, getConversationById);
router.delete('/adult/sext/conversations/:conversationId', verifyAdultJWT, deleteConversation);
router.put('/adult/sext/conversations/:conversationId/mute', verifyAdultJWT, muteConversation);
router.get('/adult/sext/conversations/:conversationId/messages', verifyAdultJWT, getMessages);
router.post('/adult/sext/messages/:conversationId', verifyAdultJWT, sendMessage);
router.delete('/adult/sext/messages/:messageId', verifyAdultJWT, deleteMessage);
router.post('/adult/sext/messages/:messageId/react', verifyAdultJWT, reactMessage);
router.post('/adult/sext/messages/:messageId/unlock', verifyAdultJWT, unlockMedia);
router.put('/adult/sext/conversations/:conversationId/read', verifyAdultJWT, markAsRead);

// Photo Requests
router.post('/adult/sext/conversations/:conversationId/request-photo', verifyAdultJWT, requestPhoto);
router.put('/adult/sext/photo-requests/:messageId/fulfill', verifyAdultJWT, fulfillPhotoRequest);
router.put('/adult/sext/photo-requests/:messageId/decline', verifyAdultJWT, declinePhotoRequest);

// Gifts
router.get('/adult/gifts/catalogue', verifyAdultJWT, getGiftsCatalogue);
router.post('/adult/sext/conversations/:conversationId/send-gift', verifyAdultJWT, sendGift);

// Calls
router.post('/adult/sext/calls/initiate', verifyAdultJWT, initiateCall);
router.put('/adult/sext/calls/:callId/accept', verifyAdultJWT, acceptCall);
router.put('/adult/sext/calls/:callId/decline', verifyAdultJWT, declineCall);
router.put('/adult/sext/calls/:callId/end', verifyAdultJWT, endCall);
router.get('/adult/sext/calls/history', verifyAdultJWT, getCallHistory);

// Provider Onboarding & Profile update routes
router.get('/adult/providers/me', verifyAdultJWT, getMyProfile);
router.get('/adult/providers/me/dashboard', verifyAdultJWT, getProviderDashboard);
router.get('/adult/providers/me/earnings', verifyAdultJWT, getProviderEarnings);
router.post('/adult/providers/me/payout', verifyAdultJWT, requestPayout);
router.put('/adult/providers/me/profile', verifyAdultJWT, updateProfile);
router.put('/adult/providers/me/services', verifyAdultJWT, updateServices);
router.put('/adult/providers/me/pricing', verifyAdultJWT, updatePricing);
router.put('/adult/providers/me/location', verifyAdultJWT, updateLocation);
router.put('/adult/providers/me/payout', verifyAdultJWT, updatePayout);
router.put('/adult/providers/me/status', verifyAdultJWT, updateStatus);
router.put('/adult/providers/me/photos', verifyAdultJWT, updatePhotos);
router.put('/adult/providers/me/schedule', verifyAdultJWT, updateSchedule);

// Naughty Rooms API
router.get('/adult/rooms', verifyAdultJWT, roomsController.getRooms);
router.post('/adult/rooms', verifyAdultJWT, roomsController.createRoom);
router.get('/adult/rooms/:roomId', verifyAdultJWT, roomsController.getRoom);
router.post('/adult/rooms/:roomId/join', verifyAdultJWT, roomsController.joinRoom);
router.post('/adult/rooms/:roomId/leave', verifyAdultJWT, roomsController.leaveRoom);
router.get('/adult/rooms/:roomId/members', verifyAdultJWT, roomsController.getRoomMembers);
router.get('/adult/rooms/:roomId/leaderboard', verifyAdultJWT, roomsController.getRoomLeaderboard);

// Threads
router.get('/adult/rooms/:roomId/threads', verifyAdultJWT, roomsController.getThreads);
router.post('/adult/rooms/:roomId/threads', verifyAdultJWT, roomsController.createThread);
router.get('/adult/rooms/:roomId/threads/:threadId', verifyAdultJWT, roomsController.getThread);
router.post('/adult/rooms/:roomId/threads/:threadId/react', verifyAdultJWT, roomsController.reactThread);
router.put('/adult/rooms/:roomId/threads/:threadId/pin', verifyAdultJWT, roomsController.pinThread);
router.put('/adult/rooms/:roomId/threads/:threadId/lock', verifyAdultJWT, roomsController.lockThread);

// Messages (main feed)
router.get('/adult/rooms/:roomId/messages', verifyAdultJWT, roomsController.getMessages);
router.post('/adult/rooms/:roomId/messages', verifyAdultJWT, roomsController.sendMessage);
router.post('/adult/rooms/:roomId/messages/:messageId/react', verifyAdultJWT, roomsController.reactMessage);
router.delete('/adult/rooms/:roomId/messages/:messageId', verifyAdultJWT, roomsController.deleteMessage);

// Thread replies
router.get('/adult/rooms/:roomId/threads/:threadId/replies', verifyAdultJWT, roomsController.getReplies);
router.post('/adult/rooms/:roomId/threads/:threadId/replies', verifyAdultJWT, roomsController.postReply);
router.post('/adult/rooms/:roomId/threads/:threadId/replies/:replyId/react', verifyAdultJWT, roomsController.reactReply);

// Polls
router.get('/adult/rooms/:roomId/polls/active', verifyAdultJWT, roomsController.getActivePolls);
router.post('/adult/rooms/:roomId/polls', verifyAdultJWT, roomsController.createPoll);
router.post('/adult/rooms/:roomId/polls/:pollId/vote', verifyAdultJWT, roomsController.votePoll);

// Moderation
router.post('/adult/rooms/:roomId/report', verifyAdultJWT, roomsController.reportRoom);
router.post('/adult/rooms/:roomId/members/:userId/mute', verifyAdultJWT, roomsController.muteUser);
router.delete('/adult/rooms/:roomId/members/:userId', verifyAdultJWT, roomsController.kickUser);

export default router;
