import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { detectContactSharing } from '@yourapp/content-filter';
import ContentViolation from '../models/ContentViolation';
import AdultUser from '../models/AdultUser';
import AdultMessage from '../models/AdultMessage';
import AdultConversation from '../models/AdultConversation';
import AdultCall from '../models/AdultCall';
import AdultGift from '../models/AdultGift';
import CreditTransaction from '../models/CreditTransaction';
import { encrypt, decrypt } from '../services/encryptionService';
import { getClientPrice } from '../services/pricingService';
import { calculateFees, recordPlatformEarning } from '../shared/fees';
import { getSignedUrl } from '../shared/media/cloudinaryUpload';

// Backwards compatibility startConversation route
export const startConversation = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const recipientId = req.params.userId || req.body.recipientId;
    if (!recipientId) {
      return res.status(400).json({ success: false, error: 'Recipient userId/recipientId is required' });
    }

    const recipient = await AdultUser.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({ success: false, error: 'Recipient not found' });
    }

    const conversationId = [user._id.toString(), recipientId.toString()].sort().join('_');

    // Find or create conversation
    let conversation = await AdultConversation.findById(conversationId);
    const isNew = !conversation;

    if (!conversation) {
      conversation = new AdultConversation({
        _id: conversationId,
        participants: [user._id, recipient._id],
        participantProfiles: [
          {
            userId: user._id,
            displayName: user.displayName || user.username,
            avatarUrl: user.profilePhoto || '/placeholder.svg',
            accountType: user.role === 'provider' ? 'provider' : 'member',
            isOnline: user.role === 'provider' ? (user.providerProfile?.isOnline || false) : (user.isOnline || false),
          },
          {
            userId: recipient._id,
            displayName: recipient.providerProfile?.stageName || recipient.displayName || recipient.username,
            avatarUrl: recipient.profilePhoto || '/placeholder.svg',
            accountType: recipient.role === 'provider' ? 'provider' : 'member',
            isOnline: recipient.role === 'provider' ? (recipient.providerProfile?.isOnline || false) : (recipient.isOnline || false),
          }
        ],
        unreadCounts: {
          [user._id.toString()]: 0,
          [recipient._id.toString()]: 0,
        }
      });
      await conversation.save();
    } else {
      // If conversation was soft-deleted, restore it
      if (conversation.deletedBy && conversation.deletedBy.some(id => id.toString() === user._id.toString())) {
        conversation.deletedBy = conversation.deletedBy.filter(id => id.toString() !== user._id.toString());
        await conversation.save();
      }
    }

    return res.json({ success: true, conversationId, isNew });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// POST /api/v1/adult/sext/conversations/:conversationId/gift-request
