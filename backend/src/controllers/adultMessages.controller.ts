import { Request, Response } from 'express';
import AdultMessage from '../models/AdultMessage';
import AdultUser from '../models/AdultUser';
import { encrypt, decrypt } from '../services/encryptionService';
import mongoose from 'mongoose';
import { getClientPrice } from '../services/pricingService';
import CreditTransaction from '../models/CreditTransaction';
import { calculateFees, recordPlatformEarning } from '../shared/fees';
import { getSignedUrl } from '../shared/media/cloudinaryUpload';

export const getConversations = async (req: Request, res: Response) => {
  const userId = req.adultUser?._id;
  const conversations = await AdultMessage.aggregate([
    { $match: { $or: [{ senderId: userId }, { receiverId: userId }] } },
    { $sort: { createdAt: -1 } },
    { $group: {
        _id: '$conversationId',
        lastMessage: { $first: '$$ROOT' }
    }},
  ]);
  res.json({ success: true, data: { conversations } });
};

export const getMessages = async (req: Request, res: Response) => {
  const { conversationId } = req.params;
  const { page = 1 } = req.query;
  const senderId = req.adultUser?._id;

  // ⚡ OPTIMIZATION (Bolt): Use .lean() on read-only message stream query to bypass Mongoose document hydration overhead.
  const messages = await AdultMessage.find({ conversationId })
    .sort({ createdAt: -1 })
    .limit(20)
    .skip((Number(page) - 1) * 20)
    .lean();

  const decryptedMessages = messages.map(m => {
    let decryptedContent = '';
    try {
      decryptedContent = decrypt(m.content);
    } catch {
      decryptedContent = m.content;
    }

    const cost = (m as any).creditCost || m.unlockCost || 0;
    const unlockedByList = m.unlockedBy || [];
    const isUnlocked = cost === 0 ||
      !senderId ||
      m.senderId.toString() === senderId.toString() ||
      unlockedByList.some((id: any) => id.toString() === senderId.toString());

    let finalMediaUrl = m.mediaUrl || '';
    if (isUnlocked && m.cloudinaryPublicId) {
      try {
        finalMediaUrl = getSignedUrl(m.cloudinaryPublicId, 3600);
      } catch (err) {
        console.error('Error signing URL in getMessages:', err);
      }
    }

    return {
      ...m,
      content: decryptedContent,
      mediaUrl: isUnlocked ? finalMediaUrl : '',
    };
  });

  res.json({ success: true, data: { messages: decryptedMessages } });
};

export const sendMessage = async (req: Request, res: Response) => {
  const { receiverId, content, messageType, mediaUrl, unlockCost, cloudinaryPublicId } = req.body;
  const senderId = req.adultUser?._id;

  const conversationId = [senderId.toString(), receiverId].sort().join('_');

  const message = new AdultMessage({
    conversationId,
    senderId,
    receiverId,
    content: encrypt(content),
    messageType,
    mediaUrl,
    unlockCost,
    mediaBlurred: !!mediaUrl,
    cloudinaryPublicId,
  });

  await message.save();
  res.status(201).json({ success: true, data: { message: { ...message.toObject(), content } } });
};

export const unlockMedia = async (req: Request, res: Response) => {
  const { messageId } = req.params;
  const user = req.adultUser;
  if (!user) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Auth required' } });

  const message = await AdultMessage.findById(messageId);
  if (!message) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Message not found' } });
  if (message.unlockedBy.includes(user._id)) return res.json({ success: true, message: 'Already unlocked' });

  const clientCost = getClientPrice(message.unlockCost);

  if (user.credits < clientCost) {
    return res.status(400).json({ success: false, error: { code: 'INSUFFICIENT_CREDITS', message: 'Insufficient balance' } });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    user.credits -= clientCost;
    await user.save({ session });

    const { providerAmount, platformFee } = calculateFees(message.unlockCost);

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

    res.json({ success: true, message: 'Media unlocked', data: { mediaUrl: finalMediaUrl } });
  } catch (err) {
    await session.abortTransaction();
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Transaction failed' } });
  } finally {
    session.endSession();
  }
};
