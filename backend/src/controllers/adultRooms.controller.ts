import { Request, Response } from 'express';
import Room from '../models/Room';
import AdultThread from '../models/AdultThread';
import AdultRoomMessage from '../models/AdultRoomMessage';
import RoomMembership from '../models/RoomMembership';
import AdultRoomPoll from '../models/AdultRoomPoll';
import Report from '../models/Report';
import AdultUser from '../models/AdultUser';
import { getIO } from '../socket';
import mongoose from 'mongoose';

// ==========================================
// 1. ROOMS CONTROLLER METHODS
// ==========================================

let seeded = false;

const seedDefaultRooms = async () => {
  if (seeded) return;
  try {
    // Ensure we have a system user/moderator to assign as creator
    let systemUser = await AdultUser.findOne({ role: 'provider' });
    if (!systemUser) {
      systemUser = await AdultUser.findOne({ role: 'user' });
    }
    if (!systemUser) {
      // Create a default system/mod provider user
      systemUser = new AdultUser({
        email: 'system.host@vibe.com',
        passwordHash: 'dummyhash',
        username: 'systemhost',
        displayName: 'System Host',
        dateOfBirth: new Date('1990-01-01'),
        role: 'provider',
        ageVerified: true,
        country: 'USA',
        credits: 1000,
      });
      await systemUser.save();
    }

    const defaultRooms = [
      {
        name: 'After Dark Lounge',
        description: 'Classy conversation and casual vibes',
        category: 'casual',
        mood: 'chill',
        memberCount: 245,
        icon: '🍸',
        coverGradient: ['#12080a', '#1a090d'],
        createdBy: systemUser._id,
      },
      {
        name: 'The Red Room',
        description: 'High intensity, explicit roleplay only',
        category: 'roleplay',
        mood: 'wild',
        memberCount: 890,
        icon: '💋',
        coverGradient: ['#2d090d', '#100304'],
        createdBy: systemUser._id,
      },
      {
        name: 'Fantasy Forest',
        description: 'Themed scenarios and storytelling',
        category: 'group fantasy',
        mood: 'explicit',
        memberCount: 120,
        icon: '🌲',
        coverGradient: ['#092315', '#030d07'],
        createdBy: systemUser._id,
      },
      {
        name: 'Midnight Desires',
        description: 'Open sharing and media exchange',
        category: 'spicy',
        mood: 'wild',
        memberCount: 560,
        icon: '😈',
        coverGradient: ['#1b092a', '#0a0310'],
        createdBy: systemUser._id,
      }
    ];

    for (const dr of defaultRooms) {
      const exists = await Room.findOne({ name: dr.name });
      if (!exists) {
        const room = new Room(dr);
        await room.save();
        console.log(`Seeded default room: ${dr.name}`);
      }
    }
    seeded = true;
  } catch (err) {
    console.error('Error seeding default rooms:', err);
  }
};

