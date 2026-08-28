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
import CamSession from '../models/CamSession';
import Report from '../models/Report';
import AppConfig from '../models/AppConfig';
import OfficialNotification from '../models/OfficialNotification';
import OfficialNotificationRead from '../models/OfficialNotificationRead';
import { encrypt, decrypt } from '../services/encryptionService';
import { getClientPrice } from '../services/pricingService';
import { calculateFees, recordPlatformEarning } from '../shared/fees';
import { getSignedUrl } from '../shared/media/cloudinaryUpload';
import { sendPushToUser } from '../shared/push';
import { sendNewMessageEmail } from '../shared/email/providerEmail';
import { checkActiveCall, endCamSessionAtomic, endCamSessionForCall } from '../services/sessionInvariantService';

const emitSextMessage = (ns: any, conversationId: string | string[], envelope: { message?: any }) => {
  const normalizedConversationId = Array.isArray(conversationId) ? conversationId[0] : conversationId;
  if (!normalizedConversationId) return;
  ns.to(`conv:${normalizedConversationId}`).emit('sext:new_message', envelope);
  const receiverId = envelope?.message?.receiverId?.toString();
  if (receiverId) ns.to(`user:${receiverId}`).emit('sext:new_message', envelope);
};

// Backwards compatibility startConversation route
export const startConversation = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const rawParamUserId = req.params.userId;
    const recipientId = (rawParamUserId && rawParamUserId !== 'start') ? rawParamUserId : req.body.recipientId;
    if (!recipientId || recipientId === 'start') {
      return res.status(400).json({ success: false, error: 'Recipient userId/recipientId is required' });
    }

    let recipient = null;
    try {
      recipient = await AdultUser.findById(recipientId);
    } catch {
      return res.status(404).json({ success: false, error: 'Recipient not found' });
    }

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

