import { Request, Response } from 'express';
import mongoose, { Types } from 'mongoose';
import User from '../models/User';
import Conversation from '../models/Conversation';
import { sendPushNotification } from '../services/notification.service';
import { sendPushToUser } from '../shared/push';
import { IUser } from '../types/models';

// @desc    Like a user
// @access  Private
export const like = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const targetUserId = req.params.id as string;

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID',
      });
    }

    const currentUserId = (req.user._id as Types.ObjectId).toString();

    if (targetUserId === currentUserId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot like yourself',
      });
    }

    const currentUser = await User.findById(req.user._id) as IUser | null;
    const targetUser = await User.findById(targetUserId) as IUser | null;

    if (!currentUser || !targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Check if already liked
    if (currentUser.likedUsers.some((id) => id.toString() === targetUserId)) {
      return res.status(400).json({
        success: false,
        message: 'User already liked',
      });
    }

    // Add to liked users
    currentUser.likedUsers.push(new mongoose.Types.ObjectId(targetUserId));
    await currentUser.save();

    // Always create conversation for liked users (for private messaging)
    let conversation = await Conversation.findDirectConversation(
      currentUserId,
      targetUserId,
    );

    if (!conversation) {
      try {
        const newConversation = new Conversation({
          participants: [
            req.user._id,
            new mongoose.Types.ObjectId(targetUserId),
          ],
        });
        await newConversation.save();
        conversation = await newConversation.updateParticipantInfo();
        console.log('Conversation saved:', conversation._id);
      } catch (error) {
        console.error('Error creating conversation:', error);
        return res
          .status(500)
          .json({ success: false, message: 'Failed to create conversation' });
      }
    }

    // Ensure participant info is populated
    if (
      !conversation.participantInfo ||
      conversation.participantInfo.length === 0
    ) {
      conversation = await conversation.updateParticipantInfo();
    }

    const conversationId = (conversation._id as Types.ObjectId).toString();

    // Add match for current user (every like that starts a chat counts as a match)
    const isAlreadyMatched = currentUser.matches.some(
      (m) => m.user.toString() === targetUserId,
    );
    if (!isAlreadyMatched) {
      currentUser.matches.push({
        user: new mongoose.Types.ObjectId(targetUserId),
        matchedAt: new Date(),
        isActive: true,
        isSeen: false
      });
    }

    // Check if it's a mutual match
    let isMatch = false;
    if (
      targetUser.likedUsers.some((id) => id.toString() === currentUserId)
    ) {
      const isTargetAlreadyMatched = targetUser.matches.some(
        (m) => m.user.toString() === currentUserId,
      );
      if (!isTargetAlreadyMatched) {
        targetUser.matches.push({
          user: req.user._id as Types.ObjectId,
          matchedAt: new Date(),
          isActive: true,
          isSeen: false
        });
      }
      isMatch = true;
    }

    await Promise.all([currentUser.save(), targetUser.save()]);

    if (isMatch) {
      // Notify both users about the match
      sendPushNotification(targetUserId, {
        title: "It's a Match! 💖",
        body: `You and ${currentUser.firstName} have matched! Start chatting now.`,
        data: {
          type: 'match',
          userId: currentUserId,
          conversationId,
        },
      }).catch(err => console.error('Push notification failed:', err));

      sendPushNotification(currentUserId, {
        title: "It's a Match! 💖",
        body: `You and ${targetUser.firstName} have matched! Start chatting now.`,
        data: {
          type: 'match',
          userId: targetUserId,
          conversationId,
        },
      }).catch(err => console.error('Push notification failed:', err));

      // Send VAPID push notifications for mutual match to both users
      Promise.all([
        sendPushToUser(targetUserId, {
          title:       `❤️ You have a new match!`,
          body:        `You and ${currentUser.firstName} matched. Start chatting!`,
          icon:        currentUser.photos?.[0]?.url || '',
          tag:         `match_${conversationId}`,
          renotify:    true,
          url:         `/chat/${conversationId}`,
          unreadCount: 0,
          type:        'new_match',
        }, 'dating'),
        sendPushToUser(currentUserId, {
          title:       `❤️ You have a new match!`,
          body:        `You and ${targetUser.firstName} matched. Start chatting!`,
          icon:        targetUser.photos?.[0]?.url || '',
          tag:         `match_${conversationId}`,
          renotify:    true,
          url:         `/chat/${conversationId}`,
          unreadCount: 0,
          type:        'new_match',
        }, 'dating')
      ]).catch(err => console.error('[Push] Match sendPushToUser failed:', err));
    }

    return res.json({
      success: true,
      message: isMatch ? "It's a match!" : 'User liked',
      data: { isMatch, conversationId },
    });
  } catch (error) {
    console.error('Like user error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Dislike a user
// @access  Private
export const dislike = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const targetUserId = req.params.id as string;

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID',
      });
    }

    const currentUserId = (req.user._id as Types.ObjectId).toString();

    if (targetUserId === currentUserId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot dislike yourself',
      });
    }

    const currentUser = await User.findById(req.user._id) as IUser | null;
    if (!currentUser) return res.status(404).json({ success: false, message: 'User not found' });

    // Check if already disliked
    if (currentUser.dislikedUsers.some((id) => id.toString() === targetUserId)) {
      return res.status(400).json({
        success: false,
        message: 'User already disliked',
      });
    }

    // Add to disliked users
    currentUser.dislikedUsers.push(new mongoose.Types.ObjectId(targetUserId));
    await currentUser.save();

    return res.json({ success: true, message: 'User disliked' });
  } catch (error) {
    console.error('Dislike user error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Super like (Favourite) a user
// @access  Private
export const superLike = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const targetUserId = req.params.id as string;

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID',
      });
    }

    const currentUserId = (req.user._id as Types.ObjectId).toString();

    if (targetUserId === currentUserId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot super like yourself',
      });
    }

    // Check if target user exists
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: `User not found with ID: ${targetUserId}`,
      });
    }

    const currentUser = await User.findById(req.user._id) as IUser | null;
    if (!currentUser) return res.status(404).json({ success: false, message: 'User not found' });

    // Check if already favourited
    if (
      currentUser.favouritedUsers.some((id) => id.toString() === targetUserId)
    ) {
      return res.status(400).json({
        success: false,
        message: 'User already in favourites',
      });
    }

    // Add to favourited users
    currentUser.favouritedUsers.push(new mongoose.Types.ObjectId(targetUserId));
    await currentUser.save();

    return res.json({ success: true, message: 'User added to favourites' });
  } catch (error) {
    console.error('Super like error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get favourited users
// @access  Private
export const getFavourites = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const user = await User.findById(req.user._id).populate({
      path: 'favouritedUsers',
      select: 'firstName lastName age photos bio location interests lastActive isOnline blockedUsers isBlocked',
    }) as IUser | null;
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Filter out users who are blocked, or who have blocked the current user
    const currentUserId = req.user._id.toString();
    const filteredFavourites = (user.favouritedUsers as unknown as IUser[]).filter((favUser: IUser) => {
      if (favUser.isBlocked) return false;
      if (user.blockedUsers.some(id => id.toString() === favUser._id.toString())) return false;
      if (favUser.blockedUsers.some(id => id.toString() === currentUserId)) return false;
      return true;
    });

    return res.json({
      success: true,
      data: { favourites: filteredFavourites },
    });
  } catch (error) {
    console.error('Get favourites error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
