import express from 'express';
import { getCountries, getStatesByCountry, getCities } from '../controllers/sharedLocation.controller';
import { verifyAdultJWT, optionalAdultJWT } from '../middleware/adultAuth';
import multer from 'multer';
import {
  getPresignedUrl,
  handleMockUpload,
  uploadMedia,
  getMyProfile,
  updateProfile,
  updateServices,
  updatePricing,
  updateLocation,
  updatePayout,
  updatePhotos,
  updateSchedule,
  getProviderDashboard,
  getProviderEarnings,
  requestPayout,
  getOnboardingProgress,
  saveOnboardingStep,
  getHookupNearbyProviders,
  getAdultMemberProfile
} from '../controllers/providerOnboarding.controller';
import {
  getWallet,
  getBundles,
  getTransactions,
  createPurchaseIntent,
  simulateWebhookSuccess,
  getSubscriptionPlans,
  directTip,
  getDiamondRate
} from '../controllers/wallet.controller';
import {
  startConversation,
  getConversations,
  getMessages as getSextMessages,
  sendMessage as sendSextMessage,
  unlockMedia,
  markAsRead,
  getConversationById,
  deleteConversation,
  muteConversation,
  deleteMessage as deleteSextMessage,
  reactMessage as reactSextMessage,
  requestPhoto,
  fulfillPhotoRequest,
  declinePhotoRequest,
  requestService,
  fulfillServiceTonightRequest,
  declineServiceTonightRequest,
  getGiftsCatalogue,
  sendGift,
  initiateCall,
  acceptCall,
  declineCall,
  endCall,
  getCallHistory,
  missedCall,
  sendGiftRequest,
  sendServiceRequest,
  getTonightRate,
  payServiceRequest,
  completeServiceRequest,
  reportServiceRequest,
  declineServiceRequest,
  dismissGiftRequest,
  fulfillGiftRequest
} from '../controllers/adultSext.controller';
import { getRooms, createRoom as createAdultRoom, getRoom as getAdultRoom, joinRoom as joinAdultRoom, leaveRoom as leaveAdultRoom, getRoomMembers, getRoomLeaderboard, getThreads, createThread, getThread, reactThread, pinThread, lockThread, getMessages as getAdultRoomMessages, sendMessage as sendAdultRoomMessage, reactMessage as reactAdultRoomMessage, deleteMessage as deleteAdultRoomMessage, getReplies, postReply, reactReply, getActivePolls, createPoll, votePoll, reportRoom, muteUser, kickUser } from '../controllers/adultRooms.controller';

import { getProviderPublicProfile, unlockProviderPhoto } from '../controllers/adultProviders.controller';
import { getUserTasks, completeTask, dailyCheckin } from '../controllers/adultRewards.controller';
import {
  getProviderWheel,
  updateProviderWheel,
  spinProviderWheel,
  getProviderWheelStats
} from '../controllers/adultWheel.controller';

import { getZegoToken } from '../controllers/zego.controller';
import { joinMatchQueue, leaveMatchQueue, endMatchSession, nextStranger } from '../controllers/randomMatch.controller';

import { trackDailyActive } from '../middleware/trackDailyActive';

const router = express.Router();
router.use(trackDailyActive);

// Zego Token Route
router.get('/adult/zego/token', verifyAdultJWT, getZegoToken);

// Random Stranger Matching Routes
router.post('/adult/random/queue', verifyAdultJWT, joinMatchQueue);
router.delete('/adult/random/queue', verifyAdultJWT, leaveMatchQueue);
router.post('/adult/random/:matchId/next', verifyAdultJWT, nextStranger);
router.post('/adult/random/:matchId/end', verifyAdultJWT, endMatchSession);

// Shared location routes (unprotected)
router.get('/shared/countries', getCountries);
router.get('/shared/countries/:code/states', getStatesByCountry);
router.get('/shared/cities', getCities);

// Media uploads simulation
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit for video upload support
});

router.get('/adult/media/presigned-url', verifyAdultJWT, getPresignedUrl);
router.put('/adult/media/upload-mock', handleMockUpload);
router.post('/adult/media/upload', verifyAdultJWT, upload.single('file'), uploadMedia);

// Wallet & Subscription routes
router.get('/adult/wallet', verifyAdultJWT, getWallet);
router.get('/adult/wallet/bundles', getBundles);
router.get('/adult/config/diamond-rate', getDiamondRate);
router.get('/adult/wallet/transactions', verifyAdultJWT, getTransactions);
router.post('/adult/wallet/purchase/intent', verifyAdultJWT, createPurchaseIntent);
router.post('/adult/wallet/purchase/webhook', simulateWebhookSuccess);
router.get('/adult/subscriptions/plans', getSubscriptionPlans);
router.post('/adult/wallet/tip', verifyAdultJWT, directTip);

