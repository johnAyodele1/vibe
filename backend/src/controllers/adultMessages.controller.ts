import { Request, Response } from 'express';
import AdultMessage from '../models/AdultMessage';
import AdultUser from '../models/AdultUser';
import { encrypt, decrypt } from '../services/encryptionService';
import mongoose from 'mongoose';

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
  const messages = await AdultMessage.find({ conversationId })
    .sort({ createdAt: -1 })
    .limit(20)
    .skip((Number(page) - 1) * 20);

  const decryptedMessages = messages.map(m => ({
    ...m.toObject(),
    content: decrypt(m.content),
  }));

  res.json({ success: true, data: { messages: decryptedMessages } });
};

export const sendMessage = async (req: Request, res: Response) => {
  const { receiverId, content, messageType, mediaUrl, unlockCost } = req.body;
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

  if (user.credits < message.unlockCost) {
    return res.status(400).json({ success: false, error: { code: 'INSUFFICIENT_CREDITS', message: 'Insufficient balance' } });
  }

  user.credits -= message.unlockCost;
  await user.save();

  message.unlockedBy.push(user._id);
  await message.save();

  res.json({ success: true, message: 'Media unlocked', data: { mediaUrl: message.mediaUrl } });
};
