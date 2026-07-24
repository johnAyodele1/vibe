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
  directTip
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
  getGiftsCatalogue,
  sendGift,
  initiateCall,
  acceptCall,
  declineCall,
  endCall,
  getCallHistory,
  missedCall
} from '../controllers/adultSext.controller';
import { getRooms, createRoom as createAdultRoom, getRoom as getAdultRoom, joinRoom as joinAdultRoom, leaveRoom as leaveAdultRoom, getRoomMembers, getRoomLeaderboard, getThreads, createThread, getThread, reactThread, pinThread, lockThread, getMessages as getAdultRoomMessages, sendMessage as sendAdultRoomMessage, reactMessage as reactAdultRoomMessage, deleteMessage as deleteAdultRoomMessage, getReplies, postReply, reactReply, getActivePolls, createPoll, votePoll, reportRoom, muteUser, kickUser } from '../controllers/adultRooms.controller';

import { getZegoToken } from '../controllers/zego.controller';
import { joinMatchQueue, leaveMatchQueue, endMatchSession, nextStranger } from '../controllers/randomMatch.controller';

const router = express.Router();

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
router.get('/adult/media/presigned-url', verifyAdultJWT, getPresignedUrl);
router.put('/adult/media/upload-mock', handleMockUpload);

// Wallet & Subscription routes
router.get('/adult/wallet', verifyAdultJWT, getWallet);
router.get('/adult/wallet/bundles', getBundles);
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

// Gifts
router.get('/adult/gifts/catalogue', verifyAdultJWT, getGiftsCatalogue);
router.post('/adult/sext/conversations/:conversationId/send-gift', verifyAdultJWT, sendGift);

// Calls
router.post('/adult/sext/calls/initiate', verifyAdultJWT, initiateCall);
router.put('/adult/sext/calls/:callId/accept', verifyAdultJWT, acceptCall);
router.put('/adult/sext/calls/:callId/decline', verifyAdultJWT, declineCall);
router.put('/adult/sext/calls/:callId/missed', verifyAdultJWT, missedCall);
router.put('/adult/sext/calls/:callId/end', verifyAdultJWT, endCall);
router.get('/adult/sext/calls/history', verifyAdultJWT, getCallHistory);

// Provider Onboarding & Profile update routes
router.get('/adult/hookup/nearby', verifyAdultJWT, getHookupNearbyProviders);
router.get('/adult/profiles/me', verifyAdultJWT, getAdultMemberProfile);
router.get('/adult/providers/me/onboarding', verifyAdultJWT, getOnboardingProgress);
router.put('/adult/providers/me/onboarding/step/:stepNumber', verifyAdultJWT, saveOnboardingStep);
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
router.get('/adult/rooms', verifyAdultJWT, getRooms);
router.post('/adult/rooms', verifyAdultJWT, createAdultRoom);
router.get('/adult/rooms/:roomId', verifyAdultJWT, getAdultRoom);
router.post('/adult/rooms/:roomId/join', verifyAdultJWT, joinAdultRoom);
router.post('/adult/rooms/:roomId/leave', verifyAdultJWT, leaveAdultRoom);
router.get('/adult/rooms/:roomId/members', verifyAdultJWT, getRoomMembers);
router.get('/adult/rooms/:roomId/leaderboard', verifyAdultJWT, getRoomLeaderboard);

// Threads
router.get('/adult/rooms/:roomId/threads', verifyAdultJWT, getThreads);
router.post('/adult/rooms/:roomId/threads', verifyAdultJWT, createThread);
router.get('/adult/rooms/:roomId/threads/:threadId', verifyAdultJWT, getThread);
router.post('/adult/rooms/:roomId/threads/:threadId/react', verifyAdultJWT, reactThread);
router.put('/adult/rooms/:roomId/threads/:threadId/pin', verifyAdultJWT, pinThread);
router.put('/adult/rooms/:roomId/threads/:threadId/lock', verifyAdultJWT, lockThread);

// Messages (main feed)
router.get('/adult/rooms/:roomId/messages', verifyAdultJWT, getAdultRoomMessages);
router.post('/adult/rooms/:roomId/messages', verifyAdultJWT, sendAdultRoomMessage);
router.post('/adult/rooms/:roomId/messages/:messageId/react', verifyAdultJWT, reactAdultRoomMessage);
router.delete('/adult/rooms/:roomId/messages/:messageId', verifyAdultJWT, deleteAdultRoomMessage);

// Thread replies
router.get('/adult/rooms/:roomId/threads/:threadId/replies', verifyAdultJWT, getReplies);
router.post('/adult/rooms/:roomId/threads/:threadId/replies', verifyAdultJWT, postReply);
router.post('/adult/rooms/:roomId/threads/:threadId/replies/:replyId/react', verifyAdultJWT, reactReply);

// Polls
router.get('/adult/rooms/:roomId/polls/active', verifyAdultJWT, getActivePolls);
router.post('/adult/rooms/:roomId/polls', verifyAdultJWT, createPoll);
router.post('/adult/rooms/:roomId/polls/:pollId/vote', verifyAdultJWT, votePoll);

// Moderation
router.post('/adult/rooms/:roomId/report', verifyAdultJWT, reportRoom);
router.post('/adult/rooms/:roomId/members/:userId/mute', verifyAdultJWT, muteUser);
router.delete('/adult/rooms/:roomId/members/:userId', verifyAdultJWT, kickUser);

export default router;