// Adult Sext Messaging routes
router.get('/adult/sext/conversations', verifyAdultJWT, getConversations);
router.post('/adult/sext/conversations', verifyAdultJWT, startConversation);
router.post('/adult/sext/conversations/:userId/start', verifyAdultJWT, startConversation);
router.get('/adult/sext/conversations/:conversationId', verifyAdultJWT, getConversationById);
router.delete('/adult/sext/conversations/:conversationId', verifyAdultJWT, deleteConversation);
router.put('/adult/sext/conversations/:conversationId/mute', verifyAdultJWT, muteConversation);
router.get('/adult/sext/conversations/:conversationId/messages', verifyAdultJWT, getSextMessages);
router.post('/adult/sext/messages/:conversationId', verifyAdultJWT, sendSextMessage);
router.delete('/adult/sext/messages/:messageId', verifyAdultJWT, deleteSextMessage);
router.post('/adult/sext/messages/:messageId/react', verifyAdultJWT, reactSextMessage);
router.post('/adult/sext/messages/:messageId/unlock', verifyAdultJWT, unlockMedia);
router.put('/adult/sext/conversations/:conversationId/read', verifyAdultJWT, markAsRead);

// Photo Requests
router.post('/adult/sext/conversations/:conversationId/request-photo', verifyAdultJWT, requestPhoto);
router.put('/adult/sext/photo-requests/:messageId/fulfill', verifyAdultJWT, fulfillPhotoRequest);
router.put('/adult/sext/photo-requests/:messageId/decline', verifyAdultJWT, declinePhotoRequest);

// Service Tonight Requests (Member requested)
router.post('/adult/sext/conversations/:conversationId/request-service', verifyAdultJWT, requestService);
router.put('/adult/sext/service-tonight-requests/:messageId/fulfill', verifyAdultJWT, fulfillServiceTonightRequest);
router.put('/adult/sext/service-tonight-requests/:messageId/decline', verifyAdultJWT, declineServiceTonightRequest);

// Gifts
router.get('/adult/gifts/catalogue', verifyAdultJWT, getGiftsCatalogue);
router.post('/adult/sext/conversations/:conversationId/send-gift', verifyAdultJWT, sendGift);
router.post('/adult/sext/conversations/:conversationId/gift-request', verifyAdultJWT, sendGiftRequest);
router.post('/adult/sext/gift-requests/:messageId/dismiss', verifyAdultJWT, dismissGiftRequest);
router.post('/adult/sext/gift-requests/:messageId/fulfill', verifyAdultJWT, fulfillGiftRequest);

// Service Charges
router.post('/adult/sext/conversations/:conversationId/service-request', verifyAdultJWT, sendServiceRequest);
router.get('/adult/providers/me/tonight-rate', verifyAdultJWT, getTonightRate);
router.post('/adult/sext/service-requests/:messageId/pay', verifyAdultJWT, payServiceRequest);
router.post('/adult/sext/service-requests/:messageId/complete', verifyAdultJWT, completeServiceRequest);
router.post('/adult/sext/service-requests/:messageId/report', verifyAdultJWT, reportServiceRequest);
router.post('/adult/sext/service-requests/:messageId/decline', verifyAdultJWT, declineServiceRequest);

// Calls
router.post('/adult/sext/calls/initiate', verifyAdultJWT, initiateCall);
router.put('/adult/sext/calls/:callId/accept', verifyAdultJWT, acceptCall);
router.put('/adult/sext/calls/:callId/decline', verifyAdultJWT, declineCall);
router.put('/adult/sext/calls/:callId/missed', verifyAdultJWT, missedCall);
router.put('/adult/sext/calls/:callId/end', verifyAdultJWT, endCall);
router.get('/adult/sext/calls/history', verifyAdultJWT, getCallHistory);

// Provider Onboarding & Profile update routes
router.get('/adult/hookup/nearby', optionalAdultJWT, getHookupNearbyProviders);
router.get('/adult/profiles/me', verifyAdultJWT, getAdultMemberProfile);

// Rewards system routes
router.get('/adult/rewards/tasks', verifyAdultJWT, getUserTasks);
router.post('/adult/rewards/tasks/:taskId/complete', verifyAdultJWT, completeTask);
router.post('/adult/rewards/checkin', verifyAdultJWT, dailyCheckin);

