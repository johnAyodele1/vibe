import { Response } from 'express';
import User from '../models/User';
import Report from '../models/Report';
import { IExpressRequest } from '../types/express';
import mongoose, { Types } from 'mongoose';
import { IUser } from '../types/models';

export const getProfile = async (req: IExpressRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    // Optimization (⚡ Bolt): Use .lean() on read-only query to eliminate Mongoose document hydration overhead.
    const user = await User.findById(req.user._id).select('-password').lean();
    return res.json({ success: true, data: { user } });
  } catch (error) {
    console.error('Get profile error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const getUserById = async (req: IExpressRequest, res: Response): Promise<Response> => {
  try {
    const id = req.params.id as string;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ success: false, message: 'Invalid user ID' });
    // Optimization (⚡ Bolt): Use .lean() on read-only query to eliminate Mongoose document hydration overhead.
    const user = await User.findById(id).select('firstName lastName age photos bio location interests isVerified lastActive isOnline').lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    return res.json({ success: true, data: { user } });
  } catch (error) {
    console.error('Get user by ID error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const blockUser = async (req: IExpressRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const id = req.params.id as string;
    const currentUserId = req.user._id as Types.ObjectId;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ success: false, message: 'Invalid user ID' });
    if (id === currentUserId.toString()) return res.status(400).json({ success: false, message: 'Cannot block yourself' });
    const targetId = new mongoose.Types.ObjectId(id);

    // Optimization (⚡ Bolt): Use atomic $addToSet with findByIdAndUpdate to eliminate document hydration and write-lock overhead.
    const user = await User.findByIdAndUpdate(
      currentUserId,
      { $addToSet: { blockedUsers: targetId } },
      { new: true }
    ).select('_id').lean();

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    return res.json({ success: true, message: 'User blocked successfully' });
  } catch (error) {
    console.error('Block user error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const reportUser = async (req: IExpressRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const id = req.params.id as string;
    const { reason, description } = req.body;
    const currentUserId = req.user._id as Types.ObjectId;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ success: false, message: 'Invalid user ID' });
    if (!reason) return res.status(400).json({ success: false, message: 'Reason is required' });
    const report = new Report({ reporter: currentUserId, reported: new mongoose.Types.ObjectId(id), reason, description });
    await report.save();
    return res.json({ success: true, message: 'User reported successfully' });
  } catch (error) {
    console.error('Report user error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const updateLocation = async (req: IExpressRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const { latitude, longitude, city, country } = req.body;
    if (latitude === undefined || longitude === undefined) return res.status(400).json({ success: false, message: 'Coordinates are required' });
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    user.location = { type: 'Point', coordinates: [longitude, latitude], city: city || user.location.city, country: country || user.location.country };
    await user.save();
    return res.json({ success: true, message: 'Location updated successfully' });
  } catch (error) {
    console.error('Update location error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const updateProfile = async (req: IExpressRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const allowedFields = ['firstName', 'lastName', 'bio', 'interests', 'location', 'preferences', 'settings', 'gender', 'dateOfBirth'];
    const body = req.body as Record<string, unknown>;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    allowedFields.forEach(field => { if (body[field] !== undefined) (user as any)[field] = body[field]; });

    // Use document .save() so pre('save') middleware calculates profileCompletion and executes schema validators.
    await user.save();

    // Optimization (⚡ Bolt): Convert user to plain object and remove password in memory to eliminate 3rd database query roundtrip.
    const userObj = user.toObject();
    delete (userObj as any).password;

    return res.json({ success: true, message: 'Profile updated successfully', data: { user: userObj } });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const discover = async (req: IExpressRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    // Optimization (⚡ Bolt): Fetch currentUser and usersWhoBlockedMe concurrently via Promise.all.
    const [currentUser, usersWhoBlockedMe] = await Promise.all([
      User.findById(req.user._id).lean() as Promise<IUser | null>,
      User.find({ blockedUsers: req.user._id as Types.ObjectId }).select('_id').lean(),
    ]);

    if (!currentUser) return res.status(404).json({ success: false, message: 'User not found' });

    const blockedMeIds = usersWhoBlockedMe.map(u => u._id);
    const query: Record<string, unknown> = {
      isBlocked: { $ne: true },
      gender: currentUser.preferences.genderPreference === 'Everyone' ? { $exists: true } : currentUser.preferences.genderPreference,
      dateOfBirth: {
        $lte: new Date(Date.now() - currentUser.preferences.ageRange.min * 365.25 * 24 * 60 * 60 * 1000),
        $gte: new Date(Date.now() - (currentUser.preferences.ageRange.max + 1) * 365.25 * 24 * 60 * 60 * 1000),
      },
      _id: { $ne: req.user._id as Types.ObjectId, $nin: [...currentUser.likedUsers, ...currentUser.dislikedUsers, ...currentUser.favouritedUsers, ...currentUser.blockedUsers, ...blockedMeIds] },
    };
    if (currentUser.location.coordinates[0] !== 0) {
      query.location = { $near: { $geometry: { type: 'Point', coordinates: currentUser.location.coordinates }, $maxDistance: currentUser.preferences.maxDistance * 1000 } };
    }
    const users = await User.find(query).select('firstName lastName age photos bio location interests').skip(skip).limit(Number(limit)).sort({ lastActive: -1 }).lean();
    if (users.length > 0) {
      const userIds = users.map(user => user._id as Types.ObjectId);
      await User.updateMany({ _id: { $in: userIds } }, { $inc: { views: 1 } });
    }
    return res.json({ success: true, data: { users } });
  } catch (error) {
    console.error('Discover users error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const deleteAccount = async (req: IExpressRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    await User.findByIdAndDelete(req.user._id as Types.ObjectId);
    return res.json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Delete account error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