export const getRooms = async (req: Request, res: Response) => {
  try {
    await seedDefaultRooms();
    const { category, mood, page = 1, limit = 20 } = req.query;
    const filter: any = { isActive: true };

    if (category && category !== 'All' && category !== '🔥 All') {
      // Remove symbols/emojis from prefix if present
      const cleanCategory = (category as string).replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD00-\uDFFF]/g, '').trim().toLowerCase();
      filter.category = cleanCategory;
    }

    if (mood && mood !== 'All' && mood !== 'All Moods') {
      const cleanMood = (mood as string).toLowerCase().trim();
      filter.mood = cleanMood;
    }

    const p = parseInt(page as string) || 1;
    const l = parseInt(limit as string) || 20;
    const skip = (p - 1) * l;

    // Returns rooms sorted: pinned first, then by memberCount desc
    const rooms = await Room.find(filter)
      .sort({ isPinned: -1, memberCount: -1 })
      .skip(skip)
      .limit(l);

    const total = await Room.countDocuments(filter);

    res.json({
      success: true,
      data: {
        rooms,
        pagination: {
          total,
          page: p,
          limit: l,
          pages: Math.ceil(total / l),
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
};

export const createRoom = async (req: Request, res: Response) => {
  try {
    const { name, description, category, mood, tags, coverGradient, icon, rules, requiresSubscription } = req.body;
    const cleanCategory = (category || '').replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD00-\uDFFF]/g, '').trim().toLowerCase();

    const room = new Room({
      name,
      description,
      category: cleanCategory || 'casual',
      mood: mood || 'chill',
      tags: tags || [],
      coverGradient: coverGradient || ['#c8102e', '#0a0608'],
      icon: icon || '🔴',
      rules: rules || [],
      requiresSubscription: requiresSubscription || false,
      createdBy: req.adultUser?._id,
    });

    await room.save();
    res.status(201).json({ success: true, data: { room } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
};

export const getRoom = async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Room not found' } });
    }
    res.json({ success: true, data: { room } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
};

export const joinRoom = async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
    }

    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Room not found' } });
    }

    // Requires subscription check (VIP rooms need Gold+)
    if (room.requiresSubscription && user.subscriptionTier === 'none') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Subscription required' } });
    }

    // Check if user is kicked (i.e. we don't have banned users join. In a strict sense, kicked users might just have membership deleted and can't rejoin immediately if banned, but standard check is simple)
    let membership = await RoomMembership.findOne({ roomId, userId: user._id });
    if (!membership) {
      membership = new RoomMembership({
        roomId,
        userId: user._id,
        role: room.createdBy.toString() === user._id.toString() ? 'admin' : (room.moderators.includes(user._id) ? 'moderator' : (user.role === 'provider' ? 'moderator' : 'member')),
        joinedAt: new Date(),
        lastSeenAt: new Date(),
      });
      await membership.save();

      // Increment memberCount atomically
      room.memberCount = (room.memberCount || 0) + 1;
      await room.save();
    } else {
      membership.lastSeenAt = new Date();
      await membership.save();
    }

    // Emit socket events
    const io = getIO();
    if (io) {
      io.of('/adult').to(`room:${roomId}`).emit('room:user_joined', {
        userId: user._id,
        displayName: user.displayName || user.username,
        avatarUrl: user.profilePhoto || '/placeholder.svg',
      });
      io.of('/adult').to(`room:${roomId}`).emit('room:member_count', { count: room.memberCount });
    }

    res.json({ success: true, data: { room, membership } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
};

export const leaveRoom = async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
    }

    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Room not found' } });
    }

    const membership = await RoomMembership.findOne({ roomId, userId: user._id });
    if (membership) {
      await RoomMembership.deleteOne({ _id: membership._id });

      room.memberCount = Math.max(0, (room.memberCount || 0) - 1);
      await room.save();
    }

    // Emit socket events
    const io = getIO();
    if (io) {
      io.of('/adult').to(`room:${roomId}`).emit('room:user_left', { userId: user._id });
      io.of('/adult').to(`room:${roomId}`).emit('room:member_count', { count: room.memberCount });
    }

    res.json({ success: true, message: 'Left room' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
};

export const getRoomMembers = async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const p = parseInt(page as string) || 1;
    const l = parseInt(limit as string) || 50;
    const skip = (p - 1) * l;

    const memberships = await RoomMembership.find({ roomId })
      .populate('userId', 'username displayName profilePhoto subscriptionTier role')
      .skip(skip)
      .limit(l);

    const members = memberships.map((m) => {
      const u = m.userId as any;
      let badge: string | null = null;
      if (m.role === 'admin' || m.role === 'moderator') {
        badge = 'Mod';
      } else if (u?.subscriptionTier === 'gold') {
        badge = 'Gold';
      } else if (u?.subscriptionTier === 'platinum') {
        badge = 'Platinum';
      } else if (u?.subscriptionTier === 'diamond') {
        badge = 'Diamond';
      }

      return {
        userId: u?._id,
        displayName: u?.displayName || u?.username || 'Unknown',
        avatarUrl: u?.profilePhoto || '/placeholder.svg',
        badge,
        role: m.role,
        messageCount: m.messageCount || 0,
      };
    });

    res.json({ success: true, data: { members } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
};

export const getRoomLeaderboard = async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;

    const memberships = await RoomMembership.find({ roomId })
      .populate('userId', 'username displayName profilePhoto subscriptionTier role');

    const leaderboard = memberships
      .map((m) => {
        const u = m.userId as any;
        const msgCount = m.messageCount || 0;
        const tips = m.tipsReceived || 0;
        const score = tips * 3 + msgCount * 1;

        let badge: string | null = null;
        if (m.role === 'admin' || m.role === 'moderator') {
          badge = 'Mod';
        } else if (u?.subscriptionTier === 'gold') {
          badge = 'Gold';
        } else if (u?.subscriptionTier === 'platinum') {
          badge = 'Platinum';
        } else if (u?.subscriptionTier === 'diamond') {
          badge = 'Diamond';
        }

        return {
          userId: u?._id,
          displayName: u?.displayName || u?.username || 'Unknown',
          avatarUrl: u?.profilePhoto || '/placeholder.svg',
          badge,
          role: m.role,
          messageCount: msgCount,
          tipsReceived: tips,
          score,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    res.json({ success: true, data: { leaderboard } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
};

// ==========================================
// 2. THREADS CONTROLLER METHODS
// ==========================================

export const getThreads = async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const { sort = 'hot', page = 1, limit = 20 } = req.query;
    const p = parseInt(page as string) || 1;
    const l = parseInt(limit as string) || 20;
    const skip = (p - 1) * l;

    let sortQuery: any = {};
    if (sort === 'new') {
      sortQuery = { createdAt: -1 };
    } else if (sort === 'top') {
      sortQuery = { 'reactionCounts.🔥': -1, 'reactionCounts.💋': -1, 'reactionCounts.❤️': -1, 'reactionCounts.😈': -1, 'reactionCounts.⭐': -1 };
    } else {
      // hot sorting: sort by replyCount desc, then by createdAt desc
      sortQuery = { replyCount: -1, createdAt: -1 };
    }

    // Pinned threads always first regardless of sort
    const threads = await AdultThread.find({ roomId })
      .sort({ isPinned: -1, ...sortQuery })
      .skip(skip)
      .limit(l);

    res.json({ success: true, data: { threads } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
};

export const createThread = async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const { title, body, mediaUrl } = req.body;
    const user = req.adultUser;
    if (!user) return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });

    if (!title || title.length > 80) {
      return res.status(400).json({ success: false, error: { message: 'Title is required and must be under 80 characters' } });
    }
    if (!body || body.length > 1000) {
      return res.status(400).json({ success: false, error: { message: 'Body is required and must be under 1000 characters' } });
    }

    const thread = new AdultThread({
      roomId,
      authorId: user._id,
      authorName: user.displayName || user.username,
      authorAvatarUrl: user.profilePhoto || '/placeholder.svg',
      title,
      body,
      mediaUrl: mediaUrl || undefined,
      replyCount: 0,
      viewCount: 0,
      reactionCounts: {
        '🔥': 0,
        '💋': 0,
        '❤️': 0,
        '😈': 0,
        '⭐': 0,
      },
    });

    await thread.save();

    // Emit real-time event to room via socket
    const io = getIO();
    if (io) {
      io.of('/adult').to(`room:${roomId}`).emit('room:thread_created', { thread });
    }

    res.status(201).json({ success: true, data: { thread } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
};

export const getThread = async (req: Request, res: Response) => {
  try {
    const { threadId } = req.params;
    const thread = await AdultThread.findById(threadId);
    if (!thread) {
      return res.status(404).json({ success: false, error: { message: 'Thread not found' } });
    }

    // Increment viewCount atomically
    thread.viewCount = (thread.viewCount || 0) + 1;
    await thread.save();

    res.json({ success: true, data: { thread } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
};

export const reactThread = async (req: Request, res: Response) => {
  try {
    const { roomId, threadId } = req.params;
    const { emoji } = req.body;
    const user = req.adultUser;
    if (!user) return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });

    const thread = await AdultThread.findById(threadId);
    if (!thread) return res.status(404).json({ success: false, error: { message: 'Thread not found' } });

    const validEmojis = ['🔥', '💋', '❤️', '😈', '⭐'];
    if (!validEmojis.includes(emoji)) {
      return res.status(400).json({ success: false, error: { message: 'Invalid emoji' } });
    }

    // Toggle logic
    const existingIndex = thread.reactions.findIndex(
      (r) => r.userId.toString() === user._id.toString() && r.emoji === emoji
    );

    let updatedCount = 0;
    if (!thread.reactionCounts) {
      thread.reactionCounts = { '🔥': 0, '💋': 0, '❤️': 0, '😈': 0, '⭐': 0 };
    }
    const counts = thread.reactionCounts as any;

    if (existingIndex > -1) {
      // Remove
      thread.reactions.splice(existingIndex, 1);
      const curr = counts[emoji] || 0;
      counts[emoji] = Math.max(0, curr - 1);
      updatedCount = Math.max(0, curr - 1);
    } else {
      // Add
      thread.reactions.push({ userId: user._id, emoji });
      const curr = counts[emoji] || 0;
      counts[emoji] = curr + 1;
      updatedCount = curr + 1;
    }

    // Mark as modified so mongoose knows it changed (since it is Mixed)
    thread.markModified('reactionCounts');
    await thread.save();

    // Emit real-time event to socket namespace
    const io = getIO();
    if (io) {
      io.of('/adult').to(`room:${roomId}`).emit('room:thread_updated', {
        threadId,
        replyCount: thread.replyCount,
        lastReplyAt: thread.lastReplyAt,
        lastReplyAuthor: thread.lastReplyAuthor,
        reactionCounts: thread.reactionCounts,
      });
    }

    res.json({ success: true, data: { thread } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
};

export const pinThread = async (req: Request, res: Response) => {
  try {
    const { roomId, threadId } = req.params;
    const user = req.adultUser;
    if (!user) return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });

    const membership = await RoomMembership.findOne({ roomId, userId: user._id });
    if (!membership || (membership.role !== 'moderator' && membership.role !== 'admin')) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Moderator or Admin action only' } });
    }

    const thread = await AdultThread.findById(threadId);
    if (!thread) return res.status(404).json({ success: false, error: { message: 'Thread not found' } });

    thread.isPinned = !thread.isPinned;
    await thread.save();

    const io = getIO();
    if (io) {
      io.of('/adult').to(`room:${roomId}`).emit('room:thread_pinned', { threadId, isPinned: thread.isPinned });
    }

    res.json({ success: true, data: { thread } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
};

export const lockThread = async (req: Request, res: Response) => {
  try {
    const { roomId, threadId } = req.params;
    const user = req.adultUser;
    if (!user) return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });

    const membership = await RoomMembership.findOne({ roomId, userId: user._id });
    if (!membership || (membership.role !== 'moderator' && membership.role !== 'admin')) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Moderator or Admin action only' } });
    }

    const thread = await AdultThread.findById(threadId);
    if (!thread) return res.status(404).json({ success: false, error: { message: 'Thread not found' } });

    thread.isLocked = !thread.isLocked;
    await thread.save();

    const io = getIO();
    if (io) {
      io.of('/adult').to(`thread:${threadId}`).emit('thread:locked', { threadId, isLocked: thread.isLocked });
    }

    res.json({ success: true, data: { thread } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
};

// ==========================================
// 3. MESSAGES CONTROLLER METHODS
// ==========================================

export const getMessages = async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const { limit = 30, before } = req.query;

    const l = parseInt(limit as string) || 30;
    const query: any = { roomId, threadId: null };

    if (before) {
      query.createdAt = { $lt: new Date(before as string) };
    }

    const messages = await AdultRoomMessage.find(query)
      .sort({ createdAt: -1 })
      .limit(l);

    res.json({ success: true, data: { messages: messages.reverse() } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
};

export const sendMessage = async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const { content, mediaUrl, mediaType, isExplicit } = req.body;
    const user = req.adultUser;
    if (!user) return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });

    // Check mute
    const membership = await RoomMembership.findOne({ roomId, userId: user._id });
    if (membership?.mutedUntil && membership.mutedUntil > new Date()) {
      return res.status(403).json({
        success: false,
        error: { code: 'MUTED', message: 'You are muted in this room' },
      });
    }

    const message = new AdultRoomMessage({
      roomId,
      threadId: null,
      senderId: user._id,
      senderName: user.displayName || user.username,
      senderAvatarUrl: user.profilePhoto || '/placeholder.svg',
      senderBadge: user.subscriptionTier !== 'none' ? user.subscriptionTier.charAt(0).toUpperCase() + user.subscriptionTier.slice(1) : null,
      content,
      mediaUrl: mediaUrl || null,
      mediaType: mediaType || null,
      isExplicit: isExplicit || false,
    });

    await message.save();

    // Increment user messageCount
    if (membership) {
      membership.messageCount = (membership.messageCount || 0) + 1;
      await membership.save();
    }

    // Emit live event to room
    const io = getIO();
    if (io) {
      io.of('/adult').to(`room:${roomId}`).emit('room:new_message', { message });
    }

    res.status(201).json({ success: true, data: { message } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
};

export const reactMessage = async (req: Request, res: Response) => {
  try {
    const { roomId, messageId } = req.params;
    const { emoji } = req.body;
    const user = req.adultUser;
    if (!user) return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });

    const message = await AdultRoomMessage.findById(messageId);
    if (!message) return res.status(404).json({ success: false, error: { message: 'Message not found' } });

    const existingIndex = message.reactions.findIndex((r) => r.emoji === emoji);

    if (existingIndex > -1) {
      const reaction = message.reactions[existingIndex];
      const userIdx = reaction.userIds.findIndex((id) => id.toString() === user._id.toString());

      if (userIdx > -1) {
        // Remove reaction
        reaction.userIds.splice(userIdx, 1);
        reaction.count = Math.max(0, reaction.count - 1);
        if (reaction.count === 0) {
          message.reactions.splice(existingIndex, 1);
        }
      } else {
        // Add reaction
        reaction.userIds.push(user._id);
        reaction.count += 1;
      }
    } else {
      // Create reaction
      message.reactions.push({
        emoji,
        userIds: [user._id],
        count: 1,
      });
    }

    await message.save();

    // Emit event
    const io = getIO();
    if (io) {
      io.of('/adult').to(`room:${roomId}`).emit('room:message_reacted', {
        messageId,
        reactions: message.reactions,
      });
    }

    res.json({ success: true, data: { message } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
};

export const deleteMessage = async (req: Request, res: Response) => {
  try {
    const { roomId, messageId } = req.params;
    const user = req.adultUser;
    if (!user) return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });

    const message = await AdultRoomMessage.findById(messageId);
    if (!message) return res.status(404).json({ success: false, error: { message: 'Message not found' } });

    // Check ownership or moderator status
    const isOwner = message.senderId.toString() === user._id.toString();
    const membership = await RoomMembership.findOne({ roomId, userId: user._id });
    const isMod = membership && (membership.role === 'moderator' || membership.role === 'admin');

    if (!isOwner && !isMod) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot delete other user message' } });
    }

    // Soft delete
    message.content = '[deleted]';
    message.isDeleted = true;
    message.deletedAt = new Date();
    await message.save();

    const io = getIO();
    if (io) {
      io.of('/adult').to(`room:${roomId}`).emit('room:message_deleted', { messageId });
    }

    res.json({ success: true, message: 'Message soft deleted' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
};

// ==========================================
// 4. THREAD REPLIES CONTROLLER METHODS
// ==========================================

export const getReplies = async (req: Request, res: Response) => {
  try {
    const { roomId, threadId } = req.params;
    const { limit = 20, before } = req.query;

    const l = parseInt(limit as string) || 20;
    const query: any = { roomId, threadId };

    if (before) {
      query.createdAt = { $lt: new Date(before as string) };
    }

    const replies = await AdultRoomMessage.find(query)
      .sort({ createdAt: 1 }) // Sorted oldest first for narrative flow
      .limit(l);

    res.json({ success: true, data: { replies } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
};

export const postReply = async (req: Request, res: Response) => {
  try {
    const { roomId, threadId } = req.params;
    const { content, mediaUrl, replyToMessageId } = req.body;
    const user = req.adultUser;
    if (!user) return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });

    // Check lock state
    const thread = await AdultThread.findById(threadId);
    if (!thread) return res.status(404).json({ success: false, error: { message: 'Thread not found' } });
    if (thread.isLocked) {
      return res.status(403).json({ success: false, error: { code: 'LOCKED', message: 'Thread is locked' } });
    }

    // Check mute
    const membership = await RoomMembership.findOne({ roomId, userId: user._id });
    if (membership?.mutedUntil && membership.mutedUntil > new Date()) {
      return res.status(403).json({
        success: false,
        error: { code: 'MUTED', message: 'You are muted in this room' },
      });
    }

    const reply = new AdultRoomMessage({
      roomId,
      threadId,
      senderId: user._id,
      senderName: user.displayName || user.username,
      senderAvatarUrl: user.profilePhoto || '/placeholder.svg',
      senderBadge: user.subscriptionTier !== 'none' ? user.subscriptionTier.charAt(0).toUpperCase() + user.subscriptionTier.slice(1) : null,
      content,
      mediaUrl: mediaUrl || null,
      replyToMessageId: replyToMessageId || null,
    });

    await reply.save();

    // Increment user messageCount
    if (membership) {
      membership.messageCount = (membership.messageCount || 0) + 1;
      await membership.save();
    }

    // Update Thread details
    thread.replyCount = (thread.replyCount || 0) + 1;
    thread.lastReplyAt = new Date();
    thread.lastReplyAuthor = user.displayName || user.username;
    await thread.save();

    // Emit live events to thread space and main room
    const io = getIO();
    if (io) {
      io.of('/adult').to(`thread:${threadId}`).emit('thread:new_reply', { reply });
      io.of('/adult').to(`room:${roomId}`).emit('room:thread_updated', {
        threadId,
        replyCount: thread.replyCount,
        lastReplyAt: thread.lastReplyAt,
        lastReplyAuthor: thread.lastReplyAuthor,
        reactionCounts: thread.reactionCounts || {},
      });
    }

    res.status(201).json({ success: true, data: { reply } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
};

export const reactReply = async (req: Request, res: Response) => {
  try {
    const { threadId, replyId } = req.params;
    const { emoji } = req.body;
    const user = req.adultUser;
    if (!user) return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });

    const reply = await AdultRoomMessage.findById(replyId);
    if (!reply) return res.status(404).json({ success: false, error: { message: 'Reply not found' } });

    const existingIndex = reply.reactions.findIndex((r) => r.emoji === emoji);

    if (existingIndex > -1) {
      const reaction = reply.reactions[existingIndex];
      const userIdx = reaction.userIds.findIndex((id) => id.toString() === user._id.toString());

      if (userIdx > -1) {
        reaction.userIds.splice(userIdx, 1);
        reaction.count = Math.max(0, reaction.count - 1);
        if (reaction.count === 0) {
          reply.reactions.splice(existingIndex, 1);
        }
      } else {
        reaction.userIds.push(user._id);
        reaction.count += 1;
      }
    } else {
      reply.reactions.push({
        emoji,
        userIds: [user._id],
        count: 1,
      });
    }

    await reply.save();

    // Emit event
    const io = getIO();
    if (io) {
      io.of('/adult').to(`thread:${threadId}`).emit('thread:reply_reacted', {
        replyId,
        reactions: reply.reactions,
      });
    }

    res.json({ success: true, data: { reply } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
};

// ==========================================
// 5. POLLS CONTROLLER METHODS
// ==========================================

export const getActivePolls = async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const polls = await AdultRoomPoll.find({ roomId, expiresAt: { $gt: new Date() } });
    res.json({ success: true, data: { polls } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
};

export const createPoll = async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const { question, options, expiresInMinutes = 60 } = req.body;
    const user = req.adultUser;
    if (!user) return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });

    const membership = await RoomMembership.findOne({ roomId, userId: user._id });
    if (!membership || (membership.role !== 'moderator' && membership.role !== 'admin')) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Moderator only' } });
    }

    if (!question || !options || options.length < 2) {
      return res.status(400).json({ success: false, error: { message: 'Question and at least 2 options are required' } });
    }

    const formattedOptions = options.map((opt: string, idx: number) => ({
      id: `opt_${idx}_${Date.now()}`,
      text: opt,
      voteCount: 0,
    }));

    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    const poll = new AdultRoomPoll({
      roomId,
      createdBy: user._id,
      question,
      options: formattedOptions,
      voterIds: [],
      expiresAt,
      isActive: true,
    });

    await poll.save();

    const io = getIO();
    if (io) {
      io.of('/adult').to(`room:${roomId}`).emit('room:poll_created', { poll });
    }

    res.status(201).json({ success: true, data: { poll } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
};

export const votePoll = async (req: Request, res: Response) => {
  try {
    const { roomId, pollId } = req.params;
    const { optionId } = req.body;
    const user = req.adultUser;
    if (!user) return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });

    const poll = await AdultRoomPoll.findById(pollId);
    if (!poll) return res.status(404).json({ success: false, error: { message: 'Poll not found' } });

    // Check expiry
    if (poll.expiresAt < new Date()) {
      poll.isActive = false;
      await poll.save();
      return res.status(400).json({ success: false, error: { message: 'Poll has expired' } });
    }

    // Check double vote
    if (poll.voterIds.includes(user._id)) {
      return res.status(409).json({ success: false, error: { message: 'Already voted' } });
    }

    const option = poll.options.find((o) => o.id === optionId);
    if (!option) {
      return res.status(400).json({ success: false, error: { message: 'Option not found' } });
    }

    option.voteCount += 1;
    poll.voterIds.push(user._id);
    await poll.save();

    const io = getIO();
    if (io) {
      io.of('/adult').to(`room:${roomId}`).emit('room:poll_updated', {
        pollId,
        options: poll.options,
      });
    }

    res.json({ success: true, data: { poll } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
};

// ==========================================
// 6. MODERATION CONTROLLER METHODS
// ==========================================

export const reportRoom = async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const { targetId, type, reason } = req.body;
    const user = req.adultUser;
    if (!user) return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });

    let reportedId = user._id; // fallback

    if (type === 'user' && targetId) {
      reportedId = new mongoose.Types.ObjectId(targetId);
    } else if (type === 'message' && targetId) {
      const msg = await AdultRoomMessage.findById(targetId);
      if (msg) {
        reportedId = msg.senderId;
      }
    } else {
      const room = await Room.findById(roomId);
      if (room) {
        reportedId = room.createdBy;
      }
    }

    const report = new Report({
      reporter: user._id,
      reported: reportedId,
      reason: reason || 'In-room violation',
      status: 'pending',
    });

    await report.save();
    res.status(201).json({ success: true, data: { report } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
};

export const muteUser = async (req: Request, res: Response) => {
  try {
    const { roomId, userId } = req.params;
    const { durationMinutes = 15 } = req.body;
    const user = req.adultUser;
    if (!user) return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });

    const membership = await RoomMembership.findOne({ roomId, userId: user._id });
    if (!membership || (membership.role !== 'moderator' && membership.role !== 'admin')) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Moderator only' } });
    }

    const userMembership = await RoomMembership.findOne({ roomId, userId });
    if (!userMembership) {
      return res.status(404).json({ success: false, error: { message: 'User membership not found' } });
    }

    const mutedUntil = new Date(Date.now() + durationMinutes * 60 * 1000);
    userMembership.mutedUntil = mutedUntil;
    await userMembership.save();

    res.json({ success: true, data: { mutedUntil } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
};

export const kickUser = async (req: Request, res: Response) => {
  try {
    const { roomId, userId } = req.params;
    const user = req.adultUser;
    if (!user) return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });

    const membership = await RoomMembership.findOne({ roomId, userId: user._id });
    if (!membership || (membership.role !== 'moderator' && membership.role !== 'admin')) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Moderator only' } });
    }

    const userMembership = await RoomMembership.findOne({ roomId, userId });
    if (userMembership) {
      await RoomMembership.deleteOne({ _id: userMembership._id });

      const room = await Room.findById(roomId);
      if (room) {
        room.memberCount = Math.max(0, (room.memberCount || 0) - 1);
        await room.save();
      }

      const io = getIO();
      if (io) {
        io.of('/adult').to(`room:${roomId}`).emit('room:user_left', { userId });
        io.of('/adult').to(`room:${roomId}`).emit('room:member_count', { count: room ? room.memberCount : 0 });
      }
    }

    res.json({ success: true, message: 'User kicked successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
};
