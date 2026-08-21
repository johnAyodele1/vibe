import { Request, Response } from 'express';
import mongoose from 'mongoose';
import OfficialNotification from '../models/OfficialNotification';
import OfficialNotificationRead from '../models/OfficialNotificationRead';
import AdultUser from '../models/AdultUser';
import AdultConversation from '../models/AdultConversation';
import AdultMessage from '../models/AdultMessage';
import Report from '../models/Report';
import AppConfig from '../models/AppConfig';
import { encrypt, decrypt } from '../services/encryptionService';
import { sendPushToUser } from '../shared/push';
import { uploadToCloudinary, FOLDERS } from '../shared/media/cloudinaryUpload';

const OFFICIAL_CHANNELS_KEY = 'official_channels_config';

export const DEFAULT_OFFICIAL_CONFIG = {
  notifications: {
    avatarUrl: '/icons/icon-192x192.png',
    badge: 'official',
    badgeType: 'blue',
    enabled: true,
  },
  support: {
    avatarUrl: '/icons/icon-192x192.png',
    badge: 'official',
    badgeType: 'blue',
    enabled: true,
  },
};

export const getOfficialChannelsConfig = async (req: Request, res: Response) => {
  try {
    let configDoc = await AppConfig.findOne({ key: OFFICIAL_CHANNELS_KEY });
    if (!configDoc) {
      configDoc = await AppConfig.create({
        key: OFFICIAL_CHANNELS_KEY,
        value: DEFAULT_OFFICIAL_CONFIG,
      });
    }
    return res.json({ success: true, data: configDoc.value || DEFAULT_OFFICIAL_CONFIG });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const updateOfficialChannelsConfig = async (req: Request, res: Response) => {
  try {
    if (!(req as any).user?._id) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const { notifications, support } = req.body;
    const existingDoc = await AppConfig.findOne({ key: OFFICIAL_CHANNELS_KEY });
    const currentConfig = (existingDoc && typeof existingDoc.value === 'object' && !Array.isArray(existingDoc.value))
      ? (existingDoc.value as typeof DEFAULT_OFFICIAL_CONFIG)
      : DEFAULT_OFFICIAL_CONFIG;

    const newConfig = {
      notifications: { ...currentConfig.notifications, ...(notifications || {}) },
      support: { ...currentConfig.support, ...(support || {}) },
    };

    const updated = await AppConfig.findOneAndUpdate(
      { key: OFFICIAL_CHANNELS_KEY },
      { $set: { value: newConfig } },
      { upsert: true, new: true }
    );

    return res.json({ success: true, data: updated?.value || newConfig });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const adminCreateNotification = async (req: Request, res: Response) => {
  try {
    if (!(req as any).user?._id) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const { title, content, targetAudience = 'both', mediaUrl = '' } = req.body;

    if (!title || !content) {
      return res.status(400).json({ success: false, error: 'Title and content are required' });
    }

    if (!['users', 'providers', 'both'].includes(targetAudience)) {
      return res.status(400).json({ success: false, error: 'Invalid targetAudience' });
    }

    const notification = await OfficialNotification.create({
      title,
      content,
      targetAudience,
      mediaUrl,
    });

    const ns = req.app.get('adultNamespace');
    if (ns) {
      const payload = {
        id: notification._id,
        title: notification.title,
        content: notification.content,
        targetAudience: notification.targetAudience,
        createdAt: notification.createdAt,
      };

      if (targetAudience === 'users') {
        ns.to('role:user').emit('official:new_notification', payload);
      } else if (targetAudience === 'providers') {
        ns.to('role:provider').emit('official:new_notification', payload);
      } else {
        ns.to('role:user').to('role:provider').emit('official:new_notification', payload);
      }
    }

    // Fan-out push notifications asynchronously to eligible audience
    (async () => {
      try {
        let roleQuery: any = {};
        if (targetAudience === 'users') {
          roleQuery = { role: { $ne: 'provider' } };
        } else if (targetAudience === 'providers') {
          roleQuery = { role: 'provider' };
        }
        // Optimization (⚡ Bolt): Use .lean() on read-only query to eliminate Mongoose document hydration overhead.
        const recipients = await AdultUser.find(roleQuery).select('_id').lean();
        for (const user of recipients) {
          sendPushToUser(user._id, {
            title: `📢 ${title}`,
            body: content.slice(0, 100),
            icon: '/icons/icon-192x192.png',
            tag: `official_notif_${notification._id}`,
            url: `/adult/sext?conversation=official_notifications`,
            unreadCount: 0,
            type: 'official_notification',
          }).catch(() => {});
        }
      } catch (err) {
        console.error('[OfficialNotification] Error broadcasting push:', err);
      }
    })();

    return res.status(201).json({ success: true, notification });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const adminGetNotifications = async (req: Request, res: Response) => {
  try {
    if (!(req as any).user?._id) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const notifications = await OfficialNotification.find().sort({ createdAt: -1 }).limit(100).lean();
    return res.json({ success: true, notifications });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getNotificationAudienceQuery = (role?: string) => {
  return role === 'provider'
    ? { targetAudience: { $in: ['providers', 'both'] } }
    : { targetAudience: { $in: ['users', 'both'] } };
};

export const getOfficialNotificationsForUser = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 30));

    const audienceFilter = getNotificationAudienceQuery(user.role);

    const total = await OfficialNotification.countDocuments(audienceFilter);
    const notifications = await OfficialNotification.find(audienceFilter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const readDocs = await OfficialNotificationRead.find({
      userId: user._id,
      notificationId: { $in: notifications.map((n) => n._id) },
    }).lean();

    const readSet = new Set(readDocs.map((r) => r.notificationId.toString()));

    const formatted = notifications.map((n) => ({
      id: n._id,
      title: n.title,
      content: n.content,
      targetAudience: n.targetAudience,
      mediaUrl: n.mediaUrl || '',
      createdAt: n.createdAt,
      isRead: readSet.has(n._id.toString()),
    }));

    return res.json({
      success: true,
      notifications: formatted,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const markNotificationRead = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const { notificationId } = req.params;
    if (!notificationId) {
      return res.status(400).json({ success: false, error: 'notificationId is required' });
    }

    await OfficialNotificationRead.updateOne(
      { userId: user._id, notificationId },
      { $setOnInsert: { readAt: new Date() } },
      { upsert: true }
    );

    return res.json({ success: true, message: 'Notification marked as read' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getOrCreateSupportConversation = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const conversationId = `support_${user._id.toString()}`;

    // Atomic upsert to avoid race condition on concurrent support conversation initialization
    const conversation = await AdultConversation.findOneAndUpdate(
      { _id: conversationId },
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

    return res.json({ success: true, conversation });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const sendSupportMessage = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const { content = '', type = 'text', mediaUrl = '', mediaThumbnailUrl = '' } = req.body;
    const conversationId = `support_${user._id.toString()}`;

    let conversation = await AdultConversation.findById(conversationId);
    if (!conversation) {
      conversation = new AdultConversation({
        _id: conversationId,
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
      });
      await conversation.save();
    }

    const convAny = conversation as any;
    if (convAny.supportMetadata?.status === 'closed') {
      convAny.supportMetadata.status = 'open';
    }

    const userMsg = new AdultMessage({
      conversationId,
      senderId: user._id,
      content: encrypt(content || `[${type}]`),
      messageType: type,
      mediaUrl,
      mediaThumbnailUrl,
    });
    await userMsg.save();

    let autoReplyPayload = null;

    // Automated welcome message on first user support message
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

      autoReplyPayload = {
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
    }

    conversation.lastMessage = {
      content: encrypt(content || `[${type}]`),
      mediaType: type,
      senderId: user._id,
      sentAt: new Date(),
    };
    await conversation.save();

    const responsePayload = {
      id: userMsg._id,
      conversationId,
      senderId: user._id,
      content,
      mediaType: type,
      mediaUrl,
      mediaThumbnailUrl,
      createdAt: userMsg.createdAt,
    };

    const ns = req.app.get('adultNamespace');
    if (ns) {
      ns.to(`conv:${conversationId}`).emit('sext:new_message', { message: responsePayload });
      if (autoReplyPayload) {
        ns.to(`conv:${conversationId}`).emit('sext:new_message', { message: autoReplyPayload });
      }
      ns.emit('admin:support_message', { conversationId, userId: user._id });
    }

    return res.status(201).json({
      success: true,
      message: responsePayload,
      autoReply: autoReplyPayload,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const adminUploadChannelAvatar = async (req: Request, res: Response) => {
  try {
    if (!(req as any).user?._id) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const result = await uploadToCloudinary(file.buffer, {
      folder: FOLDERS.profilePhoto,
      resourceType: 'image',
    });

    return res.json({ success: true, url: result.url });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const adminGetSupportMessages = async (req: Request, res: Response) => {
  try {
    if (!(req as any).user?._id) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const { conversationId } = req.params;
    const conversation = await AdultConversation.findById(conversationId);
    if (!conversation || (conversation as any).type !== 'support') {
      return res.status(404).json({ success: false, error: 'Support conversation not found' });
    }

    const messages = await AdultMessage.find({ conversationId }).sort({ createdAt: 1 }).lean();

    const formatted = messages.map((m) => {
      let content = '';
      try {
        content = decrypt(m.content);
      } catch {
        content = m.content;
      }

      return {
        id: m._id,
        conversationId: m.conversationId,
        senderId: m.senderId,
        receiverId: m.receiverId,
        content,
        mediaType: m.messageType,
        mediaUrl: m.mediaUrl || '',
        systemText: m.systemText || '',
        createdAt: m.createdAt,
      };
    });

    return res.json({ success: true, messages: formatted });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const adminGetSupportQueue = async (req: Request, res: Response) => {
  try {
    if (!(req as any).user?._id) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const { status, tag } = req.query;
    const query: any = { type: 'support' };

    if (status) {
      query['supportMetadata.status'] = status;
    }
    if (tag) {
      query['supportMetadata.tags'] = tag;
    }

    // Performance optimization: use .lean() and batch user lookup to eliminate N+1 database queries
    const conversations = await AdultConversation.find(query).sort({ updatedAt: -1 }).limit(100).lean();

    const userIds = conversations
      .map((conv) => conv.participants?.[0])
      .filter((id): id is mongoose.Types.ObjectId => Boolean(id));

    const users = userIds.length > 0
      ? await AdultUser.find({ _id: { $in: userIds } }).select('_id username displayName profilePhoto role').lean()
      : [];

    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    const formatted = conversations.map((conv) => {
      const convItem = conv as any;
      const participantId = conv.participants?.[0]?.toString();
      const user = participantId ? userMap.get(participantId) : null;
      let preview = '';
      if (conv.lastMessage?.content) {
        try {
          preview = decrypt(conv.lastMessage.content);
        } catch {
          preview = conv.lastMessage.content;
        }
      }

      return {
        conversationId: conv._id,
        user: user
          ? {
              id: user._id,
              username: user.username,
              displayName: user.displayName || user.username,
              avatarUrl: user.profilePhoto || '/placeholder.svg',
              role: user.role,
            }
          : null,
        status: convItem.supportMetadata?.status || 'open',
        tags: convItem.supportMetadata?.tags || [],
        issueContext: convItem.supportMetadata?.issueContext || null,
        reportId: convItem.supportMetadata?.reportId || null,
        serviceRequestId: convItem.supportMetadata?.serviceRequestId || null,
        lastMessage: {
          content: preview,
          sentAt: conv.lastMessage?.sentAt,
        },
        updatedAt: conv.updatedAt,
      };
    });

    return res.json({ success: true, conversations: formatted });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const adminReplySupportMessage = async (req: Request, res: Response) => {
  try {
    if (!(req as any).user?._id) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const { conversationId } = req.params;
    const { content = '', type = 'text', mediaUrl = '' } = req.body;

    const conversation = await AdultConversation.findById(conversationId);
    const convAny = conversation as any;
    if (!conversation || convAny.type !== 'support') {
      return res.status(404).json({ success: false, error: 'Support conversation not found' });
    }

    const recipientId = conversation.participants[0];
    const rawAdminId = (req as any).user?._id;
    const adminSenderId = (rawAdminId && mongoose.Types.ObjectId.isValid(rawAdminId))
      ? new mongoose.Types.ObjectId(rawAdminId)
      : new mongoose.Types.ObjectId('000000000000000000000000');

    const replyMsg = new AdultMessage({
      conversationId,
      senderId: adminSenderId,
      receiverId: recipientId,
      content: encrypt(content || `[${type}]`),
      messageType: type,
      mediaUrl,
    });
    await replyMsg.save();

    conversation.lastMessage = {
      content: encrypt(content || `[${type}]`),
      mediaType: type,
      senderId: replyMsg.senderId,
      sentAt: new Date(),
    };

    const recipientStr = recipientId.toString();
    const currentUnread = conversation.unreadCounts.get(recipientStr) || 0;
    conversation.unreadCounts.set(recipientStr, currentUnread + 1);

    await conversation.save();

    const responsePayload = {
      id: replyMsg._id,
      conversationId,
      senderId: replyMsg.senderId,
      receiverId: recipientId,
      content,
      mediaType: type,
      mediaUrl,
      createdAt: replyMsg.createdAt,
      isAdminReply: true,
    };

    const ns = req.app.get('adultNamespace');
    if (ns) {
      ns.to(`conv:${conversationId}`).emit('sext:new_message', { message: responsePayload });
      ns.to(`user:${recipientStr}`).emit('sext:new_message_notification', {
        conversationId,
        messageId: replyMsg._id,
        preview: content.slice(0, 50),
      });
    }

    sendPushToUser(recipientId, {
      title: '🎧 Official Customer Support',
      body: content || 'New response from support',
      icon: '/icons/icon-192x192.png',
      tag: `conv_${conversationId}`,
      renotify: true,
      url: `/adult/sext?conversation=${conversationId}`,
      unreadCount: currentUnread + 1,
      type: 'support_reply',
    }).catch(() => {});

    return res.status(201).json({ success: true, message: responsePayload });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const adminManageSupportTags = async (req: Request, res: Response) => {
  try {
    if (!(req as any).user?._id) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const { conversationId } = req.params;
    const { tags = [], action = 'set' } = req.body;

    const conversation = await AdultConversation.findById(conversationId);
    const convAny = conversation as any;
    if (!conversation || convAny.type !== 'support') {
      return res.status(404).json({ success: false, error: 'Support conversation not found' });
    }

    let updatedTags = convAny.supportMetadata?.tags || [];

    if (action === 'set') {
      updatedTags = tags;
    } else if (action === 'add') {
      updatedTags = Array.from(new Set([...updatedTags, ...tags]));
    } else if (action === 'remove') {
      updatedTags = updatedTags.filter((t: string) => !tags.includes(t));
    }

    // Preserve 'Chat with Issue' tag automatically if reportId exists
    if (convAny.supportMetadata?.reportId && !updatedTags.includes('Chat with Issue')) {
      updatedTags.push('Chat with Issue');
    }

    convAny.supportMetadata!.tags = updatedTags;
    await conversation.save();

    return res.json({ success: true, tags: updatedTags });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
