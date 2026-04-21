import { Response } from 'express';
import User from '../models/User';
import Report from '../models/Report';
import { IExpressRequest } from '../types/express';
import mongoose, { Types } from 'mongoose';
import { IUser } from '../types/models';

// @desc    Get current user profile
// @access  Private
export const getProfile = async (req: IExpressRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const user = await User.findById(req.user._id).select('-password');
    return res.json({ success: true, data: { user } });
  } catch (error) {
    console.error('Get profile error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get user by ID
// @access  Private
export const getUserById = async (req: IExpressRequest, res: Response): Promise<Response> => {
  try {
    const id = req.params.id as string;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    const user = await User.findById(id).select('firstName lastName age photos bio location interests isVerified lastActive isOnline');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.json({ success: true, data: { user } });
  } catch (error) {
    console.error('Get user by ID error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Block a user
// @access  Private
export const blockUser = async (req: IExpressRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const id = req.params.id as string;
    const currentUserId = req.user._id as Types.ObjectId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    if (id === currentUserId.toString()) {
      return res.status(400).json({ success: false, message: 'Cannot block yourself' });
    }

    const user = await User.findById(currentUserId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const targetId = new mongoose.Types.ObjectId(id);
    if (!user.blockedUsers.includes(targetId)) {
      user.blockedUsers.push(targetId);
      await user.save();
    }

    return res.json({ success: true, message: 'User blocked successfully' });
  } catch (error) {
    console.error('Block user error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Report a user
// @access  Private
export const reportUser = async (req: IExpressRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const id = req.params.id as string;
    const { reason, description } = req.body;
    const currentUserId = req.user._id as Types.ObjectId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    if (!reason) {
      return res.status(400).json({ success: false, message: 'Reason is required' });
    }

    const report = new Report({
      reporter: currentUserId,
      reported: new mongoose.Types.ObjectId(id),
      reason,
      description,
    });

    await report.save();

    return res.json({ success: true, message: 'User reported successfully' });
  } catch (error) {
    console.error('Report user error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Update user profile
// @access  Private
export const updateProfile = async (req: IExpressRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const allowedFields = [
      'firstName',
      'lastName',
      'bio',
      'interests',
      'location',
      'preferences',
      'settings',
    ];

    const updates: Record<string, unknown> = {};
    const body = req.body as Record<string, unknown>;
    allowedFields.forEach((field) => {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    });

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
    }).select('-password');

    return res.json({
      success: true,
      message: 'Profile updated successfully',
      data: { user },
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get users for discovery/matching
// @access  Private
export const discover = async (req: IExpressRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    // Get users that match preferences and haven't been liked/disliked
    const currentUser = await User.findById(req.user._id) as IUser | null;
    if (!currentUser) return res.status(404).json({ success: false, message: 'User not found' });

    // Find users who have blocked current user
    const usersWhoBlockedMe = await User.find({ blockedUsers: req.user._id as Types.ObjectId }).select('_id');
    const blockedMeIds = usersWhoBlockedMe.map(u => u._id);

    const query: Record<string, unknown> = {
      isBlocked: { $ne: true },
      gender:
        currentUser.preferences.genderPreference === 'Everyone'
          ? { $exists: true }
          : currentUser.preferences.genderPreference,
      dateOfBirth: {
        $lte: new Date(
          Date.now() -
            currentUser.preferences.ageRange.min * 365.25 * 24 * 60 * 60 * 1000,
        ),
        $gte: new Date(
          Date.now() -
            (currentUser.preferences.ageRange.max + 1) *
              365.25 *
              24 *
              60 *
              60 *
              1000,
        ),
      },
      _id: {
        $ne: req.user._id as Types.ObjectId,
        $nin: [
          ...currentUser.likedUsers,
          ...currentUser.dislikedUsers,
          ...currentUser.favouritedUsers,
          ...currentUser.blockedUsers,
          ...blockedMeIds,
        ],
      },
    };

    // Add location-based filtering if coordinates exist
    if (currentUser.location.coordinates[0] !== 0) {
      query.location = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: currentUser.location.coordinates,
          },
          $maxDistance: currentUser.preferences.maxDistance * 1000, // Convert km to meters
        },
      };
    }

    const users = await User.find(query)
      .select('firstName lastName age photos bio location interests')
      .skip(skip)
      .limit(Number(limit))
      .sort({ lastActive: -1 });

    // Increment view count for each discovered user
    if (users.length > 0) {
      const userIds = users.map((user) => user._id as Types.ObjectId);
      await User.updateMany({ _id: { $in: userIds } }, { $inc: { views: 1 } });
    }

    return res.json({ success: true, data: { users } });
  } catch (error) {
    console.error('Discover users error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Delete user account
// @access  Private
export const deleteAccount = async (req: IExpressRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const userId = req.user._id as Types.ObjectId;

    // Delete user and all related data
    await User.findByIdAndDelete(userId);

    return res.json({
      success: true,
      message: 'Account deleted successfully',
    });
  } catch (error) {
    console.error('Delete account error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
