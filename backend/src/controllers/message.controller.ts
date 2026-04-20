import { Response } from 'express';
import Message from '../models/Message';
import Conversation from '../models/Conversation';
import { getIO } from '../socket';
import { IConversation, IMessage } from '../types/models';
import { Types } from 'mongoose';
import { IExpressRequest } from '../types/express';

// @desc    Get user's conversations
// @access  Private
export const getConversations = async (req: IExpressRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const conversations = await Conversation.find({
      participants: req.user._id,
      isActive: true,
    })
      .populate('lastMessage')
      .populate('participantInfo.user', 'firstName lastName photos isOnline')
      .sort({ lastMessageAt: -1 });

    return res.json({ success: true, data: { conversations } });
  } catch (error) {
    console.error('Get conversations error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const getConversation = async (req: IExpressRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const currentUserId = (req.user._id as Types.ObjectId).toString();
    let conversation = await Conversation.findById(req.params.conversationId)
      .populate('lastMessage')
      .populate('participantInfo.user', 'firstName lastName photos isOnline') as IConversation | null;

    if (!conversation || !conversation.participants.some(p => p.toString() === currentUserId)) {
      return res
        .status(404)
        .json({ success: false, message: 'Conversation not found' });
    }

    // Ensure participant info is populated
    if (
      !conversation.participantInfo ||
      conversation.participantInfo.length === 0
    ) {
      await conversation.updateParticipantInfo();
      conversation = await Conversation.findById(req.params.conversationId)
        .populate('lastMessage')
        .populate('participantInfo.user', 'firstName lastName photos isOnline') as IConversation | null;
    }

    return res.json({ success: true, data: { conversation } });
  } catch (error) {
    console.error('Get conversation error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get messages for a conversation
// @access  Private
export const getMessages = async (req: IExpressRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const { page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const messages = await Message.find({
      conversation: req.params.conversationId,
      isDeleted: false,
    })
      .populate('sender', 'firstName lastName photos')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    // Mark messages as read
    await Message.updateMany(
      {
        conversation: req.params.conversationId,
        receiver: req.user._id as Types.ObjectId,
        isRead: false,
      },
      { isRead: true, readAt: new Date() },
    );

    return res.json({ success: true, data: { messages: messages.reverse() } });
  } catch (error) {
    console.error('Get messages error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Send a message
// @access  Private
export const sendMessage = async (req: IExpressRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const { receiverId, content, messageType = 'text' } = req.body;
    const currentUserId = (req.user._id as Types.ObjectId).toString();

    // Find or create conversation
    let conversation = await Conversation.findDirectConversation(
      currentUserId,
      receiverId,
    );

    if (!conversation) {
      conversation = new Conversation({
        participants: [req.user._id, receiverId],
      });
      await conversation.save();
      await conversation.updateParticipantInfo();
    }

    // Create message
    const message = new Message({
      conversation: conversation._id,
      sender: req.user._id,
      receiver: receiverId,
      content,
      messageType,
    }) as IMessage;

    await message.save();

    // Update conversation's last message
    await conversation.updateLastMessage(message);

    // Populate sender info
    await message.populate('sender', 'firstName lastName photos');

    // Emit message to conversation room and receiver's user room
    const io = getIO();
    if (io) {
      io.to((conversation._id as Types.ObjectId).toString()).emit('message', message);
      io.to(receiverId).emit('message', message);
    }

    return res.status(201).json({ success: true, data: { message } });
  } catch (error) {
    console.error('Send message error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