// Provider specific /me routes (defined first to prevent route parameter hijacking)
router.get('/adult/providers/me/onboarding', verifyAdultJWT, getOnboardingProgress);
router.put('/adult/providers/me/onboarding/step/:stepNumber', verifyAdultJWT, saveOnboardingStep);
router.get('/adult/providers/me/dashboard', verifyAdultJWT, getProviderDashboard);
router.get('/adult/providers/me/earnings', verifyAdultJWT, getProviderEarnings);
router.post('/adult/providers/me/payout', verifyAdultJWT, requestPayout);
router.get('/adult/providers/me/wheel/stats', verifyAdultJWT, getProviderWheelStats);
router.put('/adult/providers/me/wheel', verifyAdultJWT, updateProviderWheel);
router.put('/adult/providers/me/profile', verifyAdultJWT, updateProfile);
router.put('/adult/providers/me/services', verifyAdultJWT, updateServices);
router.put('/adult/providers/me/pricing', verifyAdultJWT, updatePricing);
router.put('/adult/providers/me/location', verifyAdultJWT, updateLocation);
router.put('/adult/providers/me/payout', verifyAdultJWT, updatePayout);
router.put('/adult/providers/me/photos', verifyAdultJWT, updatePhotos);
router.put('/adult/providers/me/schedule', verifyAdultJWT, updateSchedule);
router.get('/adult/providers/me', verifyAdultJWT, getMyProfile);

// Parameterized Provider Routes (must be defined after specific static routes)
router.get('/adult/providers/:providerId', verifyAdultJWT, getProviderPublicProfile);
router.post('/adult/providers/:providerId/photos/:photoIndex/unlock', verifyAdultJWT, unlockProviderPhoto);
router.get('/adult/providers/:providerId/wheel', verifyAdultJWT, getProviderWheel);
router.post('/adult/providers/:providerId/wheel/spin', verifyAdultJWT, spinProviderWheel);

// Naughty Rooms API
router.get('/adult/rooms', optionalAdultJWT, getRooms);
router.post('/adult/rooms', verifyAdultJWT, createAdultRoom);
router.get('/adult/rooms/:roomId', optionalAdultJWT, getAdultRoom);
router.post('/adult/rooms/:roomId/join', verifyAdultJWT, joinAdultRoom);
router.post('/adult/rooms/:roomId/leave', verifyAdultJWT, leaveAdultRoom);
router.get('/adult/rooms/:roomId/members', optionalAdultJWT, getRoomMembers);
router.get('/adult/rooms/:roomId/leaderboard', optionalAdultJWT, getRoomLeaderboard);

// Threads
router.get('/adult/rooms/:roomId/threads', optionalAdultJWT, getThreads);
router.post('/adult/rooms/:roomId/threads', verifyAdultJWT, createThread);
router.get('/adult/rooms/:roomId/threads/:threadId', optionalAdultJWT, getThread);
router.post('/adult/rooms/:roomId/threads/:threadId/react', verifyAdultJWT, reactThread);
router.put('/adult/rooms/:roomId/threads/:threadId/pin', verifyAdultJWT, pinThread);
router.put('/adult/rooms/:roomId/threads/:threadId/lock', verifyAdultJWT, lockThread);

// Messages (main feed)
router.get('/adult/rooms/:roomId/messages', optionalAdultJWT, getAdultRoomMessages);
router.post('/adult/rooms/:roomId/messages', verifyAdultJWT, sendAdultRoomMessage);
router.post('/adult/rooms/:roomId/messages/:messageId/react', verifyAdultJWT, reactAdultRoomMessage);
router.delete('/adult/rooms/:roomId/messages/:messageId', verifyAdultJWT, deleteAdultRoomMessage);

// Thread replies
router.get('/adult/rooms/:roomId/threads/:threadId/replies', optionalAdultJWT, getReplies);
router.post('/adult/rooms/:roomId/threads/:threadId/replies', verifyAdultJWT, postReply);
router.post('/adult/rooms/:roomId/threads/:threadId/replies/:replyId/react', verifyAdultJWT, reactReply);

// Polls
router.get('/adult/rooms/:roomId/polls/active', optionalAdultJWT, getActivePolls);
router.post('/adult/rooms/:roomId/polls', verifyAdultJWT, createPoll);
router.post('/adult/rooms/:roomId/polls/:pollId/vote', verifyAdultJWT, votePoll);

// Moderation
router.post('/adult/rooms/:roomId/report', verifyAdultJWT, reportRoom);
router.post('/adult/rooms/:roomId/members/:userId/mute', verifyAdultJWT, muteUser);
router.delete('/adult/rooms/:roomId/members/:userId', verifyAdultJWT, kickUser);

export default router;