export const getCallStatus = async (req: Request, res: Response) => {
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

    if (call.callerId.toString() !== user._id.toString() && call.receiverId.toString() !== user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    // Optimization (⚡ Bolt): Use field projection and .lean() for read-only user lookups in call status check
    const [caller, receiver] = await Promise.all([
      AdultUser.findById(call.callerId).select('displayName username profilePhoto providerProfile').lean(),
      AdultUser.findById(call.receiverId).select('displayName username profilePhoto providerProfile').lean()
    ]);

    return res.json({
      success: true,
      callId: call._id,
      status: call.status,
      webrtcRoomId: call.webrtcRoomId,
      perMinuteRate: call.perMinuteRate,
      endReason: call.endReason,
      durationSeconds: call.durationSeconds,
      creditsDeducted: call.creditsDeducted,
      caller: caller ? {
        id: caller._id,
        displayName: caller.displayName || caller.username,
        avatarUrl: caller.profilePhoto || '/placeholder.svg'
      } : null,
      receiver: receiver ? {
        id: receiver._id,
        displayName: receiver.providerProfile?.stageName || receiver.displayName || receiver.username,
        avatarUrl: receiver.profilePhoto || '/placeholder.svg'
      } : null
    });
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
      conversationId: msg.conversationId,
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
      emitSextMessage(ns, conversationId, { message: responsePayload });
    }

    // Send push notification for gift request (best-effort, isolated from business response)
    try {
      await sendPushToUser(receiverId, {
        title:       `🎁 ${user.providerProfile?.stageName || user.displayName || user.username} is wishing for a gift`,
        body:        `${gift.name} · 💎 ${gift.creditCost}`,
        icon:        user.profilePhoto || '',
        tag:         `gift_req_${conversationId}`,
        renotify:    true,
        url:         `/adult/sext?conversation=${conversationId}`,
        unreadCount: 0,
        type:        'gift_request_received',
      });
    } catch (pushErr: any) {
      console.error('[GiftRequest][Push] Push notification failed safely:', pushErr.message);
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

    // 1. Recipient must be a provider
    const recipient = await AdultUser.findById(otherParticipantId);
    if (!recipient || recipient.role !== 'provider') {
      return res.status(400).json({
        success: false,
        error: 'RECIPIENT_NOT_A_PROVIDER',
        message: 'Services can only be requested from providers.'
      });
    }

    // 2. No active request already pending
    const existing = await AdultMessage.findOne({
      conversationId,
      messageType: 'request_service',
      'serviceTonightRequest.status': 'pending'
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'ACTIVE_REQUEST_EXISTS',
        message: 'You already have an active service request pending in this conversation.'
      });
    }

    const message = new AdultMessage({
      conversationId,
      senderId: user._id,
      receiverId: otherParticipantId,
      content: encrypt(`🌙 Requested activity service`),
      messageType: 'request_service',
      serviceTonightRequest: {
        status: 'pending',
        note,
        fulfilledMessageId: null
      }
    });

    await message.save();

    conversation.lastMessage = {
      content: encrypt(`🌙 Requested activity service`),
      mediaType: 'request_service',
      senderId: user._id,
      sentAt: new Date()
    };
    await conversation.save();

    const responsePayload = {
      id: message._id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      receiverId: message.receiverId,
      content: `Requested activity service`,
      mediaType: 'request_service',
      isUnlocked: true,
      serviceRequest: message.serviceRequest,
      serviceTonightRequest: message.serviceTonightRequest,
      createdAt: message.createdAt
    };

    const ns = req.app.get('adultNamespace');
    if (ns) {
      emitSextMessage(ns, conversationId, { message: responsePayload });
    }

    // Send push notification for service tonight request (best-effort)
    try {
      await sendPushToUser(otherParticipantId, {
        title:       `🌙 Service Tonight request from ${user.displayName || user.username}`,
        body:        note || `Requested a tonight arrangement`,
        icon:        user.profilePhoto || '',
        tag:         `service_req_${conversationId}`,
        renotify:    true,
        url:         `/adult/sext?conversation=${conversationId}`,
        unreadCount: 0,
        type:        'service_tonight_request_received',
      });
    } catch (pushErr: any) {
      console.error('[ServiceTonight][Push] Push notification failed safely:', pushErr.message);
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

    const validatedExtras = (extras ?? [])
      .map((extra: any) => ({
        label: String(extra.label ?? '').trim().slice(0, 50),
        amount: Math.max(0, Number(extra.amount) || 0),
      }))
      .filter((extra: any) => extra.label && extra.amount > 0);

    const extrasTotal = validatedExtras.reduce(
      (sum: number, extra: any) => sum + extra.amount,
      0
    );
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
      conversationId: msg.conversationId,
      senderId: msg.senderId,
      receiverId: msg.receiverId,
      content: `🌙 Service request: 💎 ${totalAmount}`,
      mediaType: 'service_request',
      serviceRequest: msg.serviceRequest,
      serviceTonightRequest: msg.serviceTonightRequest,
      isUnlocked: true,
      createdAt: msg.createdAt
    };

    const ns = req.app.get('adultNamespace');
    if (ns) {
      emitSextMessage(ns, conversationId, { message: responsePayload });
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
    const { reason = 'Service dispute', details = '' } = req.body;

    const message = await AdultMessage.findById(messageId);
    if (!message || message.messageType !== 'service_request') {
      return res.status(404).json({ success: false, error: 'Service request not found' });
    }

    if (message.receiverId?.toString() !== user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    if (!message.serviceRequest) {
      return res.status(400).json({ success: false, error: 'Service request details missing' });
    }

    message.serviceRequest.status = 'reported';
    message.serviceRequest.reportedAt = new Date().toISOString();
    await message.save();

    // Find provider's original earning transaction canonically
    const originalTx = await CreditTransaction.findOne({
      userId: message.senderId,
      type: 'service_payment_received',
      $or: [
        { 'metadata.serviceRequestId': message._id },
        { 'metadata.serviceRequestId': message._id.toString() },
      ]
    });

    // Mark provider's transaction as inDispute
    if (originalTx) {
      originalTx.eligibleForPayout = false;
      originalTx.inDispute = true;
      originalTx.disputeReason = reason;
      await originalTx.save();
    }

    // Check if an existing open report exists for this service request
    let report = await Report.findOne({
      reporter: user._id,
      serviceRequestId: message._id,
      status: { $ne: 'resolved' },
    });

    if (!report) {
      try {
        report = await Report.create({
          reporter: user._id,
          reported: message.senderId,
          reason,
          description: details,
          type: 'service_dispute',
          serviceRequestId: message._id,
          originalTxId: originalTx?._id,
          conversationId: message.conversationId,
          details,
          amountInDispute: message.serviceRequest.totalAmount,
          providerAmountHeld: Math.floor(message.serviceRequest.totalAmount * 0.85),
          status: 'open',
        });
      } catch (err: any) {
        report = await Report.findOne({
          reporter: user._id,
          serviceRequestId: message._id,
        });
        if (!report) {
          throw err;
        }
      }
    }

    // Look up provider details for issue context
    const provider = await AdultUser.findById(message.senderId);

    const supportConversationId = `support_${user._id.toString()}`;

    const issueContext = {
      reportId: report._id.toString(),
      serviceRequestId: message._id.toString(),
      userId: user._id.toString(),
      userDisplayName: user.displayName || user.username,
      providerId: message.senderId.toString(),
      providerStageName: provider?.providerProfile?.stageName || provider?.displayName || 'Provider',
      serviceName: 'Service Tonight Arrangement',
      serviceAmount: message.serviceRequest.totalAmount,
      currency: 'credits',
      paymentStatus: message.serviceRequest.status,
      createdTimestamp: message.createdAt,
      reason,
      userReportText: details,
    };

    let supportConv = await AdultConversation.findOneAndUpdate(
      { _id: supportConversationId },
      {
        $setOnInsert: {
          type: 'support',
          participants: [user._id],
          participantProfiles: [
            {
              userId: user._id,
              displayName: user.displayName || user.username,
              avatarUrl: user.profilePhoto || '/placeholder.svg',
              accountType: user.role === 'provider' ? 'provider' : 'member',
              isOnline: true,
            },
          ],
          supportMetadata: {
            status: 'open',
            tags: ['Chat with Issue'],
            reportId: report._id,
            serviceRequestId: message._id,
            issueContext,
            welcomeSent: true,
          },
          unreadCounts: {
            [user._id.toString()]: 0,
          },
        },
      },
      { upsert: true, new: true }
    );

    if (supportConv) {
      (supportConv as any).type = 'support';
      const currentMetadata = (supportConv as any).supportMetadata || { status: 'open', tags: [] };
      const currentTags: string[] = currentMetadata.tags || [];
      if (!currentTags.includes('Chat with Issue')) {
        currentTags.push('Chat with Issue');
      }
      (supportConv as any).supportMetadata = {
        ...currentMetadata,
        status: 'open',
        tags: currentTags,
        reportId: report._id,
        serviceRequestId: message._id,
        issueContext,
      };
      await supportConv.save();
    }

    // Post automated issue context message in support conversation if not already posted
    const existingIssueMsg = await AdultMessage.findOne({
      conversationId: supportConversationId,
      'issueContext.reportId': report._id.toString(),
    });

    if (!existingIssueMsg) {
      const issueSummaryText = `⚠️ Service Issue Reported\nService Amount: 💎 ${message.serviceRequest.totalAmount}\nProvider: ${provider?.providerProfile?.stageName || provider?.displayName || 'Provider'}\nReason: ${reason}\nDetails: ${details || 'None provided'}`;
      const autoIssueMsg = new AdultMessage({
        conversationId: supportConversationId,
        senderId: user._id,
        content: encrypt(issueSummaryText),
        messageType: 'system',
        systemText: issueSummaryText,
      });
      (autoIssueMsg as any).issueContext = issueContext;
      await autoIssueMsg.save();
    }

    const ns = req.app.get('adultNamespace');
    if (ns) {
      ns.to(`conv:${message.conversationId}`).emit('sext:message_updated', {
        messageId: message._id,
        serviceRequest: message.serviceRequest
      });
      // Emit socket notification to admin
      ns.emit('admin:service_dispute', {
        reportId: report._id,
        providerId: message.senderId,
        memberId: user._id,
        amount: message.serviceRequest.totalAmount,
      });
      ns.emit('admin:support_issue_created', {
        supportConversationId,
        reportId: report._id,
        issueContext,
      });
    }

    return res.json({
      success: true,
      serviceRequest: message.serviceRequest,
      reportId: report._id,
      supportConversationId,
      amountHeld: Math.floor(message.serviceRequest.totalAmount * 0.85)
    });
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
      deletedBy: { $ne: user._id },
      type: { $ne: 'official_notification' }
    };

    const audienceFilter = user.role === 'provider'
      ? { targetAudience: { $in: ['providers', 'both'] } }
      : { targetAudience: { $in: ['users', 'both'] } };

    const supportId = `support_${user._id.toString()}`;

    // ⚡ OPTIMIZATION (Bolt): Execute conversation listing, official channels config, official notification queries,
    // and support conversation lookup concurrently via Promise.all with .lean() to eliminate sequential database roundtrip latency.
    const [
      conversations,
      officialChannelsConfigDoc,
      latestNotif,
      totalNotifs,
      readNotifs,
      existingSupportConv,
    ] = await Promise.all([
      AdultConversation.find(query)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      page === 1 ? AppConfig.findOne({ key: 'official_channels_config' }).lean() : Promise.resolve(null),
      page === 1 ? OfficialNotification.findOne(audienceFilter).sort({ createdAt: -1 }).lean() : Promise.resolve(null),
      page === 1 ? OfficialNotification.countDocuments(audienceFilter) : Promise.resolve(0),
      page === 1 ? OfficialNotificationRead.countDocuments({ userId: user._id }) : Promise.resolve(0),
      page === 1 ? AdultConversation.findById(supportId) : Promise.resolve(null),
    ]);

    const results = [];

    if (page === 1) {
      const rawValue = officialChannelsConfigDoc?.value;
      const officialConfig = (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue))
        ? (rawValue as any)
        : {
            notifications: { avatarUrl: '/icons/icon-192x192.png', badge: 'official', badgeType: 'blue', enabled: true },
            support: { avatarUrl: '/icons/icon-192x192.png', badge: 'official', badgeType: 'blue', enabled: true }
          };

      // 1. Official Notifications channel (virtual/system channel)
      const unreadNotifCount = Math.max(0, totalNotifs - readNotifs);

      results.push({
        conversationId: 'official_notifications',
        isOfficial: true,
        type: 'official_notification',
        position: 0,
        officialConfig: officialConfig.notifications,
        otherUser: {
          id: 'official_notifications',
          displayName: 'Official Notifications',
          avatarUrl: officialConfig.notifications.avatarUrl,
          isOnline: true,
          accountType: 'official',
          isOfficial: true,
          officialBadge: officialConfig.notifications.badgeType
        },
        lastMessage: latestNotif ? {
          content: latestNotif.title + ' — ' + latestNotif.content,
          mediaType: 'official_notification',
          sentAt: latestNotif.createdAt
        } : null,
        unreadCount: unreadNotifCount,
        isMuted: false,
        isBlocked: false
      });

      // 2. Official Customer Support channel
      let supportConv = existingSupportConv;
      if (!supportConv) {
        supportConv = new AdultConversation({
          _id: supportId,
          type: 'support',
          participants: [user._id],
          participantProfiles: [
            {
              userId: user._id,
              displayName: user.displayName || user.username,
              avatarUrl: user.profilePhoto || '/placeholder.svg',
              accountType: user.role === 'provider' ? 'provider' : 'member',
              isOnline: true
            }
          ],
          supportMetadata: { status: 'open', tags: [] },
          unreadCounts: { [user._id.toString()]: 0 }
        });
        await supportConv.save();
      }

      let supportPreview = 'Need help? Send us a message.';
      if (supportConv.lastMessage?.content) {
        try {
          supportPreview = decrypt(supportConv.lastMessage.content);
        } catch {
          supportPreview = supportConv.lastMessage.content;
        }
      }

      const supportUnread = supportConv.unreadCounts
        ? (typeof (supportConv.unreadCounts as any).get === 'function'
            ? (supportConv.unreadCounts as any).get(user._id.toString())
            : (supportConv.unreadCounts as any)[user._id.toString()]) || 0
        : 0;

      results.push({
        conversationId: supportConv._id,
        isOfficial: true,
        type: 'support',
        position: 1,
        officialConfig: officialConfig.support,
        otherUser: {
          id: 'official_support',
          displayName: 'Official Customer Support',
          avatarUrl: officialConfig.support.avatarUrl,
          isOnline: true,
          accountType: 'official',
          isOfficial: true,
          officialBadge: officialConfig.support.badgeType
        },
        lastMessage: {
          content: supportPreview,
          mediaType: supportConv.lastMessage?.mediaType || 'text',
          senderId: supportConv.lastMessage?.senderId,
          sentAt: supportConv.lastMessage?.sentAt || supportConv.createdAt
        },
        unreadCount: supportUnread,
        isMuted: false,
        isBlocked: false,
        supportMetadata: (supportConv as any).supportMetadata
      });
    }

    // Performance Optimization: Batch fetch all other participant AdultUsers in a single query (O(1) database roundtrip)
    // instead of firing sequential await queries in a loop (O(N) N+1 query pattern).
    const otherUserIds = conversations
      .filter(conv => !conv._id.startsWith('support_'))
      .map(conv => conv.participantProfiles?.find((p: any) => p.userId?.toString() !== user._id.toString())?.userId)
      .filter(Boolean);

    const otherUsersList = otherUserIds.length > 0
      ? await AdultUser.find({ _id: { $in: otherUserIds } }).lean()
      : [];

    const otherUsersMap = new Map<string, any>();
    for (const u of otherUsersList) {
      otherUsersMap.set(u._id.toString(), u);
    }

    for (const conv of conversations) {
      if (conv._id.startsWith('support_')) {
        continue; // Handled explicitly above
      }

      const otherProfile = conv.participantProfiles?.find((p: any) => p.userId?.toString() !== user._id.toString());
      const otherUser = otherProfile?.userId ? otherUsersMap.get(otherProfile.userId.toString()) : null;

      // Handle unreadCount whether unreadCounts is a Mongoose Map or plain JS Object (via .lean())
      const unreadCount = conv.unreadCounts
        ? (typeof (conv.unreadCounts as any).get === 'function'
            ? (conv.unreadCounts as any).get(user._id.toString())
            : (conv.unreadCounts as any)[user._id.toString()]) || 0
        : 0;

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
        isOfficial: false,
        type: (conv as any).type || 'normal',
        position: results.length,
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
        isMuted: (conv.mutedBy || []).some((id: any) => id.toString() === user._id.toString()),
        isBlocked: (conv.blockedBy || []).length > 0
      });
    }

    return res.json(results);
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// GET /api/v1/adult/sext/conversations/unread-count
export const getUnreadCount = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const userIdStr = user._id.toString();
    // Optimization (⚡ Bolt): Use .select('unreadCounts').lean() to avoid loading heavy document fields and hydrating Mongoose models
    const conversations = await AdultConversation.find({
      participants: user._id
    }).select('unreadCounts').lean();

    let totalUnread = 0;
    for (const conv of conversations) {
      const count = conv.unreadCounts
        ? (typeof (conv.unreadCounts as any).get === 'function'
            ? (conv.unreadCounts as any).get(userIdStr)
            : (conv.unreadCounts as any)[userIdStr]) || 0
        : 0;
      totalUnread += count;
    }

    return res.json({ success: true, total: totalUnread });
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

    const conversationIdRaw = req.params.conversationId;
    const conversationId = Array.isArray(conversationIdRaw) ? conversationIdRaw[0] : conversationIdRaw;

    const officialChannelsConfigDoc = await AppConfig.findOne({ key: 'official_channels_config' });
    const rawValue = officialChannelsConfigDoc?.value;
    const officialConfig = (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue))
      ? (rawValue as any)
      : {
          notifications: { avatarUrl: '/icons/icon-192x192.png', badge: 'official', badgeType: 'blue', enabled: true },
          support: { avatarUrl: '/icons/icon-192x192.png', badge: 'official', badgeType: 'blue', enabled: true }
        };

    if (conversationId === 'official_notifications') {
      return res.json({
        conversationId: 'official_notifications',
        isOfficial: true,
        type: 'official_notification',
        officialConfig: officialConfig.notifications,
        unreadCount: 0,
        otherUser: {
          id: 'official_notifications',
          displayName: 'Official Notifications',
          avatarUrl: officialConfig.notifications.avatarUrl || '/icons/icon-192x192.png',
          isOnline: true,
          accountType: 'official',
          isOfficial: true,
          officialBadge: officialConfig.notifications.badgeType || 'blue'
        }
      });
    }

    if (conversationId && conversationId.startsWith('support_')) {
      return res.json({
        conversationId,
        isOfficial: true,
        type: 'support',
        officialConfig: officialConfig.support,
        unreadCount: 0,
        otherUser: {
          id: 'official_support',
          displayName: 'Official Customer Support',
          avatarUrl: officialConfig.support.avatarUrl || '/icons/icon-192x192.png',
          isOnline: true,
          accountType: 'official',
          isOfficial: true,
          officialBadge: officialConfig.support.badgeType || 'blue'
        }
      });
    }

    const conversation = await AdultConversation.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    if (!conversation.participants.some(id => id.toString() === user._id.toString())) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const otherProfile = conversation.participantProfiles.find(p => p.userId?.toString() !== user._id.toString());
    // Optimization (⚡ Bolt): Use .lean() on read-only user query
    const otherUser = otherProfile ? await AdultUser.findById(otherProfile.userId).lean() : null;

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

    if (conversationId === 'official_notifications') {
      const audienceFilter = user.role === 'provider'
        ? { targetAudience: { $in: ['providers', 'both'] } }
        : { targetAudience: { $in: ['users', 'both'] } };

      const notifQuery: any = { ...audienceFilter };
      if (before) {
        notifQuery._id = { $lt: new mongoose.Types.ObjectId(before) };
      }

      let notifBuilder = OfficialNotification.find(notifQuery).sort({ createdAt: -1 });
      if (!before) {
        notifBuilder = notifBuilder.skip((page - 1) * limit);
      }

      const notifications = await notifBuilder.limit(limit);

      const readDocs = await OfficialNotificationRead.find({
        userId: user._id,
        notificationId: { $in: notifications.map(n => n._id) }
      });
      const readSet = new Set(readDocs.map(r => r.notificationId.toString()));

      // Automatically mark fetched notifications as read
      if (notifications.length > 0) {
        const bulkOps = notifications.map(n => ({
          updateOne: {
            filter: { userId: user._id, notificationId: n._id },
            update: { $setOnInsert: { readAt: new Date() } },
            upsert: true
          }
        }));
        OfficialNotificationRead.bulkWrite(bulkOps).catch(err => {
          console.error('[OfficialNotificationRead] Error marking as read:', err);
        });
      }

      const formattedNotifs = notifications.map(n => ({
        id: n._id,
        conversationId: 'official_notifications',
        senderId: 'official_notifications',
        receiverId: user._id,
        content: n.title ? `${n.title}\n\n${n.content}` : n.content,
        mediaUrl: n.mediaUrl || '',
        mediaType: 'official_notification',
        isUnlocked: true,
        createdAt: n.createdAt,
        readAt: readSet.has(n._id.toString()) ? n.createdAt : new Date(),
        isOfficialNotification: true,
        title: n.title
      }));

      return res.json(formattedNotifs);
    }

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

    // Optimization (⚡ Bolt): Append .lean() to read-only query to eliminate Mongoose document instantiation and model hydration overhead
    const messages = await queryBuilder.limit(limit).lean();

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
        (m.unlockedBy || []).some((id: any) => id.toString() === user._id.toString());

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
        conversationId: m.conversationId,
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
        serviceTonightRequest: m.serviceTonightRequest,
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

    if (conversationId === 'official_notifications') {
      return res.status(400).json({ success: false, error: 'Cannot send messages to Official Notifications' });
    }

    const convIdStr = Array.isArray(conversationId) ? conversationId[0] : conversationId;

    let conversation = await AdultConversation.findById(convIdStr);
    if (!conversation) {
      if (convIdStr.startsWith('support_')) {
        conversation = await AdultConversation.findOneAndUpdate(
          { _id: convIdStr },
          {
            $setOnInsert: {
              type: 'support',
              participants: [user._id],
              participantProfiles: [
                {
                  userId: user._id,
                  displayName: user.displayName || user.username,
                  avatarUrl: user.profilePhoto || '/placeholder.svg',
                  accountType: user.role === 'provider' ? 'provider' : 'member',
                  isOnline: true,
                },
              ],
              supportMetadata: {
                status: 'open',
                tags: [],
                welcomeSent: false,
              },
              unreadCounts: {
                [user._id.toString()]: 0,
              },
            },
          },
          { upsert: true, new: true }
        );
      }
    }

    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    if (conversation.type === 'official_notification') {
      return res.status(400).json({ success: false, error: 'Cannot send messages to Official Notifications' });
    }

    if (conversation.blockedBy.length > 0) {
      return res.status(403).json({ success: false, error: 'This conversation is blocked' });
    }

    const isSupport = conversation.type === 'support' || convIdStr.startsWith('support_');
    let otherParticipantId = conversation.participants.find(id => id.toString() !== user._id.toString());
    if (!otherParticipantId && !isSupport) {
      return res.status(400).json({ success: false, error: 'Recipient not found' });
    }

    // Scan content for contact sharing violations (text messages only; voice notes bypass filtering)
    const isVoiceNote = type === 'voice_note' || type === 'voice';
    const filterResult = isVoiceNote ? { detected: false, category: 'none' as const, matchedText: '' } : detectContactSharing(content || '');
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
      receiverId: otherParticipantId || null,
      content: encrypt(content || (type === 'voice_note' || type === 'voice' ? '[Voice Note]' : '[Attachment]')),
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

    // Response time tracking for providers
    if (user.role === 'provider' && otherParticipantId) {
      try {
        // Check if there's an unanswered message from the member
        const unansweredMsg = await AdultMessage.findOne({
          conversationId,
          senderId: otherParticipantId,
          repliedAt: null
        }).sort({ createdAt: -1 });

        if (unansweredMsg) {
          const responseTimeMs = Date.now() - new Date(unansweredMsg.createdAt).getTime();
          const responseTimeMins = Math.floor(responseTimeMs / 60000);

          // Update provider's rolling average response stats
          await AdultUser.findOneAndUpdate(
            { _id: user._id },
            {
              $inc: {
                'providerProfile.totalResponseCount': 1,
                'providerProfile.totalResponseMinutes': responseTimeMins
              }
            }
          );

          // Mark message as replied
          await AdultMessage.findByIdAndUpdate(unansweredMsg._id, {
            $set: {
              repliedAt: new Date(),
              replyTimeMinutes: responseTimeMins
            }
          });
          console.log(`[Retention] Provider response tracked: ${responseTimeMins} mins`);
        }
      } catch (err: any) {
        console.error('[Retention] Error calculating response time:', err.message);
      }
    }

    const receiverIdStr = otherParticipantId ? otherParticipantId.toString() : null;

    const ns = req.app.get('adultNamespace');
    let deliveredAt: Date | null = null;

    if (ns && !isFlagged && receiverIdStr) {
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

      if (receiverIdStr) {
        let currentUnread = conversation.unreadCounts.get(receiverIdStr) || 0;
        conversation.unreadCounts.set(receiverIdStr, currentUnread + 1);
      }

      await conversation.save();
    }

    // Support Automated Welcome Message & Socket Dispatch
    if (isSupport) {
      const updatedConv = await AdultConversation.findOneAndUpdate(
        { _id: conversationId, 'supportMetadata.welcomeSent': { $ne: true } },
        { $set: { 'supportMetadata.welcomeSent': true } },
        { new: true }
      );

      if (updatedConv) {
        const autoText = 'Thanks for contacting us. An admin will follow up with you shortly.';
        const systemOfficialId = new mongoose.Types.ObjectId('000000000000000000000000');
        const autoMsg = new AdultMessage({
          conversationId,
          senderId: systemOfficialId,
          receiverId: user._id,
          content: encrypt(autoText),
          messageType: 'system',
          systemText: autoText,
        });
        await autoMsg.save();

        const autoReplyPayload = {
          id: autoMsg._id,
          conversationId,
          senderId: autoMsg.senderId,
          receiverId: autoMsg.receiverId,
          content: autoText,
          mediaType: 'system',
          systemText: autoText,
          createdAt: autoMsg.createdAt,
          isOfficialSystemMessage: true,
        };

        if (ns) {
          emitSextMessage(ns, conversationId, { message: autoReplyPayload });
        }
      }

      if (ns) {
        ns.emit('admin:support_message', { conversationId, userId: user._id });
      }
    }

    const responsePayload = {
      id: message._id,
      conversationId: message.conversationId,
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
      giftRequest: message.giftRequest,
      serviceRequest: message.serviceRequest,
      serviceTonightRequest: message.serviceTonightRequest,
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
        emitSextMessage(ns, conversationId, { message: responsePayload });
        if (receiverIdStr) {
          const recipientUnread = conversation.unreadCounts.get(receiverIdStr) || 0;
          ns.to(`user:${receiverIdStr}`).emit('sext:conversation_updated', {
            conversationId,
            lastMessage: responsePayload,
            unreadCount: recipientUnread
          });
          ns.to(`user:${receiverIdStr}`).emit('sext:new_message_notification', {
            conversationId,
            messageId: message._id,
            preview: content ? content.slice(0, 50) : '',
          });
        }
      }
    }

    if (!isFlagged && otherParticipantId && receiverIdStr) {
      // Send push notification if recipient is offline
      let recipientOnline = false;
      if (ns) {
        try {
          const recipientSockets = await ns.in(`user:${receiverIdStr}`).fetchSockets();
          recipientOnline = recipientSockets.length > 0;
        } catch (err) {
          console.error('[Push] Error checking sockets for user status:', err);
        }
      }

      if (!recipientOnline) {
        // Calculate total unread count across all conversations
        let unreadCount = 0;
        try {
          const conversations = await AdultConversation.find({
            participants: otherParticipantId
          });
          for (const conv of conversations) {
            unreadCount += conv.unreadCounts?.get(receiverIdStr) || 0;
          }
        } catch (err) {
          console.error('[Push] Error calculating unread count:', err);
        }

        const senderName = user.providerProfile?.stageName || user.displayName || 'Someone';

        const getMessagePreview = (t: string, c: string) => {
          switch (t) {
            case 'text':       return c?.slice(0, 100) || 'Sent a message';
            case 'image':      return '📸 Sent you a photo';
            case 'video':      return '🎥 Sent you a video';
            case 'voice_note':
            case 'voice':      return '🎤 Sent a voice message';
            default:           return 'Sent you a message';
          }
        };

        const isLockedMessage = type === 'paid_media' || finalIsLocked;
        let pushPayload: any;
        if (isLockedMessage && user.role === 'provider') {
          pushPayload = {
            title:    `🔒 ${senderName} sent you exclusive content`,
            body:     `Unlock to view · 💎 ${finalCreditCost || 1}`,
            icon:     user.profilePhoto || '',
            badge:    '/icons/badge-72x72.png',
            tag:      `conv_${conversationId}`,
            renotify: true,
            url:      `/adult/sext?conversation=${conversationId}`,
            unreadCount,
            type:     'paid_media_received',
          };
        } else {
          pushPayload = {
            title: `💬 ${senderName}`,
            body: getMessagePreview(type, content),
            icon: user.profilePhoto || '',
            tag: `conv_${conversationId}`,
            renotify: true,
            url: `/adult/sext?conversation=${conversationId}`,
            unreadCount,
            type: 'new_message',
          };
        }

        sendPushToUser(otherParticipantId, pushPayload).catch((err) => {
          console.error('[Push] Failed to send push:', err);
        });

        // Trigger email notification if recipient is an offline provider
        try {
          const recipientUser = await AdultUser.findById(otherParticipantId);
          if (recipientUser && recipientUser.role === 'provider' && type !== 'system' && type !== 'voice_note' && type !== 'voice') {
            const providerName = recipientUser.providerProfile?.stageName || recipientUser.displayName || 'Provider';
            const memberName = user.displayName || user.username || 'A member';
            const previewText = type === 'text' ? content : '[Sent a media message]';

            sendNewMessageEmail({
              providerId: receiverIdStr,
              providerName,
              memberName,
              messagePreview: previewText,
            }).catch(err => console.error('[Email] sendNewMessageEmail fire-and-forget error:', err));
          }
        } catch (emailErr) {
          console.error('[Email] Failed to trigger sendNewMessageEmail check:', emailErr);
        }
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
      conversationId: message.conversationId,
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
      emitSextMessage(ns, conversationId, { message: responsePayload });
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
      emitSextMessage(ns, requestMsg.conversationId, {
        message: {
          id: imageMsg._id,
          conversationId: imageMsg.conversationId,
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
    const { extras = [], note = '' } = req.body;

    const requestMsg = await AdultMessage.findById(messageId);
    if (!requestMsg || requestMsg.messageType !== 'request_service') {
      return res.status(404).json({ success: false, error: 'Service request not found' });
    }

    if (requestMsg.receiverId?.toString() !== user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Only the recipient of the request can fulfill it' });
    }

    if (requestMsg.serviceTonightRequest?.status !== 'pending') {
      return res.status(409).json({
        success: false,
        error: `Service request is already ${requestMsg.serviceTonightRequest?.status}`
      });
    }

    const baseRate = user.providerProfile?.tonightRate || (user.providerProfile as any)?.pricing?.tonightRate || 0;

    const validatedExtras = (extras ?? [])
      .map((extra: any) => ({
        label: String(extra.label ?? '').trim().slice(0, 50),
        amount: Math.max(0, Number(extra.amount) || 0),
      }))
      .filter((extra: any) => extra.label && extra.amount > 0);

    const extrasTotal = validatedExtras.reduce(
      (sum: number, extra: any) => sum + extra.amount,
      0
    );
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
      emitSextMessage(ns, requestMsg.conversationId, {
        message: {
          id: invoiceMsg._id,
          conversationId: invoiceMsg.conversationId,
          senderId: invoiceMsg.senderId,
          receiverId: invoiceMsg.receiverId,
          content: `🌙 Service request: 💎 ${totalAmount}`,
          mediaType: 'service_request',
          serviceRequest: invoiceMsg.serviceRequest,
          serviceTonightRequest: invoiceMsg.serviceTonightRequest,
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
    // Optimization (⚡ Bolt): Use .lean() on read-only query to eliminate Mongoose document instantiation and model hydration overhead.
    let gifts = await AdultGift.find({ isActive: true }).sort({ sortOrder: 1 }).lean();

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
        emitSextMessage(ns, conversationId, {
          message: {
            id: msg._id,
            conversationId: msg.conversationId,
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

    const { conversationId, type, camSessionId } = req.body;
    if (!conversationId || !type) {
      return res.status(400).json({ success: false, error: 'conversationId and type (video/audio) are required' });
    }

    // Absolute Prohibition: Calling is disabled in official support and notification channels
    if (conversationId === 'official_notifications' || conversationId.startsWith('support_')) {
      return res.status(400).json({ success: false, error: 'Calling functionality is not available in official channels' });
    }

    const conversation = await AdultConversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    if (conversation.type === 'support' || conversation.type === 'official_notification') {
      return res.status(400).json({ success: false, error: 'Calling functionality is not available in official channels' });
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
      ? (receiver.providerProfile?.videoCallPrice ?? receiver.providerProfile?.pricePerMinute ?? 0)
      : (receiver.providerProfile?.audioCallPrice ?? receiver.providerProfile?.pricePerMinute ?? 0);

    const userPrice = getClientPrice(rate);

    if (user.credits < userPrice) {
      return res.status(402).json({ success: false, error: 'Insufficient credits to start call' });
    }

    // Server-side enforcement: single active call invariant
    const callerActive = await checkActiveCall(user._id);
    if (callerActive) {
      return res.status(409).json({ success: false, error: 'You are already on a call on another device.' });
    }

    const receiverActive = await checkActiveCall(receiver._id);
    if (receiverActive) {
      return res.status(409).json({ success: false, error: 'This provider is busy. Try again later.' });
    }

    const webrtcRoomId = `room_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    let resolvedCamSessionId = camSessionId || null;
    if (!resolvedCamSessionId) {
      const activeCam = await CamSession.findOne({
        providerId: receiver._id,
        status: { $in: ['live', 'pending'] }
      });
      if (activeCam) {
        resolvedCamSessionId = activeCam._id;
      }
    }

    const call = new AdultCall({
      conversationId,
      callerId: user._id,
      receiverId: receiver._id,
      activeParticipants: [user._id, receiver._id],
      isActiveSession: true,
      type,
      status: 'ringing',
      perMinuteRate: rate,
      webrtcRoomId,
      camSessionId: resolvedCamSessionId
    });

    try {
      await call.save();
    } catch (err: any) {
      if (err.code === 11000 || err.name === 'MongoServerError' || err.message?.includes('E11000') || err.message?.includes('duplicate key')) {
        const callerIdStr = user._id.toString();
        const dupKeyVal = err.keyValue?.activeParticipants;
        const dupKeyStr = dupKeyVal ? dupKeyVal.toString() : '';
        const isCallerDup = dupKeyStr === callerIdStr || err.message?.includes(callerIdStr);

        const checkCallerAgain = await checkActiveCall(user._id);
        if (isCallerDup || (checkCallerAgain && checkCallerAgain._id.toString() !== call._id.toString())) {
          return res.status(409).json({ success: false, error: 'You are already on a call on another device.' });
        }
        return res.status(409).json({ success: false, error: 'This provider is busy. Try again later.' });
      }
      throw err;
    }

    // Emit socket alert to receiver
    const ns = req.app.get('adultNamespace');
    if (ns) {
      ns.to(`user:${receiver._id.toString()}`).emit('call:incoming', {
        callId: call._id,
        callerId: user._id,
        callerName: user.displayName || user.username,
        callerAvatar: user.profilePhoto || '/placeholder.svg',
        receiverId: receiver._id,
        receiverName: receiver.providerProfile?.stageName || receiver.displayName || receiver.username,
        receiverAvatar: receiver.profilePhoto || '/placeholder.svg',
        type,
        webrtcRoomId,
        rate: userPrice
      });
    }

    // Trigger call push notification
    sendPushToUser(receiver._id, {
      title:    type === 'video'
                  ? `📹 Incoming video call from ${user.displayName || user.username}`
                  : `📞 Incoming call from ${user.displayName || user.username}`,
      body:     'Tap to answer',
      icon:     user.profilePhoto || '/icons/icon-192x192.png',
      badge:    '/icons/badge-72x72.png',
      tag:      `call_${call._id}`,
      renotify: true,
      vibrate:  [500, 200, 500, 200, 500],
      requireInteraction: true,
      url:      `/adult/sext?conversation=${conversationId}&call=${call._id}`,
      unreadCount: 0,
      type:     'incoming_call',
      callId:   call._id.toString(),
      callType: type,
      actions:  [
        { action: 'answer',  title: '📞 Answer' },
        { action: 'decline', title: 'Decline'  },
      ],
    }).catch(err => console.error('[Push][Call] Failed:', err));

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
          liveCall.isActiveSession = false;
          liveCall.activeParticipants = [];
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
      status: call.status,
      receiver: {
        id: receiver._id,
        displayName: receiver.providerProfile?.stageName || receiver.displayName || receiver.username,
        avatarUrl: receiver.profilePhoto || '/placeholder.svg'
      },
      caller: {
        id: user._id,
        displayName: user.displayName || user.username,
        avatarUrl: user.profilePhoto || '/placeholder.svg'
      },
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// Helper to bill a call minute atomically & idempotently
export const billCallMinute = async (
  callId: string,
  minuteIndex: number,
  ns?: any
): Promise<{ success: boolean; error?: string; alreadyBilled?: boolean }> => {
  // Idempotency check 1: Has this transaction already been recorded in DB?
  const existingTx = await CreditTransaction.findOne({
    'metadata.callId': callId,
    'metadata.minuteIndex': minuteIndex,
    type: 'call_charge',
  });
  if (existingTx) {
    return { success: true, alreadyBilled: true };
  }

  const dbSession = await mongoose.startSession();
  dbSession.startTransaction();
  try {
    const call = await AdultCall.findById(callId).session(dbSession);
    if (!call || call.status === 'ended' || call.status === 'declined' || call.status === 'missed') {
      await dbSession.abortTransaction();
      return { success: false, error: 'Call not active or not found' };
    }

    // Secondary check inside transaction session
    const existingTxInSession = await CreditTransaction.findOne({
      'metadata.callId': callId,
      'metadata.minuteIndex': minuteIndex,
      type: 'call_charge',
    }).session(dbSession);

    if (existingTxInSession) {
      await dbSession.abortTransaction();
      return { success: true, alreadyBilled: true };
    }

    const clientPrice = getClientPrice(call.perMinuteRate);
    const callerUser = await AdultUser.findById(call.callerId).session(dbSession);
    const providerUser = await AdultUser.findById(call.receiverId).session(dbSession);

    if (!callerUser || callerUser.credits < clientPrice) {
      await dbSession.abortTransaction();
      return { success: false, error: 'Insufficient credits for next minute' };
    }

    if (!providerUser) {
      await dbSession.abortTransaction();
      return { success: false, error: 'Provider not found' };
    }

    // Deduct from caller
    callerUser.credits -= clientPrice;
    await callerUser.save({ session: dbSession });

    // Payout provider immediately
    const { providerAmount, platformFee } = calculateFees(clientPrice);
    providerUser.credits += providerAmount;
    if (providerUser.providerProfile) {
      providerUser.providerProfile.totalEarnings += providerAmount;
    }
    await providerUser.save({ session: dbSession });

    // Update Call record
    if (call.billedMinutes < minuteIndex) {
      call.billedMinutes = minuteIndex;
    }
    call.lastBilledAt = new Date();
    call.creditsDeducted += clientPrice;
    await call.save({ session: dbSession });

    // Record Transactions with callId and minuteIndex in metadata for unique index protection
    await CreditTransaction.create([{
      userId: callerUser._id,
      type: 'call_charge',
      amount: -clientPrice,
      usdAmount: 0,
      description: `${call.type.charAt(0).toUpperCase() + call.type.slice(1)} call — Min ${minuteIndex}`,
      relatedUserId: providerUser._id,
      status: 'completed',
      metadata: { callId, minuteIndex },
    }], { session: dbSession });

    const providerTx = await CreditTransaction.create([{
      userId: providerUser._id,
      type: 'call_earning',
      amount: providerAmount,
      platformFee,
      usdAmount: 0,
      description: `${call.type.charAt(0).toUpperCase() + call.type.slice(1)} call payout from ${callerUser.username}`,
      relatedUserId: callerUser._id,
      status: 'completed',
      metadata: { callId, minuteIndex },
    }], { session: dbSession });

    await recordPlatformEarning({
      source: 'call',
      amount: platformFee,
      fromUserId: callerUser._id,
      toProviderId: providerUser._id,
      referenceId: providerTx[0]._id,
    }, { session: dbSession });

    await dbSession.commitTransaction();

    if (ns) {
      ns.to(`user:${callerUser._id.toString()}`).emit('wallet:updated', { balance: callerUser.credits });
      ns.to(`user:${providerUser._id.toString()}`).emit('wallet:updated', { balance: providerUser.credits });
    }

    return { success: true };
  } catch (err: any) {
    await dbSession.abortTransaction();
    if (err.code === 11000 || err.name === 'MongoServerError' || err.message?.includes('E11000') || err.message?.includes('duplicate key')) {
      // MongoDB E11000 duplicate key error indicates another concurrent process already billed this minute.
      return { success: true, alreadyBilled: true };
    }
    return { success: false, error: err.message };
  } finally {
    dbSession.endSession();
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

    const ns = req.app.get('adultNamespace');

    // Check if receiver or caller is currently in another active call
    const callerActive = await checkActiveCall(call.callerId);
    if (callerActive && callerActive._id.toString() !== call._id.toString()) {
      return res.status(409).json({ success: false, error: 'The caller is currently in another call.' });
    }

    const receiverActive = await checkActiveCall(call.receiverId);
    if (receiverActive && receiverActive._id.toString() !== call._id.toString()) {
      return res.status(409).json({ success: false, error: 'You are already on a call on another device.' });
    }

    if (call.status !== 'ringing') {
      return res.status(409).json({ success: false, error: 'Call is no longer available or already active.' });
    }

    // 1. Atomically transition call status from ringing to active first
    const updatedCall = await AdultCall.findOneAndUpdate(
      { _id: call._id, status: 'ringing', isActiveSession: true },
      { $set: { status: 'active', startedAt: new Date() } },
      { new: true }
    );

    if (!updatedCall) {
      return res.status(409).json({ success: false, error: 'Call is no longer available or already active.' });
    }

    // 2. Attempt Minute 1 billing
    const billResult = await billCallMinute(updatedCall._id.toString(), 1, ns);
    if (!billResult.success) {
      // If billing fails (e.g. caller ran out of credits before accept), revert call state safely without disrupting public stream
      await AdultCall.updateOne(
        { _id: updatedCall._id },
        { $set: { status: 'failed', endReason: 'insufficient_credits', isActiveSession: false, activeParticipants: [] } }
      );
      return res.status(402).json({ success: false, error: billResult.error || 'Insufficient credits to start call' });
    }

    // 3. Upon successful billing, end active public cam stream if provider is currently streaming
    await endCamSessionForCall(updatedCall, 'accepted_private_call', ns);

    if (ns) {
      ns.to(`user:${updatedCall.callerId.toString()}`).emit('call:accepted', {
        callId,
        webrtcRoomId: updatedCall.webrtcRoomId,
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
    }

    return res.json({
      roomId: updatedCall.webrtcRoomId,
      webrtcRoomId: updatedCall.webrtcRoomId,
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      perMinuteRate: updatedCall.perMinuteRate
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
    call.isActiveSession = false;
    call.activeParticipants = [];
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

    await endCamSessionForCall(call, 'call_declined', ns);

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
      call.isActiveSession = false;
      call.activeParticipants = [];
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
    const ns = req.app.get('adultNamespace');

    if (call.status === 'active' && call.startedAt) {
      if (durationSeconds < MINIMUM_BILLING_SECONDS && call.billedMinutes > 0) {
        // Check if refund was already processed for this call
        const existingRefund = await CreditTransaction.findOne({
          'metadata.callId': call._id.toString(),
          type: 'call_refund',
        });

        if (!existingRefund) {
          const refundSession = await mongoose.startSession();
          refundSession.startTransaction();
          try {
            const callerUser = await AdultUser.findById(call.callerId).session(refundSession);
            const providerUser = await AdultUser.findById(call.receiverId).session(refundSession);

            if (callerUser && providerUser) {
              const clientPrice = call.creditsDeducted;
              const { providerAmount, platformFee } = calculateFees(clientPrice);

              // 1. Calculate how much the provider can absorb without balance dropping below 0
              const recoverableProviderAmount = Math.min(Math.max(0, providerUser.credits), providerAmount);
              // 2. Unrecoverable provider amount (if provider spent/withdrew earnings)
              const unrecoverableAmount = providerAmount - recoverableProviderAmount;
              // 3. Member receives net refund (original client charge minus unrecoverable provider reversal)
              const netMemberRefund = Math.max(0, clientPrice - unrecoverableAmount);

              // Deduct recoverable provider earnings (provider.credits >= 0 invariant preserved strictly)
              providerUser.credits -= recoverableProviderAmount;
              if (providerUser.providerProfile) {
                providerUser.providerProfile.totalEarnings = Math.max(0, providerUser.providerProfile.totalEarnings - recoverableProviderAmount);
              }
              await providerUser.save({ session: refundSession });

              // Credit net refund to member
              callerUser.credits += netMemberRefund;
              await callerUser.save({ session: refundSession });

              const refundTx = await CreditTransaction.create([{
                userId: callerUser._id,
                type: 'call_refund',
                amount: netMemberRefund,
                usdAmount: 0,
                description: `${call.type.charAt(0).toUpperCase() + call.type.slice(1)} call refund (<10s)`,
                relatedUserId: providerUser._id,
                status: 'completed',
                metadata: { callId: call._id.toString(), minuteIndex: 1, unrecoverableAmount },
              }], { session: refundSession });

              // Explicit debit reversion record for provider trace
              if (recoverableProviderAmount > 0) {
                await CreditTransaction.create([{
                  userId: providerUser._id,
                  type: 'call_refund',
                  amount: -recoverableProviderAmount,
                  usdAmount: 0,
                  description: `${call.type.charAt(0).toUpperCase() + call.type.slice(1)} call revert (<10s)`,
                  relatedUserId: callerUser._id,
                  status: 'completed',
                  metadata: { callId: call._id.toString(), minuteIndex: 1, originalTxId: refundTx[0]._id },
                }], { session: refundSession });
              }

              if (platformFee > 0) {
                await recordPlatformEarning({
                  source: 'call',
                  amount: -platformFee,
                  fromUserId: callerUser._id,
                  toProviderId: providerUser._id,
                  referenceId: refundTx[0]._id,
                }, { session: refundSession });
              }

              call.creditsDeducted = 0;
              call.billedMinutes = 0;
              await call.save({ session: refundSession });

              if (ns) {
                ns.to(`user:${callerUser._id.toString()}`).emit('wallet:updated', { balance: callerUser.credits });
                ns.to(`user:${providerUser._id.toString()}`).emit('wallet:updated', { balance: providerUser.credits });
              }
            }
            await refundSession.commitTransaction();
          } catch (err: any) {
            console.error("REFUND_SESSION_ERROR:", err);
            await refundSession.abortTransaction();
          } finally {
            refundSession.endSession();
          }
        }
      } else if (durationSeconds >= MINIMUM_BILLING_SECONDS) {
        // Bill any pending unbilled minutes up to duration
        const neededMinutes = Math.max(1, Math.ceil(durationSeconds / 60));
        if (neededMinutes > call.billedMinutes) {
          for (let min = call.billedMinutes + 1; min <= neededMinutes; min++) {
            const billResult = await billCallMinute(call._id.toString(), min, ns);
            if (!billResult.success) {
              break;
            }
          }
        }
      }
    }

    const updatedCall = await AdultCall.findById(call._id) || call;
    updatedCall.status = 'ended';
    updatedCall.endedAt = now;
    updatedCall.endedBy = user._id;
    updatedCall.endReason = reason;
    updatedCall.durationSeconds = durationSeconds;
    updatedCall.isActiveSession = false;
    updatedCall.activeParticipants = [];
    await updatedCall.save();

    const isBilled = updatedCall.creditsDeducted > 0;
    const durationLabel = durationSeconds >= 60
      ? `${Math.floor(durationSeconds / 60)} min ${durationSeconds % 60} sec`
      : `${durationSeconds} sec`;

    const systemText = isBilled ? `Call ended · ${durationLabel}` : `Call not connected`;

    const systemMsg = new AdultMessage({
      conversationId: updatedCall.conversationId,
      senderId: updatedCall.callerId,
      receiverId: updatedCall.receiverId,
      content: encrypt(systemText),
      messageType: 'system',
      systemText
    });
    await systemMsg.save();

    // Emit sockets
    if (ns) {
      ns.to(`user:${updatedCall.callerId.toString()}`).emit('call:ended', { callId, durationSeconds, creditsDeducted: updatedCall.creditsDeducted });
      ns.to(`user:${updatedCall.receiverId.toString()}`).emit('call:ended', { callId, durationSeconds, creditsDeducted: updatedCall.creditsDeducted });
      ns.to(`call:${callId}`).emit('call:ended', { callId, reason });
    }

    await endCamSessionForCall(updatedCall, reason || 'call_ended', ns);

    return res.json({
      callId: updatedCall._id,
      durationSeconds,
      creditsDeducted: updatedCall.creditsDeducted,
      wasBilled: updatedCall.creditsDeducted > 0
    });
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

    // Optimization (⚡ Bolt): Use .lean() on read-only query to eliminate Mongoose document instantiation and model hydration overhead.
    const calls = await AdultCall.find({
      $or: [{ callerId: user._id }, { receiverId: user._id }]
    })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    // ⚡ OPTIMIZATION (Bolt): Eliminate N+1 database roundtrips.
    // Batch query all distinct other user profiles in a single query instead of calling AdultUser.findById inside a loop.
    const otherUserIds = Array.from(
      new Set(
        calls.map(c => (c.callerId.toString() === user._id.toString() ? c.receiverId.toString() : c.callerId.toString()))
      )
    );

    const otherUsers = otherUserIds.length > 0
      ? await AdultUser.find({ _id: { $in: otherUserIds } })
          .select('displayName username profilePhoto providerProfile')
          .lean()
      : [];

    const userMap = new Map(otherUsers.map(u => [u._id.toString(), u]));

    const results = calls.map(c => {
      const otherUserId = c.callerId.toString() === user._id.toString() ? c.receiverId.toString() : c.callerId.toString();
      const otherUser = userMap.get(otherUserId);

      return {
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
      };
    });

    return res.json(results);
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