export const sendGiftRequest = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const { conversationId } = req.params;
    const { giftId, message = '' } = req.body;

    if (user.role !== 'provider') {
      return res.status(403).json({ success: false, error: 'Only providers can send gift requests' });
    }

    const gift = await AdultGift.findById(giftId);
    if (!gift || !gift.isActive) {
      return res.status(404).json({ success: false, error: 'Gift not found' });
    }

    const conversation = await AdultConversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const isParticipant = conversation.participants.some(p => p.toString() === user._id.toString());
    if (!isParticipant) {
      return res.status(403).json({ success: false, error: 'Not a participant in this conversation' });
    }

    const receiverId = conversation.participants.find(p => p.toString() !== user._id.toString());
    if (!receiverId) {
      return res.status(400).json({ success: false, error: 'Receiver not found' });
    }

    const msg = new AdultMessage({
      conversationId,
      senderId: user._id,
      receiverId,
      content: encrypt(`🎁 Requested a gift: ${gift.name}`),
      messageType: 'gift_request',
      giftRequest: {
        giftId: gift._id.toString(),
        giftName: gift.name,
        giftIconUrl: gift.iconUrl,
        giftValue: gift.creditCost,
        message,
        status: 'pending'
      }
    });

    await msg.save();

    conversation.lastMessage = {
      content: encrypt(`🎁 Gift request: ${gift.name}`),
      mediaType: 'gift_request',
      senderId: user._id,
      sentAt: new Date()
    };

    const receiverIdStr = receiverId.toString();
    const currentUnread = conversation.unreadCounts.get(receiverIdStr) || 0;
    conversation.unreadCounts.set(receiverIdStr, currentUnread + 1);

    await conversation.save();

    const responsePayload = {
      id: msg._id,
      senderId: msg.senderId,
      receiverId: msg.receiverId,
      content: `Requested a gift: ${gift.name}`,
      mediaType: 'gift_request',
      giftRequest: msg.giftRequest,
      isUnlocked: true,
      createdAt: msg.createdAt
    };

    const ns = req.app.get('adultNamespace');
    if (ns) {
      ns.to(`conv:${conversationId}`).emit('sext:new_message', { message: responsePayload });
    }

    return res.status(201).json(responsePayload);
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// POST /api/v1/adult/sext/conversations/:conversationId/request-service
export const requestService = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const { conversationId } = req.params;
    const { note = '' } = req.body;

    const conversation = await AdultConversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const otherParticipantId = conversation.participants.find(id => id.toString() !== user._id.toString());
    if (!otherParticipantId) {
      return res.status(400).json({ success: false, error: 'Recipient not found' });
    }

    const message = new AdultMessage({
      conversationId,
      senderId: user._id,
      receiverId: otherParticipantId,
      content: encrypt(`🌙 Requested a tonight service`),
      messageType: 'request_service',
      serviceTonightRequest: {
        status: 'pending',
        note,
        fulfilledMessageId: null
      }
    });

    await message.save();

    conversation.lastMessage = {
      content: encrypt(`🌙 Requested a tonight service`),
      mediaType: 'request_service',
      senderId: user._id,
      sentAt: new Date()
    };
    await conversation.save();

    const responsePayload = {
      id: message._id,
      senderId: message.senderId,
      receiverId: message.receiverId,
      content: `Requested a tonight service`,
      mediaType: 'request_service',
      isUnlocked: true,
      serviceTonightRequest: message.serviceTonightRequest,
      createdAt: message.createdAt
    };

    const ns = req.app.get('adultNamespace');
    if (ns) {
      ns.to(`conv:${conversationId}`).emit('sext:new_message', { message: responsePayload });
    }

    return res.status(201).json(responsePayload);
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// POST /api/v1/adult/sext/conversations/:conversationId/service-request
export const sendServiceRequest = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const { conversationId } = req.params;
    const { extras = [], note = '' } = req.body;

    if (user.role !== 'provider') {
      return res.status(403).json({ success: false, error: 'Only providers can send service requests' });
    }

    const baseRate = user.providerProfile?.tonightRate || (user.providerProfile as any)?.pricing?.tonightRate;
    if (!baseRate || baseRate <= 0) {
      return res.status(400).json({
        success: false,
        error: 'You have not set a rate for tonight arrangements. Please update your pricing in Settings.',
      });
    }

    const conversation = await AdultConversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const isParticipant = conversation.participants.some(p => p.toString() === user._id.toString());
    if (!isParticipant) {
      return res.status(403).json({ success: false, error: 'Not a participant in this conversation' });
    }

    // Check no active service request already exists
    const existing = await AdultMessage.findOne({
      conversationId,
      messageType: 'service_request',
      'serviceRequest.status': { $in: ['pending', 'paid'] },
    });
    if (existing) {
      return res.status(409).json({ success: false, error: 'An active service request already exists in this conversation' });
    }

    const validatedExtras = (extras || []).map((e: any) => ({
      label: String(e.label).slice(0, 50),
      amount: Math.max(0, parseInt(e.amount) || 0),
    })).filter((e: any) => e.amount > 0 && e.label);

    const extrasTotal = validatedExtras.reduce((sum: number, e: any) => sum + e.amount, 0);
    const totalAmount = baseRate + extrasTotal;

    const receiverId = conversation.participants.find(p => p.toString() !== user._id.toString());
    if (!receiverId) {
      return res.status(400).json({ success: false, error: 'Receiver not found' });
    }

    const msg = new AdultMessage({
      conversationId,
      senderId: user._id,
      receiverId,
      content: encrypt(`🌙 Service request: 💎 ${totalAmount}`),
      messageType: 'service_request',
      serviceRequest: {
        baseRate,
        extras: validatedExtras,
        totalAmount,
        note,
        status: 'pending',
        eligibleForPayout: false
      }
    });

    await msg.save();

    conversation.lastMessage = {
      content: encrypt(`🌙 Service request: 💎 ${totalAmount}`),
      mediaType: 'service_request',
      senderId: user._id,
      sentAt: new Date()
    };

    const receiverIdStr = receiverId.toString();
    const currentUnread = conversation.unreadCounts.get(receiverIdStr) || 0;
    conversation.unreadCounts.set(receiverIdStr, currentUnread + 1);

    await conversation.save();

    const responsePayload = {
      id: msg._id,
      senderId: msg.senderId,
      receiverId: msg.receiverId,
      content: `🌙 Service request: 💎 ${totalAmount}`,
      mediaType: 'service_request',
      serviceRequest: msg.serviceRequest,
      isUnlocked: true,
      createdAt: msg.createdAt
    };

    const ns = req.app.get('adultNamespace');
    if (ns) {
      ns.to(`conv:${conversationId}`).emit('sext:new_message', { message: responsePayload });
      ns.to(`user:${receiverIdStr}`).emit('sext:conversation_updated', {
        conversationId,
        lastMessage: responsePayload,
        unreadCount: currentUnread + 1
      });
    }

    return res.status(201).json(responsePayload);
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// GET /api/v1/adult/providers/me/tonight-rate
export const getTonightRate = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const tonightRate = user.providerProfile?.tonightRate || (user.providerProfile as any)?.pricing?.tonightRate || 0;
    const perMinuteRate = user.providerProfile?.pricePerMinute || 0;
    const stageName = user.providerProfile?.stageName || user.displayName || user.username;

    return res.json({
      tonightRate,
      perMinuteRate,
      stageName
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// POST /api/v1/adult/sext/service-requests/:messageId/pay
export const payServiceRequest = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const { messageId } = req.params;
    const message = await AdultMessage.findById(messageId);
    if (!message || message.messageType !== 'service_request') {
      return res.status(404).json({ success: false, error: 'Service request not found' });
    }

    if (message.receiverId?.toString() !== user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Only the recipient can pay for this service request' });
    }

    if (message.serviceRequest?.status !== 'pending') {
      return res.status(400).json({ success: false, error: `Service request is already ${message.serviceRequest?.status}` });
    }

    const totalAmount = message.serviceRequest.totalAmount;
    const clientCost = getClientPrice(totalAmount);

    if (user.credits < clientCost) {
      return res.status(402).json({
        success: false,
        error: 'Insufficient credits',
        required: clientCost,
        current: user.credits
      });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const dbUser = await AdultUser.findById(user._id).session(session);
      if (!dbUser || dbUser.credits < clientCost) {
        throw new Error('Insufficient credits');
      }

      dbUser.credits -= clientCost;
      await dbUser.save({ session });

      const { providerAmount, platformFee } = calculateFees(totalAmount);

      const provider = await AdultUser.findById(message.senderId).session(session);
      if (provider) {
        provider.credits += providerAmount;
        if (provider.providerProfile) {
          provider.providerProfile.totalEarnings += providerAmount;
        }
        await provider.save({ session });
      }

      // Member Transaction
      const memberTx = await CreditTransaction.create([{
        userId: user._id,
        type: 'service_payment_sent',
        amount: -clientCost,
        usdAmount: 0,
        description: `Paid for Service Request ${messageId}`,
        relatedUserId: provider?._id,
        status: 'completed',
      }], { session });

      // Provider Transaction
      await CreditTransaction.create([{
        userId: provider?._id,
        type: 'service_payment_received',
        amount: providerAmount,
        platformFee: platformFee,
        usdAmount: 0,
        description: `Service request payout from ${user.username}`,
        relatedUserId: user._id,
        status: 'completed',
        eligibleForPayout: false,
        metadata: { serviceRequestId: message._id }
      }], { session });

      // Record Platform Earnings
      await recordPlatformEarning({
        source: 'service',
        amount: platformFee,
        fromUserId: user._id,
        toProviderId: provider?._id,
        referenceId: memberTx[0]._id,
      }, { session });

      message.serviceRequest.status = 'paid';
      await message.save({ session });

      await session.commitTransaction();

      const ns = req.app.get('adultNamespace');
      if (ns) {
        ns.to(`user:${user._id.toString()}`).emit('wallet:updated', { balance: dbUser.credits });
        if (provider) {
          ns.to(`user:${provider._id.toString()}`).emit('wallet:updated', { balance: provider.credits });
        }
        ns.to(`conv:${message.conversationId}`).emit('sext:message_updated', {
          messageId: message._id,
          serviceRequest: message.serviceRequest
        });
      }

      return res.json({ success: true, serviceRequest: message.serviceRequest });
    } catch (err: any) {
      await session.abortTransaction();
      return res.status(500).json({ success: false, error: err.message });
    } finally {
      session.endSession();
    }
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// POST /api/v1/adult/sext/service-requests/:messageId/complete
export const completeServiceRequest = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const { messageId } = req.params;
    const message = await AdultMessage.findById(messageId);
    if (!message || message.messageType !== 'service_request') {
      return res.status(404).json({ success: false, error: 'Service request not found' });
    }

    if (message.receiverId?.toString() !== user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Only the recipient of the request can complete it' });
    }

    if (message.serviceRequest?.status !== 'paid') {
      return res.status(400).json({ success: false, error: 'Service must be paid before completion' });
    }

    message.serviceRequest.status = 'completed';
    await message.save();

    // Mark corresponding provider transactions as eligible for payout
    await CreditTransaction.updateMany(
      { userId: message.senderId, relatedUserId: user._id, description: { $regex: 'Service request' } },
      { $set: { eligibleForPayout: true } }
    );

    const ns = req.app.get('adultNamespace');
    if (ns) {
      ns.to(`conv:${message.conversationId}`).emit('sext:message_updated', {
        messageId: message._id,
        serviceRequest: message.serviceRequest
      });
    }

    return res.json({ success: true, serviceRequest: message.serviceRequest });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// POST /api/v1/adult/sext/service-requests/:messageId/report
export const reportServiceRequest = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const { messageId } = req.params;
    const message = await AdultMessage.findById(messageId);
    if (!message || message.messageType !== 'service_request') {
      return res.status(404).json({ success: false, error: 'Service request not found' });
    }

    if (message.receiverId?.toString() !== user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    message.serviceRequest!.status = 'reported';
    await message.save();

    const ns = req.app.get('adultNamespace');
    if (ns) {
      ns.to(`conv:${message.conversationId}`).emit('sext:message_updated', {
        messageId: message._id,
        serviceRequest: message.serviceRequest
      });
    }

    return res.json({ success: true, serviceRequest: message.serviceRequest });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// POST /api/v1/adult/sext/service-requests/:messageId/decline
export const declineServiceRequest = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const { messageId } = req.params;
    const message = await AdultMessage.findById(messageId);
    if (!message || message.messageType !== 'service_request') {
      return res.status(404).json({ success: false, error: 'Service request not found' });
    }

    if (message.receiverId?.toString() !== user._id.toString() && message.senderId.toString() !== user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    message.serviceRequest!.status = 'completed'; // or dismissed/declined, let's treat it as completed or just set state
    // Let's set it to 'reported' or simply update the schema: wait, the schema status enum allows: 'pending', 'paid', 'completed', 'auto_completed', 'reported'. So let's decline by using 'reported' or setting message content or just completing it safely. Let's set it to 'completed' as fallback or delete message. Wait, let's just make it complete or reported to stay in enum.
    message.serviceRequest!.status = 'completed';
    await message.save();

    const ns = req.app.get('adultNamespace');
    if (ns) {
      ns.to(`conv:${message.conversationId}`).emit('sext:message_updated', {
        messageId: message._id,
        serviceRequest: message.serviceRequest
      });
    }

    return res.json({ success: true, serviceRequest: message.serviceRequest });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// POST /api/v1/adult/sext/gift-requests/:messageId/dismiss
export const dismissGiftRequest = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const { messageId } = req.params;
    const message = await AdultMessage.findById(messageId);
    if (!message || message.messageType !== 'gift_request') {
      return res.status(404).json({ success: false, error: 'Gift request not found' });
    }

    if (message.receiverId?.toString() !== user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    if (!message.giftRequest) {
      return res.status(400).json({ success: false, error: 'Gift request detail not found' });
    }

    message.giftRequest.status = 'dismissed';
    await message.save();

    const ns = req.app.get('adultNamespace');
    if (ns) {
      ns.to(`conv:${message.conversationId}`).emit('sext:message_updated', {
        messageId: message._id,
        giftRequest: message.giftRequest
      });
    }

    return res.json({ success: true, giftRequest: message.giftRequest });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// POST /api/v1/adult/sext/gift-requests/:messageId/fulfill
export const fulfillGiftRequest = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const { messageId } = req.params;
    const message = await AdultMessage.findById(messageId);
    if (!message || message.messageType !== 'gift_request') {
      return res.status(404).json({ success: false, error: 'Gift request not found' });
    }

    if (message.receiverId?.toString() !== user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    if (!message.giftRequest) {
      return res.status(400).json({ success: false, error: 'Gift request detail not found' });
    }

    if (message.giftRequest.status !== 'pending') {
      return res.status(400).json({ success: false, error: 'Gift request already processed' });
    }

    const giftValue = message.giftRequest.giftValue;

    if (user.credits < giftValue) {
      return res.status(402).json({ success: false, error: 'Insufficient credits' });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const dbUser = await AdultUser.findById(user._id).session(session);
      if (!dbUser || dbUser.credits < giftValue) {
        throw new Error('Insufficient credits');
      }

      dbUser.credits -= giftValue;
      await dbUser.save({ session });

      const { providerAmount, platformFee } = calculateFees(giftValue);

      const provider = await AdultUser.findById(message.senderId).session(session);
      if (provider) {
        provider.credits += providerAmount;
        if (provider.providerProfile) {
          provider.providerProfile.totalEarnings += providerAmount;
        }
        await provider.save({ session });
      }

      // Member Transaction
      const memberTx = await CreditTransaction.create([{
        userId: user._id,
        type: 'tip',
        amount: -giftValue,
        usdAmount: 0,
        description: `Sent requested gift: ${message.giftRequest!.giftName}`,
        relatedUserId: provider?._id,
        status: 'completed',
      }], { session });

      // Provider Transaction
      await CreditTransaction.create([{
        userId: provider?._id,
        type: 'tip',
        amount: providerAmount,
        platformFee: platformFee,
        usdAmount: 0,
        description: `Received requested gift: ${message.giftRequest!.giftName} from ${user.username}`,
        relatedUserId: user._id,
        status: 'completed',
      }], { session });

      // Record Platform Earnings
      await recordPlatformEarning({
        source: 'gift',
        amount: platformFee,
        fromUserId: user._id,
        toProviderId: provider?._id,
        referenceId: memberTx[0]._id,
      }, { session });

      message.giftRequest!.status = 'fulfilled';
      await message.save({ session });

      await session.commitTransaction();

      const ns = req.app.get('adultNamespace');
      if (ns) {
        ns.to(`user:${user._id.toString()}`).emit('wallet:updated', { balance: dbUser.credits });
        if (provider) {
          ns.to(`user:${provider._id.toString()}`).emit('wallet:updated', { balance: provider.credits });
        }
        ns.to(`conv:${message.conversationId}`).emit('sext:message_updated', {
          messageId: message._id,
          giftRequest: message.giftRequest
        });
      }

      return res.json({ success: true, giftRequest: message.giftRequest });
    } catch (err: any) {
      await session.abortTransaction();
      return res.status(500).json({ success: false, error: err.message });
    } finally {
      session.endSession();
    }
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// GET /api/v1/adult/sext/conversations
export const getConversations = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const query = {
      participants: user._id,
      deletedBy: { $ne: user._id }
    };

    const conversations = await AdultConversation.find(query)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const results = [];

    for (const conv of conversations) {
      const otherProfile = conv.participantProfiles.find(p => p.userId?.toString() !== user._id.toString());
      const otherUser = otherProfile ? await AdultUser.findById(otherProfile.userId) : null;

      // Unread count
      const unreadCount = conv.unreadCounts.get(user._id.toString()) || 0;

      let preview = '';
      if (conv.lastMessage?.content) {
        try {
          preview = decrypt(conv.lastMessage.content);
        } catch {
          preview = conv.lastMessage.content;
        }
      }

      results.push({
        conversationId: conv._id,
        otherUser: otherProfile ? {
          id: otherProfile.userId,
          displayName: otherUser?.providerProfile?.stageName || otherProfile.displayName || 'User',
          avatarUrl: otherUser?.profilePhoto || otherProfile.avatarUrl || '/placeholder.svg',
          isOnline: otherUser
            ? (otherUser.role === 'provider' ? (otherUser.providerProfile?.isOnline || false) : (otherUser.isOnline || false))
            : (otherProfile.isOnline || false),
          accountType: otherProfile.accountType
        } : null,
        lastMessage: conv.lastMessage?.sentAt ? {
          content: preview,
          mediaType: conv.lastMessage.mediaType,
          senderId: conv.lastMessage.senderId,
          sentAt: conv.lastMessage.sentAt
        } : null,
        unreadCount,
        isMuted: conv.mutedBy.some(id => id.toString() === user._id.toString()),
        isBlocked: conv.blockedBy.length > 0
      });
    }

    return res.json(results);
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// GET /api/v1/adult/sext/conversations/:conversationId
export const getConversationById = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const { conversationId } = req.params;
    const conversation = await AdultConversation.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    if (!conversation.participants.some(id => id.toString() === user._id.toString())) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const otherProfile = conversation.participantProfiles.find(p => p.userId?.toString() !== user._id.toString());
    const otherUser = otherProfile ? await AdultUser.findById(otherProfile.userId) : null;

    return res.json({
      conversationId: conversation._id,
      unreadCount: conversation.unreadCounts.get(user._id.toString()) || 0,
      otherUser: otherProfile ? {
        id: otherProfile.userId,
        displayName: otherUser?.providerProfile?.stageName || otherProfile.displayName || 'User',
        avatarUrl: otherUser?.profilePhoto || otherProfile.avatarUrl || '/placeholder.svg',
        isOnline: otherUser
          ? (otherUser.role === 'provider' ? (otherUser.providerProfile?.isOnline || false) : (otherUser.isOnline || false))
          : (otherProfile.isOnline || false),
        accountType: otherProfile.accountType,
        bio: otherUser?.bio || '',
        country: otherUser?.country || ''
      } : null
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// DELETE /api/v1/adult/sext/conversations/:conversationId
export const deleteConversation = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const { conversationId } = req.params;
    const conversation = await AdultConversation.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    if (!conversation.participants.some(id => id.toString() === user._id.toString())) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    // Add to deletedBy list of conversation
    if (!conversation.deletedBy.some(id => id.toString() === user._id.toString())) {
      conversation.deletedBy.push(user._id);
      await conversation.save();
    }

    // Add to deletedBy list for all messages in conversation
    await AdultMessage.updateMany(
      { conversationId },
      { $addToSet: { deletedBy: user._id } }
    );

    return res.json({ success: true, message: 'Conversation deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// PUT /api/v1/adult/sext/conversations/:conversationId/mute
export const muteConversation = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const { conversationId } = req.params;
    const { muted } = req.body;

    const conversation = await AdultConversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    if (!conversation.participants.some(id => id.toString() === user._id.toString())) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    if (muted) {
      if (!conversation.mutedBy.some(id => id.toString() === user._id.toString())) {
        conversation.mutedBy.push(user._id);
      }
    } else {
      conversation.mutedBy = conversation.mutedBy.filter(id => id.toString() !== user._id.toString());
    }

    await conversation.save();
    return res.json({ success: true, isMuted: muted });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// GET /api/v1/adult/sext/conversations/:conversationId/messages
export const getMessages = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const { conversationId } = req.params;
    const before = req.query.before as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 30;

    const query: any = {
      conversationId,
      deletedBy: { $ne: user._id },
      $or: [
        { isFlagged: { $ne: true } },
        { senderId: user._id }
      ]
    };

    if (before) {
      query._id = { $lt: new mongoose.Types.ObjectId(before) };
    }

    let queryBuilder = AdultMessage.find(query).sort({ createdAt: -1 });

    if (!before) {
      queryBuilder = queryBuilder.skip((page - 1) * limit);
    }

    const messages = await queryBuilder.limit(limit);

    const formatted = messages.map(m => {
      let decryptedContent = '';
      try {
        decryptedContent = decrypt(m.content);
      } catch {
        decryptedContent = m.content;
      }

      // Check unlock details
      const cost = m.creditCost || m.unlockCost || 0;
      const isUnlocked = cost === 0 ||
        m.senderId.toString() === user._id.toString() ||
        m.unlockedBy.some(id => id.toString() === user._id.toString());

      let finalMediaUrl = m.mediaUrl || '';
      if (isUnlocked && m.cloudinaryPublicId) {
        try {
          finalMediaUrl = getSignedUrl(m.cloudinaryPublicId, 3600);
        } catch (err) {
          console.error('Error signing URL in getMessages:', err);
        }
      }

      return {
        id: m._id,
        senderId: m.senderId,
        receiverId: m.receiverId,
        content: m.isDeleted ? '[Message deleted]' : decryptedContent,
        mediaUrl: isUnlocked ? finalMediaUrl : '',
        mediaThumbnailUrl: m.mediaThumbnailUrl || '',
        mediaDurationSeconds: m.mediaDurationSeconds,
        mediaFileSizeBytes: m.mediaFileSizeBytes,
        mediaMimeType: m.mediaMimeType,
        mediaType: m.messageType,
        creditCost: cost,
        isUnlocked,
        gift: m.gift,
        giftRequest: m.giftRequest,
        serviceRequest: m.serviceRequest,
        photoRequest: m.photoRequest,
        systemText: m.systemText,
        reactions: m.reactions,
        isDeleted: m.isDeleted,
        isFlagged: m.isFlagged,
        flagReason: m.flagReason,
        createdAt: m.createdAt,
        readAt: m.readAt,
      };
    });

    return res.json(formatted);
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// POST /api/v1/adult/sext/messages/:conversationId
export const sendMessage = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const { conversationId } = req.params;
    const {
      type = 'text',
      content = '',
      mediaUrl = '',
      mediaThumbnailUrl = '',
      mediaDurationSeconds = 0,
      mediaFileSizeBytes = 0,
      mediaMimeType = '',
      creditCost = 0,
      gift = null,
      photoRequest = null,
      systemText = '',
      cloudinaryPublicId = ''
    } = req.body;

    const conversation = await AdultConversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    if (conversation.blockedBy.length > 0) {
      return res.status(403).json({ success: false, error: 'This conversation is blocked' });
    }

    const otherParticipantId = conversation.participants.find(id => id.toString() !== user._id.toString());
    if (!otherParticipantId) {
      return res.status(400).json({ success: false, error: 'Recipient not found' });
    }

    // Scan content for contact sharing violations
    const filterResult = detectContactSharing(content || '');
    let isFlagged = false;
    let flagReason = '';
    let flaggedText = '';

    if (filterResult.detected) {
      const accountType = user.role === 'provider' ? 'service_provider' : 'member';

      // Log the violation
      await ContentViolation.create({
        userId: user._id,
        accountType,
        conversationId,
        messageContent: content,
        violationType: filterResult.category,
        matchedText: filterResult.matchedText,
      });

      // Auto-escalation: count provider violations within last 7 days
      if (user.role === 'provider') {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const violationCount = await ContentViolation.countDocuments({
          userId: user._id,
          reviewed: false,
          createdAt: { $gte: sevenDaysAgo },
        });

        if (violationCount >= 3) {
          const ns = req.app.get('adultNamespace');
          if (ns) {
            ns.emit('admin:violation_threshold', {
              userId: user._id,
              count: violationCount,
              accountType: 'service_provider',
            });
          }
        }
      }

      // Hard block the message for both providers and members
      return res.status(400).json({
        success: false,
        error: 'Message blocked: contains contact information',
        violationType: filterResult.category,
      });
    }

    // Set lock value
    let finalCreditCost = creditCost;
    let finalIsLocked = creditCost > 0;
    if (user.role === 'provider' && (type === 'locked_image' || type === 'locked_video')) {
      finalCreditCost = Math.max(1, creditCost);
      finalIsLocked = true;
    }

    const message = new AdultMessage({
      conversationId,
      senderId: user._id,
      receiverId: otherParticipantId,
      content: encrypt(content),
      messageType: type,
      mediaUrl,
      mediaThumbnailUrl,
      mediaDurationSeconds,
      mediaFileSizeBytes,
      mediaMimeType,
      isLocked: finalIsLocked,
      creditCost: finalCreditCost,
      unlockCost: finalCreditCost, // backward compatible
      mediaBlurred: finalIsLocked,
      gift,
      photoRequest,
      systemText,
      isFlagged,
      flagReason,
      flaggedText,
      cloudinaryPublicId
    });

    await message.save();

    const receiverIdStr = otherParticipantId.toString();
    let currentUnread = conversation.unreadCounts.get(receiverIdStr) || 0;

    const ns = req.app.get('adultNamespace');
    let deliveredAt: Date | null = null;

    if (ns && !isFlagged) {
      try {
        const socketsInRoom = await ns.in(`conv:${conversationId}`).fetchSockets();
        const recipientInRoom = socketsInRoom.some(
          (s: any) => s.data?.user?._id?.toString() === receiverIdStr
        );

        if (recipientInRoom) {
          deliveredAt = new Date();
          message.deliveredAt = deliveredAt;
          await AdultMessage.updateOne({ _id: message._id }, { $set: { deliveredAt } });
        }
      } catch (err) {
        console.error('Error fetching sockets in conv room:', err);
      }
    }

    if (!isFlagged) {
      // Reset deletedBy in case receiver/sender deleted it earlier
      conversation.deletedBy = [];
      conversation.lastMessage = {
        content: encrypt(content || (type === 'gift' ? `🎁 Sent you a ${gift?.giftName || 'gift'}` : `[${type}]`)),
        mediaType: type,
        senderId: user._id,
        sentAt: new Date()
      };

      // Increment unread count for other party
      currentUnread = currentUnread + 1;
      conversation.unreadCounts.set(receiverIdStr, currentUnread);

      await conversation.save();
    }

    const responsePayload = {
      id: message._id,
      senderId: message.senderId,
      receiverId: message.receiverId,
      content,
      mediaUrl: finalIsLocked ? '' : mediaUrl,
      mediaThumbnailUrl,
      mediaDurationSeconds,
      mediaFileSizeBytes,
      mediaMimeType,
      mediaType: type,
      creditCost: finalCreditCost,
      isUnlocked: !finalIsLocked,
      gift,
      photoRequest,
      systemText,
      reactions: [],
      isDeleted: false,
      isFlagged: message.isFlagged,
      flagReason: message.flagReason,
      createdAt: message.createdAt,
      readAt: null,
      deliveredAt: message.deliveredAt || null
    };

    // Socket emission (handled mostly in Socket.io but let's make sure it relays)
    if (ns) {
      if (isFlagged) {
        // Soft block: Do NOT send/deliver/notify the recipient. Only emit to the sender's own channel.
        ns.to(`user:${user._id.toString()}`).emit('sext:new_message', { message: responsePayload });
      } else {
        ns.to(`conv:${conversationId}`).emit('sext:new_message', { message: responsePayload });
        ns.to(`user:${receiverIdStr}`).emit('sext:conversation_updated', {
          conversationId,
          lastMessage: responsePayload,
          unreadCount: currentUnread
        });
      }

      if (!isFlagged) {
        ns.to(`user:${receiverIdStr}`).emit('sext:new_message_notification', {
          conversationId,
          messageId: message._id,
          preview: content ? content.slice(0, 50) : '',
        });
      }
    }

    return res.status(201).json(responsePayload);
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// PUT /api/v1/adult/sext/conversations/:conversationId/read
export const markAsRead = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const { conversationId } = req.params;
    const conversation = await AdultConversation.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const updateResult = await AdultMessage.updateMany(
      { conversationId, receiverId: user._id, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );

    conversation.unreadCounts.set(user._id.toString(), 0);
    await conversation.save();

    const otherParticipantId = conversation.participants.find(id => id.toString() !== user._id.toString());
    const ns = req.app.get('adultNamespace');
    if (ns && otherParticipantId) {
      const readMessages = await AdultMessage.find({
        conversationId,
        receiverId: user._id,
        readAt: { $ne: null }
      }).select('_id senderId readAt');

      const senderIds = [...new Set(readMessages.map(m => m.senderId.toString()))];
      for (const senderId of senderIds) {
        ns.to(`user:${senderId}`).emit('sext:messages_seen', {
          conversationId,
          seenAt: new Date()
        });
      }

      ns.to(`user:${otherParticipantId.toString()}`).emit('sext:messages_read', {
        conversationId,
        readAt: new Date()
      });
    }

    return res.json({ success: true, messagesRead: updateResult.modifiedCount });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// DELETE /api/v1/adult/sext/messages/:messageId
export const deleteMessage = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const { messageId } = req.params;
    const message = await AdultMessage.findById(messageId);

    if (!message) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    if (message.senderId.toString() !== user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Cannot delete another user\'s message' });
    }

    message.isDeleted = true;
    message.deletedAt = new Date();
    await message.save();

    const ns = req.app.get('adultNamespace');
    if (ns) {
      ns.to(`conv:${message.conversationId}`).emit('sext:message_deleted', { messageId });
    }

    return res.json({ success: true, message: 'Message soft-deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// POST /api/v1/adult/sext/messages/:messageId/react
export const reactMessage = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const { messageId } = req.params;
    const { emoji } = req.body;

    if (!emoji) {
      return res.status(400).json({ success: false, error: 'Emoji is required' });
    }

    const message = await AdultMessage.findById(messageId);
    if (!message) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    // Toggle reaction
    const existingIndex = message.reactions.findIndex(
      r => r.userId.toString() === user._id.toString() && r.emoji === emoji
    );

    if (existingIndex > -1) {
      message.reactions.splice(existingIndex, 1);
    } else {
      message.reactions.push({
        userId: user._id,
        emoji,
        reactedAt: new Date()
      });
    }

    await message.save();

    const ns = req.app.get('adultNamespace');
    if (ns) {
      ns.to(`conv:${message.conversationId}`).emit('sext:message_reacted', {
        messageId,
        reactions: message.reactions
      });
    }

    return res.json(message.reactions);
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// POST /api/v1/adult/sext/messages/:messageId/unlock
export const unlockMedia = async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const message = await AdultMessage.findById(messageId);
    if (!message) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    if (message.senderId.toString() === user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Cannot unlock your own content' });
    }

    if (message.unlockedBy.some(id => id.toString() === user._id.toString())) {
      return res.status(409).json({ success: false, error: 'Already unlocked' });
    }

    const cost = message.creditCost || message.unlockCost || 0;
    const clientCost = getClientPrice(cost);

    if (user.credits < clientCost) {
      return res.status(402).json({
        success: false,
        error: 'Not enough credits',
        required: clientCost,
        current: user.credits
      });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
    const dbUser = await AdultUser.findById(user._id).session(session);
    if (!dbUser) {
      throw new Error('User not found');
    }
    if (dbUser.credits < clientCost) {
      return res.status(402).json({ success: false, error: 'Insufficient credits' });
    }
    dbUser.credits -= clientCost;
    await dbUser.save({ session });

      const { providerAmount, platformFee } = calculateFees(cost);

      const provider = await AdultUser.findById(message.senderId).session(session);
      if (provider) {
        provider.credits += providerAmount;
        if (provider.providerProfile) {
          provider.providerProfile.totalEarnings += providerAmount;
        }
        await provider.save({ session });
      }

      const senderTx = await CreditTransaction.create([{
        userId: user._id,
        type: 'paid_media_unlock',
        amount: -clientCost,
        usdAmount: 0,
        description: `Unlock media from ${provider?.username || 'provider'}`,
        relatedUserId: provider?._id,
        status: 'completed',
      }], { session });

      if (provider) {
        await CreditTransaction.create([{
          userId: provider._id,
          type: 'paid_media_unlock',
          amount: providerAmount,
          platformFee: platformFee,
          usdAmount: 0,
          description: `Media unlock by ${user.username}`,
          relatedUserId: user._id,
          status: 'completed',
        }], { session });

        // Record Platform Earnings
        await recordPlatformEarning({
          source: 'paid_media',
          amount: platformFee,
          fromUserId: user._id,
          toProviderId: provider._id,
          referenceId: senderTx[0]._id,
        }, { session });
      }

      message.unlockedBy.push(user._id);
      await message.save({ session });

      await session.commitTransaction();

      let finalMediaUrl = message.mediaUrl;
      if (message.cloudinaryPublicId) {
        try {
          finalMediaUrl = getSignedUrl(message.cloudinaryPublicId, 3600);
        } catch (err) {
          console.error('Error signing URL in unlockMedia:', err);
        }
      }

      // Emit balance socket updates and media unlock
      const ns = req.app.get('adultNamespace');
      if (ns) {
      ns.to(`user:${user._id.toString()}`).emit('wallet:updated', { balance: dbUser.credits });
        if (provider) {
          ns.to(`user:${provider._id.toString()}`).emit('wallet:updated', { balance: provider.credits });
        }
        ns.to(`conv:${message.conversationId}`).emit('sext:media_unlocked', {
          messageId: message._id,
          mediaUrl: finalMediaUrl
        });
      }

      return res.json({
        success: true,
        mediaUrl: finalMediaUrl,
        mediaThumbnailUrl: message.mediaThumbnailUrl,
        mediaMimeType: message.mediaMimeType
      });
    } catch (err: any) {
      console.error("UNLOCK_MEDIA_ERROR:", err);
      await session.abortTransaction();
      return res.status(500).json({ success: false, error: err.message });
    } finally {
      session.endSession();
    }
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// POST /api/v1/adult/sext/conversations/:conversationId/request-photo
export const requestPhoto = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const { conversationId } = req.params;
    const { note = '' } = req.body;

    const conversation = await AdultConversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const otherParticipantId = conversation.participants.find(id => id.toString() !== user._id.toString());
    if (!otherParticipantId) {
      return res.status(400).json({ success: false, error: 'Recipient not found' });
    }

    const message = new AdultMessage({
      conversationId,
      senderId: user._id,
      receiverId: otherParticipantId,
      content: encrypt(`📷 Requested a photo`),
      messageType: 'request_photo',
      photoRequest: {
        status: 'pending',
        note,
        fulfilledMessageId: null
      }
    });

    await message.save();

    conversation.lastMessage = {
      content: encrypt(`📷 Requested a photo`),
      mediaType: 'request_photo',
      senderId: user._id,
      sentAt: new Date()
    };
    await conversation.save();

    const responsePayload = {
      id: message._id,
      senderId: message.senderId,
      receiverId: message.receiverId,
      content: `Requested a photo`,
      mediaType: 'request_photo',
      isUnlocked: true,
      photoRequest: message.photoRequest,
      createdAt: message.createdAt
    };

    const ns = req.app.get('adultNamespace');
    if (ns) {
      ns.to(`conv:${conversationId}`).emit('sext:new_message', { message: responsePayload });
    }

    return res.status(201).json(responsePayload);
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// PUT /api/v1/adult/sext/photo-requests/:messageId/fulfill
export const fulfillPhotoRequest = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const { messageId } = req.params;
    const { mediaUrl, mediaThumbnailUrl = '', creditCost = 0, isLocked = false } = req.body;

    const requestMsg = await AdultMessage.findById(messageId);
    if (!requestMsg || requestMsg.messageType !== 'request_photo') {
      return res.status(404).json({ success: false, error: 'Photo request not found' });
    }

    if (requestMsg.receiverId?.toString() !== user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Only the recipient of the request can fulfill it' });
    }

    if (requestMsg.photoRequest?.status === 'fulfilled') {
      return res.status(409).json({ success: false, error: 'Already fulfilled' });
    }

    // Create the image message first
    const imageMsg = new AdultMessage({
      conversationId: requestMsg.conversationId,
      senderId: user._id,
      receiverId: requestMsg.senderId,
      content: encrypt(isLocked ? '[Locked Photo]' : 'Fulfilled Photo Request'),
      messageType: isLocked ? 'locked_image' : 'image',
      mediaUrl,
      mediaThumbnailUrl,
      isLocked,
      creditCost,
      unlockCost: creditCost,
      mediaBlurred: isLocked
    });
    await imageMsg.save();

    // Update request state
    requestMsg.photoRequest!.status = 'fulfilled';
    requestMsg.photoRequest!.fulfilledMessageId = imageMsg._id;
    await requestMsg.save();

    const ns = req.app.get('adultNamespace');
    if (ns) {
      ns.to(`conv:${requestMsg.conversationId}`).emit('sext:photo_request_updated', {
        messageId,
        status: 'fulfilled',
        fulfilledMessageId: imageMsg._id
      });
      ns.to(`conv:${requestMsg.conversationId}`).emit('sext:new_message', {
        message: {
          id: imageMsg._id,
          senderId: imageMsg.senderId,
          receiverId: imageMsg.receiverId,
          content: isLocked ? '[Locked Photo]' : 'Fulfilled Photo Request',
          mediaUrl: isLocked ? '' : mediaUrl,
          mediaThumbnailUrl,
          mediaType: isLocked ? 'locked_image' : 'image',
          creditCost,
          isUnlocked: !isLocked,
          createdAt: imageMsg.createdAt
        }
      });
    }

    return res.json({ requestMessage: requestMsg, imageMessage: imageMsg });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// PUT /api/v1/adult/sext/photo-requests/:messageId/decline
export const declinePhotoRequest = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const { messageId } = req.params;
    const requestMsg = await AdultMessage.findById(messageId);

    if (!requestMsg || requestMsg.messageType !== 'request_photo') {
      return res.status(404).json({ success: false, error: 'Photo request not found' });
    }

    // Sender of the request can cancel, receiver of request can decline
    const isReceiver = requestMsg.receiverId?.toString() === user._id.toString();
    const isSender = requestMsg.senderId.toString() === user._id.toString();

    if (!isReceiver && !isSender) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    requestMsg.photoRequest!.status = 'declined';
    await requestMsg.save();

    const ns = req.app.get('adultNamespace');
    if (ns) {
      ns.to(`conv:${requestMsg.conversationId}`).emit('sext:photo_request_updated', {
        messageId,
        status: 'declined'
      });
    }

    return res.json(requestMsg);
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// PUT /api/v1/adult/sext/service-tonight-requests/:messageId/decline
export const declineServiceTonightRequest = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const { messageId } = req.params;
    const requestMsg = await AdultMessage.findById(messageId);

    if (!requestMsg || requestMsg.messageType !== 'request_service') {
      return res.status(404).json({ success: false, error: 'Service request not found' });
    }

    // Sender of the request can cancel, receiver of request can decline
    const isReceiver = requestMsg.receiverId?.toString() === user._id.toString();
    const isSender = requestMsg.senderId.toString() === user._id.toString();

    if (!isReceiver && !isSender) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    requestMsg.serviceTonightRequest!.status = 'declined';
    await requestMsg.save();

    const ns = req.app.get('adultNamespace');
    if (ns) {
      ns.to(`conv:${requestMsg.conversationId}`).emit('sext:service_tonight_request_updated', {
        messageId,
        status: 'declined'
      });
    }

    return res.json(requestMsg);
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// PUT /api/v1/adult/sext/service-tonight-requests/:messageId/fulfill
export const fulfillServiceTonightRequest = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const { messageId } = req.params;
    const { baseRate, extras = [], note = '' } = req.body;

    const requestMsg = await AdultMessage.findById(messageId);
    if (!requestMsg || requestMsg.messageType !== 'request_service') {
      return res.status(404).json({ success: false, error: 'Service request not found' });
    }

    if (requestMsg.receiverId?.toString() !== user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Only the recipient of the request can fulfill it' });
    }

    if (requestMsg.serviceTonightRequest?.status === 'fulfilled') {
      return res.status(409).json({ success: false, error: 'Already fulfilled' });
    }

    const validatedExtras = (extras || []).map((e: any) => ({
      label: String(e.label).slice(0, 50),
      amount: Math.max(0, parseInt(e.amount) || 0),
    })).filter((e: any) => e.amount > 0 && e.label);

    const extrasTotal = validatedExtras.reduce((sum: number, e: any) => sum + e.amount, 0);
    const totalAmount = baseRate + extrasTotal;

    // Create the formal invoice (service_request) message
    const invoiceMsg = new AdultMessage({
      conversationId: requestMsg.conversationId,
      senderId: user._id,
      receiverId: requestMsg.senderId,
      content: encrypt(`🌙 Service request: 💎 ${totalAmount}`),
      messageType: 'service_request',
      serviceRequest: {
        baseRate,
        extras: validatedExtras,
        totalAmount,
        note,
        status: 'pending',
        eligibleForPayout: false
      }
    });
    await invoiceMsg.save();

    // Update request state
    requestMsg.serviceTonightRequest!.status = 'fulfilled';
    requestMsg.serviceTonightRequest!.fulfilledMessageId = invoiceMsg._id;
    await requestMsg.save();

    const ns = req.app.get('adultNamespace');
    if (ns) {
      ns.to(`conv:${requestMsg.conversationId}`).emit('sext:service_tonight_request_updated', {
        messageId,
        status: 'fulfilled',
        fulfilledMessageId: invoiceMsg._id
      });
      ns.to(`conv:${requestMsg.conversationId}`).emit('sext:new_message', {
        message: {
          id: invoiceMsg._id,
          senderId: invoiceMsg.senderId,
          receiverId: invoiceMsg.receiverId,
          content: `🌙 Service request: 💎 ${totalAmount}`,
          mediaType: 'service_request',
          serviceRequest: invoiceMsg.serviceRequest,
          isUnlocked: true,
          createdAt: invoiceMsg.createdAt
        }
      });
    }

    return res.json({ requestMessage: requestMsg, invoiceMessage: invoiceMsg });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// GET /api/v1/adult/gifts/catalogue
export const getGiftsCatalogue = async (req: Request, res: Response) => {
  try {
    let gifts = await AdultGift.find({ isActive: true }).sort({ sortOrder: 1 });

    // Seed default catalogue if empty
    if (gifts.length === 0) {
      const defaults = [
        { name: 'Red Rose', iconUrl: 'rose', creditCost: 10, category: 'romantic', sortOrder: 1 },
        { name: 'Fun Balloon', iconUrl: 'balloon', creditCost: 20, category: 'fun', sortOrder: 2 },
        { name: 'Teddy Bear', iconUrl: 'teddy', creditCost: 50, category: 'romantic', sortOrder: 3 },
        { name: 'Spicy Lingerie', iconUrl: 'lingerie', creditCost: 100, category: 'spicy', sortOrder: 4 },
        { name: 'Champagne', iconUrl: 'champagne', creditCost: 250, category: 'luxury', sortOrder: 5 },
        { name: 'Diamond Ring', iconUrl: 'ring', creditCost: 500, category: 'luxury', sortOrder: 6 }
      ];
      gifts = await AdultGift.create(defaults);
    }

    return res.json(gifts);
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// POST /api/v1/adult/sext/conversations/:conversationId/send-gift
export const sendGift = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const { conversationId } = req.params;
    const { giftId, message = '' } = req.body;

    const gift = await AdultGift.findById(giftId);
    if (!gift || !gift.isActive) {
      return res.status(404).json({ success: false, error: 'Gift not found' });
    }

    if (user.credits < gift.creditCost) {
      return res.status(402).json({ success: false, error: 'Insufficient credits' });
    }

    const conversation = await AdultConversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const otherParticipantId = conversation.participants.find(id => id.toString() !== user._id.toString());
    if (!otherParticipantId) {
      return res.status(400).json({ success: false, error: 'Recipient not found' });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const dbUser = await AdultUser.findById(user._id).session(session);
      if (!dbUser) {
        throw new Error('User not found');
      }
      if (dbUser.credits < gift.creditCost) {
        return res.status(402).json({ success: false, error: 'Insufficient credits' });
      }
      dbUser.credits -= gift.creditCost;
      await dbUser.save({ session });

      const { providerAmount, platformFee } = calculateFees(gift.creditCost);

      const receiver = await AdultUser.findById(otherParticipantId).session(session);
      if (receiver) {
        receiver.credits += providerAmount;
        if (receiver.providerProfile) {
          receiver.providerProfile.totalEarnings += providerAmount;
        }
        await receiver.save({ session });
      }

      const senderTx = await CreditTransaction.create([{
        userId: user._id,
        type: 'tip',
        amount: -gift.creditCost,
        usdAmount: 0,
        description: `Sent gift: ${gift.name}`,
        relatedUserId: receiver?._id,
        status: 'completed',
      }], { session });

      if (receiver) {
        await CreditTransaction.create([{
          userId: receiver._id,
          type: 'tip',
          amount: providerAmount,
          platformFee: platformFee,
          usdAmount: 0,
          description: `Received gift: ${gift.name} from ${user.username}`,
          relatedUserId: user._id,
          status: 'completed',
        }], { session });

        // Record Platform Earnings
        await recordPlatformEarning({
          source: 'gift',
          amount: platformFee,
          fromUserId: user._id,
          toProviderId: receiver._id,
          referenceId: senderTx[0]._id,
        }, { session });
      }

      const msg = new AdultMessage({
        conversationId,
        senderId: user._id,
        receiverId: otherParticipantId,
        content: encrypt(`🎁 Sent you a ${gift.name}`),
        messageType: 'gift',
        gift: {
          giftId: gift._id.toString(),
          giftName: gift.name,
          giftIconUrl: gift.iconUrl,
          giftValue: gift.creditCost,
          message
        }
      });
      await msg.save({ session });

      // Update conversation lastMessage
      conversation.lastMessage = {
        content: encrypt(`🎁 Sent you a ${gift.name}`),
        mediaType: 'gift',
        senderId: user._id,
        sentAt: new Date()
      };
      await conversation.save({ session });

      await session.commitTransaction();

      // Emit socket alerts
      const ns = req.app.get('adultNamespace');
      if (ns) {
        ns.to(`user:${user._id.toString()}`).emit('wallet:updated', { balance: dbUser.credits });
        if (receiver) {
          ns.to(`user:${receiver._id.toString()}`).emit('wallet:updated', { balance: receiver.credits });
        }
        ns.to(`conv:${conversationId}`).emit('sext:new_message', {
          message: {
            id: msg._id,
            senderId: msg.senderId,
            receiverId: msg.receiverId,
            content: `Sent you a ${gift.name}`,
            mediaType: 'gift',
            gift: msg.gift,
            isUnlocked: true,
            createdAt: msg.createdAt
          }
        });
      }

      return res.json({
        message: msg,
        senderNewBalance: dbUser.credits,
        giftDetails: gift
      });
    } catch (err: any) {
      await session.abortTransaction();
      return res.status(500).json({ success: false, error: err.message });
    } finally {
      session.endSession();
    }
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// POST /api/v1/adult/sext/calls/initiate
export const initiateCall = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const { conversationId, type } = req.body;
    if (!conversationId || !type) {
      return res.status(400).json({ success: false, error: 'conversationId and type (video/audio) are required' });
    }

    const conversation = await AdultConversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const otherParticipantId = conversation.participants.find(id => id.toString() !== user._id.toString());
    if (!otherParticipantId) {
      return res.status(400).json({ success: false, error: 'Receiver not found' });
    }

    const receiver = await AdultUser.findById(otherParticipantId);
    if (!receiver) {
      return res.status(404).json({ success: false, error: 'Receiver not found' });
    }

    // Determine cost rate
    const rate = type === 'video'
      ? (receiver.providerProfile?.videoCallPrice || receiver.providerProfile?.pricePerMinute || 5)
      : (receiver.providerProfile?.audioCallPrice || receiver.providerProfile?.pricePerMinute || 5);

    const userPrice = getClientPrice(rate);

    if (user.credits < userPrice) {
      return res.status(402).json({ success: false, error: 'Insufficient credits to start call' });
    }

    const webrtcRoomId = `room_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const call = new AdultCall({
      conversationId,
      callerId: user._id,
      receiverId: receiver._id,
      type,
      status: 'ringing',
      perMinuteRate: rate,
      webrtcRoomId
    });
    await call.save();

    // Emit socket alert to receiver
    const ns = req.app.get('adultNamespace');
    if (ns) {
      ns.to(`user:${receiver._id.toString()}`).emit('call:incoming', {
        callId: call._id,
        callerId: user._id,
        callerName: user.displayName || user.username,
        callerAvatar: user.profilePhoto || '/placeholder.svg',
        type,
        webrtcRoomId,
        rate: userPrice
      });
    }

    // Setup 45s timeout in background
    setTimeout(async () => {
      // Check if mongoose is connected before performing database operations to avoid errors during test teardown or server shutdown
      if (mongoose.connection.readyState !== 1) {
        return;
      }
      try {
        const liveCall = await AdultCall.findById(call._id);
        if (liveCall && liveCall.status === 'ringing') {
          liveCall.status = 'missed';
          liveCall.endReason = 'no_answer';
          liveCall.endedAt = new Date();
          liveCall.creditsDeducted = 0;
          await liveCall.save();

          const systemMsg = new AdultMessage({
            conversationId: liveCall.conversationId,
            senderId: liveCall.callerId,
            receiverId: liveCall.receiverId,
            content: encrypt("No answer"),
            messageType: 'system',
            systemText: "No answer"
          });
          await systemMsg.save();

          if (ns) {
            ns.to(`user:${user._id.toString()}`).emit('call:missed', { callId: call._id });
            ns.to(`user:${receiver._id.toString()}`).emit('call:missed', { callId: call._id });
          }
        }
      } catch (err) {
        // Ignore background query errors during teardown
      }
    }, 45000);

    return res.json({
      callId: call._id,
      roomId: webrtcRoomId,
      webrtcRoomId,
      perMinuteRate: rate,
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// PUT /api/v1/adult/sext/calls/:callId/accept
export const acceptCall = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const { callId } = req.params;
    const call = await AdultCall.findById(callId);

    if (!call) {
      return res.status(404).json({ success: false, error: 'Call session not found' });
    }

    if (call.receiverId.toString() !== user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Unauthorized to accept' });
    }

    call.status = 'active';
    call.startedAt = new Date();
    await call.save();

    const ns = req.app.get('adultNamespace');
    if (ns) {
      ns.to(`user:${call.callerId.toString()}`).emit('call:accepted', {
        callId,
        webrtcRoomId: call.webrtcRoomId,
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
    }

    return res.json({
      roomId: call.webrtcRoomId,
      webrtcRoomId: call.webrtcRoomId,
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      perMinuteRate: call.perMinuteRate
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// PUT /api/v1/adult/sext/calls/:callId/decline
export const declineCall = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const { callId } = req.params;
    const call = await AdultCall.findById(callId);

    if (!call) {
      return res.status(404).json({ success: false, error: 'Call session not found' });
    }

    call.status = 'declined';
    call.endReason = 'declined';
    call.endedAt = new Date();
    call.creditsDeducted = 0;
    await call.save();

    // Insert system message
    const systemMsg = new AdultMessage({
      conversationId: call.conversationId,
      senderId: call.receiverId,
      receiverId: call.callerId,
      content: encrypt("Call declined"),
      messageType: 'system',
      systemText: "Call declined"
    });
    await systemMsg.save();

    const ns = req.app.get('adultNamespace');
    if (ns) {
      ns.to(`user:${call.callerId.toString()}`).emit('call:declined', { callId });
    }

    return res.json({ callId });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// PUT /api/v1/adult/sext/calls/:callId/missed
export const missedCall = async (req: Request, res: Response) => {
  try {
    const { callId } = req.params;
    const call = await AdultCall.findById(callId);

    if (!call) {
      return res.status(404).json({ success: false, error: 'Call session not found' });
    }

    if (call.status === 'ringing') {
      call.status = 'missed';
      call.endReason = 'no_answer';
      call.endedAt = new Date();
      call.creditsDeducted = 0;
      await call.save();

      // Insert system message
      const systemMsg = new AdultMessage({
        conversationId: call.conversationId,
        senderId: call.callerId,
        receiverId: call.receiverId,
        content: encrypt("No answer"),
        messageType: 'system',
        systemText: "No answer"
      });
      await systemMsg.save();

      const ns = req.app.get('adultNamespace');
      if (ns) {
        ns.to(`user:${call.callerId.toString()}`).emit('call:missed', { callId });
        ns.to(`user:${call.receiverId.toString()}`).emit('call:missed', { callId });
      }
    }

    return res.json({ callId });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// PUT /api/v1/adult/sext/calls/:callId/end
export const endCall = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const { callId } = req.params;
    const { reason = 'hung_up' } = req.body;

    const call = await AdultCall.findById(callId);
    if (!call) {
      return res.status(404).json({ success: false, error: 'Call session not found' });
    }

    if (call.status === 'ended') {
      return res.json({ durationSeconds: call.durationSeconds, creditsDeducted: call.creditsDeducted, callId, wasBilled: call.creditsDeducted > 0 });
    }

    const now = new Date();
    let durationSeconds = 0;
    if (call.startedAt) {
      durationSeconds = Math.max(1, Math.floor((now.getTime() - call.startedAt.getTime()) / 1000));
    }

    const MINIMUM_BILLING_SECONDS = 10;
    let creditsToDeduct = 0;
    let providerPayout = 0;

    const finalRate = call.perMinuteRate;
    const clientPrice = getClientPrice(finalRate);

    const isBilled = call.status === 'active' && call.startedAt && durationSeconds >= MINIMUM_BILLING_SECONDS;

    if (isBilled) {
      const minutes = Math.max(1, Math.ceil(durationSeconds / 60));
      creditsToDeduct = minutes * clientPrice;
      providerPayout = minutes * finalRate;
    }

    call.status = 'ended';
    call.endedAt = now;
    call.endedBy = user._id;
    call.endReason = reason;
    call.durationSeconds = durationSeconds;
    call.creditsDeducted = 0; // Will be set to actual deducted value below

    const dbSession = await mongoose.startSession();
    dbSession.startTransaction();

    try {
      const callerUser = await AdultUser.findById(call.callerId).session(dbSession);
      const providerUser = await AdultUser.findById(call.receiverId).session(dbSession);

      if (isBilled && callerUser && providerUser) {
        const actualDeduct = Math.min(callerUser.credits, creditsToDeduct);
        callerUser.credits -= actualDeduct;
        await callerUser.save({ session: dbSession });

        const { providerAmount, platformFee } = calculateFees(actualDeduct);

        providerUser.credits += providerAmount;
        if (providerUser.providerProfile) {
          providerUser.providerProfile.totalEarnings += providerAmount;
        }
        await providerUser.save({ session: dbSession });

        call.creditsDeducted = actualDeduct;

        // Transactions
        await CreditTransaction.create([{
          userId: callerUser._id,
          type: 'call_charge',
          amount: -actualDeduct,
          usdAmount: 0,
          description: `${call.type.charAt(0).toUpperCase() + call.type.slice(1)} call — ${durationSeconds}s`,
          relatedUserId: providerUser._id,
          status: 'completed',
        }], { session: dbSession });

        const providerTx = await CreditTransaction.create([{
          userId: providerUser._id,
          type: 'call_earning',
          amount: providerAmount,
          platformFee: platformFee,
          usdAmount: 0,
          description: `${call.type.charAt(0).toUpperCase() + call.type.slice(1)} call payout from ${callerUser.username}`,
          relatedUserId: callerUser._id,
          status: 'completed',
        }], { session: dbSession });

        // Record Platform Earnings
        await recordPlatformEarning({
          source: 'call',
          amount: platformFee,
          fromUserId: callerUser._id,
          toProviderId: providerUser._id,
          referenceId: providerTx[0]._id,
        }, { session: dbSession });
      }

      await call.save({ session: dbSession });

      const durationLabel = durationSeconds >= 60
        ? `${Math.floor(durationSeconds / 60)} min ${durationSeconds % 60} sec`
        : `${durationSeconds} sec`;

      const systemText = isBilled ? `Call ended · ${durationLabel}` : `Call not connected`;

      const systemMsg = new AdultMessage({
        conversationId: call.conversationId,
        senderId: call.callerId,
        receiverId: call.receiverId,
        content: encrypt(systemText),
        messageType: 'system',
        systemText
      });
      await systemMsg.save({ session: dbSession });

      await dbSession.commitTransaction();

      // Emit sockets
      const ns = req.app.get('adultNamespace');
      if (ns) {
        if (isBilled && callerUser && providerUser) {
          ns.to(`user:${call.callerId.toString()}`).emit('wallet:updated', { balance: callerUser.credits });
          ns.to(`user:${call.receiverId.toString()}`).emit('wallet:updated', { balance: providerUser.credits });
        }
        ns.to(`user:${call.callerId.toString()}`).emit('call:ended', { callId, durationSeconds, creditsDeducted: call.creditsDeducted });
        ns.to(`user:${call.receiverId.toString()}`).emit('call:ended', { callId, durationSeconds, creditsDeducted: call.creditsDeducted });
      }

      return res.json({
        callId: call._id,
        durationSeconds,
        creditsDeducted: call.creditsDeducted,
        wasBilled: call.creditsDeducted > 0
      });
    } catch (err: any) {
      await dbSession.abortTransaction();
      return res.status(500).json({ success: false, error: err.message });
    } finally {
      dbSession.endSession();
    }
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// GET /api/v1/adult/sext/calls/history
export const getCallHistory = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const calls = await AdultCall.find({
      $or: [{ callerId: user._id }, { receiverId: user._id }]
    })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const results = [];
    for (const c of calls) {
      const otherUserId = c.callerId.toString() === user._id.toString() ? c.receiverId : c.callerId;
      const otherUser = await AdultUser.findById(otherUserId);

      results.push({
        callId: c._id,
        type: c.type,
        otherParticipant: otherUser ? {
          displayName: otherUser.providerProfile?.stageName || otherUser.displayName || otherUser.username,
          avatarUrl: otherUser.profilePhoto || '/placeholder.svg'
        } : null,
        durationSeconds: c.durationSeconds,
        creditsDeducted: c.creditsDeducted,
        status: c.status,
        createdAt: c.createdAt
      });
    }

    return res.json(results);
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
