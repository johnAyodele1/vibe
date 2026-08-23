import { Response } from 'express';
import Message from '../models/Message';
import Conversation from '../models/Conversation';
import User from '../models/User';
import { getIO } from '../socket';
import { sendPushNotification } from '../services/notification.service';
import { sendPushToUser } from '../shared/push';
import { IConversation, IMessage } from '../types/models';
import { Types } from 'mongoose';
import { IExpressRequest } from '../types/express';

// @desc    Get user's conversations
// @access  Private
export const getConversations = async (req: IExpressRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    // Optimization (⚡ Bolt): Use .lean() on read-only query to eliminate Mongoose document instantiation and model hydration overhead.
    const conversations = await Conversation.find({
      participants: req.user._id,
      isActive: true,
    })
      .populate({
        path: 'lastMessage',
        populate: { path: 'sender', select: 'firstName lastName' },
      })
      .populate('participantInfo.user', 'firstName lastName photos isOnline lastActive')
      .sort({ lastMessageAt: -1 })
      .lean();

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
      .populate({
        path: 'lastMessage',
        populate: { path: 'sender', select: 'firstName lastName' },
      })
      .populate('participantInfo.user', 'firstName lastName photos isOnline lastActive') as IConversation | null;

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
        .populate({
          path: 'lastMessage',
          populate: { path: 'sender', select: 'firstName lastName' },
        })
        .populate('participantInfo.user', 'firstName lastName photos isOnline lastActive') as IConversation | null;
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

    // Optimization (⚡ Bolt): Use .lean() on read-only query to eliminate Mongoose document instantiation and model hydration overhead.
    const messages = await Message.find({
      conversation: req.params.conversationId,
      isDeleted: false,
    })
      .populate('sender', 'firstName lastName photos')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    // Optimization (⚡ Bolt): Run Message.updateMany and Conversation.findById concurrently via Promise.all.
    const [, conversation] = await Promise.all([
      Message.updateMany(
        {
          conversation: req.params.conversationId,
          receiver: req.user._id as Types.ObjectId,
          isRead: false,
        },
        { isRead: true, readAt: new Date() },
      ),
      Conversation.findById(req.params.conversationId),
    ]);

    // Reset unread count for conversation
    if (conversation) {
      await conversation.resetUnreadCount(req.user._id as Types.ObjectId);
    }

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

    // Optimization (⚡ Bolt): Use .lean() on read-only queries to eliminate Mongoose document hydration overhead.
    const [currentUser, receiverUser] = await Promise.all([
      User.findById(currentUserId).lean(),
      User.findById(receiverId).lean(),
    ]);

    if (!receiverUser) {
      return res.status(404).json({ success: false, message: 'Receiver not found' });
    }

    if (currentUser?.blockedUsers.some(id => id.toString() === receiverId)) {
      return res.status(403).json({ success: false, message: 'You have blocked this user' });
    }

    if (receiverUser.blockedUsers.some(id => id.toString() === currentUserId)) {
      return res.status(403).json({ success: false, message: 'This user has blocked you' });
    }

    if (receiverUser.isBlocked) {
      return res.status(403).json({ success: false, message: 'This user account is suspended' });
    }

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

    // Increment unread count for receiver
    await conversation.incrementUnreadCount(receiverId);

    // Populate sender info
    await message.populate('sender', 'firstName lastName photos');

    // Emit message to conversation room and receiver's user room
    const io = getIO();
    if (io) {
      io.to((conversation._id as Types.ObjectId).toString()).emit('message', message);
      io.to(receiverId).emit('message', message);
    }

    // Send push notification
    sendPushNotification(receiverId, {
      title: `New message from ${req.user.firstName}`,
      body: messageType === 'text' ? content : `Sent a ${messageType}`,
      data: {
        type: 'message',
        conversationId: (conversation._id as Types.ObjectId).toString(),
        senderId: currentUserId,
      },
    }).catch(err => console.error('Push notification failed:', err));

    // Also send Custom VAPID push notification
    const unreadCount = conversation.unreadCount?.get(receiverId.toString()) || 0;

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

    sendPushToUser(receiverId, {
      title: `💬 ${req.user.firstName}`,
      body: getMessagePreview(messageType, content),
      icon: req.user.photos?.[0]?.url || '',
      badge: '/icons/badge-72x72.png',
      tag: `conv_${(conversation._id as Types.ObjectId).toString()}`,
      renotify: true,
      url: `/chat/${(conversation._id as Types.ObjectId).toString()}`,
      unreadCount,
      type: 'new_message',
      conversationId: (conversation._id as Types.ObjectId).toString(),
    }, 'dating').catch(err => console.error('[Push] sendPushToUser failed for dating:', err));

    return res.status(201).json({ success: true, data: { message } });
  } catch (error) {
    console.error('Send message error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Mark conversation as read
// @access  Private
export const markAsRead = async (req: IExpressRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { conversationId } = req.params;
    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    if (!conversation.participants.some(p => p.toString() === (req.user!._id as Types.ObjectId).toString())) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    await conversation.resetUnreadCount(req.user._id as Types.ObjectId);

    // Also mark messages as read
    await Message.updateMany(
      {
        conversation: conversationId,
        receiver: req.user._id as Types.ObjectId,
        isRead: false,
      },
      { isRead: true, readAt: new Date() }
    );

    return res.json({ success: true, message: 'Conversation marked as read' });
  } catch (error) {
    console.error('Mark as read error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
