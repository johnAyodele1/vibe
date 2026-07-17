import { Request, Response } from 'express';
import AdultMessage from '../models/AdultMessage';
import AdultUser from '../models/AdultUser';
import { encrypt, decrypt } from '../services/encryptionService';
import mongoose from 'mongoose';
import { getClientPrice } from '../services/pricingService';
import CreditTransaction from '../models/CreditTransaction';

export const startConversation = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'Recipient userId is required' });
    }

    const conversationId = [user._id.toString(), userId].sort().join('_');

    // Just verify the recipient exists
    const recipient = await AdultUser.findById(userId);
    if (!recipient) {
      return res.status(404).json({ success: false, error: 'Recipient not found' });
    }

    return res.json({ success: true, conversationId });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getConversations = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const userId = user._id;

    // Get all messages where user is sender or receiver
    const messages = await AdultMessage.find({
      $or: [{ senderId: userId }, { receiverId: userId }]
    }).sort({ createdAt: -1 });

    const conversationGroups = new Map<string, any[]>();
    messages.forEach(msg => {
      const group = conversationGroups.get(msg.conversationId) || [];
      group.push(msg);
      conversationGroups.set(msg.conversationId, group);
    });

    const results: any[] = [];

    for (const [convId, msgs] of conversationGroups.entries()) {
      const lastMsgObj = msgs[0];
      const otherUserIdStr = lastMsgObj.senderId.toString() === userId.toString()
        ? lastMsgObj.receiverId.toString()
        : lastMsgObj.senderId.toString();

      const otherUser = await AdultUser.findById(otherUserIdStr).select('displayName profilePhoto providerProfile country');

      const unreadCount = msgs.filter(m => m.receiverId.toString() === userId.toString() && !m.isRead).length;

      let decryptedContent = '';
      try {
        decryptedContent = decrypt(lastMsgObj.content);
      } catch (err) {
        decryptedContent = lastMsgObj.content;
      }

      results.push({
        conversationId: convId,
        otherUser: otherUser ? {
          id: otherUser._id,
          displayName: otherUser.providerProfile?.stageName || otherUser.displayName || 'User',
          avatarUrl: otherUser.profilePhoto || '/placeholder.svg',
          isOnline: otherUser.providerProfile?.isLive || false,
        } : null,
        lastMessage: {
          id: lastMsgObj._id,
          content: decryptedContent,
          createdAt: lastMsgObj.createdAt,
        },
        unreadCount,
      });
    }

    return res.json(results);
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getMessages = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const { conversationId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 30;

    const messages = await AdultMessage.find({ conversationId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const formatted = messages.map(m => {
      let decryptedContent = '';
      try {
        decryptedContent = decrypt(m.content);
      } catch (err) {
        decryptedContent = m.content;
      }

      const isUnlocked = m.unlockedBy.some(id => id.toString() === user._id.toString()) ||
        m.senderId.toString() === user._id.toString() ||
        m.unlockCost === 0;

      return {
        id: m._id,
        senderId: m.senderId,
        content: decryptedContent,
        mediaUrl: isUnlocked ? m.mediaUrl : '', // Lock the url if not paid
        mediaType: m.messageType,
        creditCost: m.unlockCost,
        isUnlocked,
        createdAt: m.createdAt,
        readAt: m.readAt,
      };
    });

    return res.json(formatted);
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const sendMessage = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const { conversationId } = req.params;
    const { content = '', mediaUrl = '', creditCost = 0, mediaType = 'text' } = req.body;

    const convIdStr = String(conversationId);
    const parts = convIdStr.split('_');
    const receiverId = parts.find((p: string) => p !== user._id.toString());
    if (!receiverId) {
      return res.status(400).json({ success: false, error: 'Invalid conversationId' });
    }

    const message = new AdultMessage({
      conversationId: convIdStr,
      senderId: user._id,
      receiverId: new mongoose.Types.ObjectId(receiverId),
      content: encrypt(content),
      messageType: mediaType,
      mediaUrl,
      unlockCost: creditCost,
      mediaBlurred: creditCost > 0,
    });

    await message.save();

    return res.status(201).json({
      id: message._id,
      senderId: message.senderId,
      content,
      mediaUrl,
      mediaType,
      creditCost,
      isUnlocked: true,
      createdAt: message.createdAt,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const unlockMedia = async (req: Request, res: Response) => {
  const { messageId } = req.params;
  const user = req.adultUser;
  if (!user) return res.status(401).json({ success: false, error: 'Auth required' });

  const message = await AdultMessage.findById(messageId);
  if (!message) return res.status(404).json({ success: false, error: 'Message not found' });
  if (message.unlockedBy.some(id => id.toString() === user._id.toString())) {
    return res.json({ success: true, mediaUrl: message.mediaUrl });
  }

  const clientCost = getClientPrice(message.unlockCost || 0);

  if (user.credits < clientCost) {
    return res.status(402).json({ success: false, error: 'Insufficient credits' });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    user.credits -= clientCost;
    await user.save({ session });

    const provider = await AdultUser.findById(message.senderId).session(session);
    if (provider) {
      provider.credits += message.unlockCost;
      if (provider.providerProfile) {
        provider.providerProfile.totalEarnings += message.unlockCost;
      }
      await provider.save({ session });
    }

    await CreditTransaction.create([{
      userId: user._id,
      type: 'tip',
      amount: -clientCost,
      usdAmount: 0,
      description: `Unlock media from ${provider?.username || 'provider'}`,
      relatedUserId: provider?._id,
      status: 'completed',
    }], { session });

    if (provider) {
      await CreditTransaction.create([{
        userId: provider._id,
        type: 'tip',
        amount: message.unlockCost,
        usdAmount: 0,
        description: `Media unlock by ${user.username}`,
        relatedUserId: user._id,
        status: 'completed',
      }], { session });
    }

    message.unlockedBy.push(user._id);
    await message.save({ session });

    await session.commitTransaction();
    res.json({ success: true, mediaUrl: message.mediaUrl });
  } catch (err: any) {
    await session.abortTransaction();
    res.status(500).json({ success: false, error: err.message });
  } finally {
    session.endSession();
  }
};

export const markAsRead = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const { conversationId } = req.params;

    await AdultMessage.updateMany(
      { conversationId, receiverId: user._id, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );

    return res.json({ success: true, message: 'Messages marked as read' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
