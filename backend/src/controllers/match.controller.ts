import { Request, Response } from 'express';
import User from '../models/User';
import { IUser } from '../types/models';

// @desc    Get user's matches
// @access  Private
export const getMatches = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const user = await User.findById(req.user._id)
      .populate(
        'matches.user',
        'firstName lastName age photos isOnline lastActive'
      )
      .select('matches') as IUser | null;

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const matches = user.matches.filter((match) => match.isActive);

    // Mark matches as seen
    let hasUnseen = false;
    user.matches.forEach((match) => {
      if (match.isActive && !match.isSeen) {
        match.isSeen = true;
        hasUnseen = true;
      }
    });

    if (hasUnseen) {
      await user.save();
    }

    return res.json({ success: true, data: { matches } });
  } catch (error) {
    console.error('Get matches error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Unmatch with a user
// @access  Private
export const unmatch = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const matchUserId = req.params.id;

    // Remove match from current user
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { matches: { user: matchUserId } },
    });

    // Remove match from other user
    await User.findByIdAndUpdate(matchUserId, {
      $pull: { matches: { user: req.user._id } },
    });

    return res.json({ success: true, message: 'Unmatched successfully' });
  } catch (error) {
    console.error('Unmatch error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
