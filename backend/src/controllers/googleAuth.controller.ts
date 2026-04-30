import { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import User from '../models/User';
import { generateAccessToken, generateRefreshToken } from '../middleware/auth';
import { IUser } from '../types/models';
import { Types } from 'mongoose';

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);

// @desc    Get Google Client ID
// @access  Public
export const getGoogleClientId = async (req: Request, res: Response): Promise<Response> => {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.status(404).json({
        success: false,
        message: 'Google Client ID not configured',
      });
    }
    return res.json({
      success: true,
      data: { clientId },
    });
  } catch (error) {
    console.error('Error getting Google Client ID:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

export const googleLogin = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        success: false,
        message: 'Google ID Token is required',
      });
    }

    // Verify Google ID Token
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      return res.status(400).json({ success: false, message: 'Invalid Google token' });
    }
    const { sub: googleId, email, given_name, family_name, picture } = payload;

    // Check if user already exists by googleId
    let user = await User.findOne({ googleId }) as IUser | null;

    if (!user) {
      // Check if user exists by email (link account if not already linked)
      user = await User.findOne({ email }) as IUser | null;

      if (user) {
        user.googleId = googleId;
        await user.save();
      } else {
        // Create new user without auto-importing Google profile photos
        user = new User({
          email,
          googleId,
          firstName: given_name || 'User',
          lastName: family_name || '',
          photos: [],
        });
        await user.save();
      }
    }

    if (!user) {
      return res.status(500).json({ success: false, message: 'Failed to create user' });
    }

    // Generate tokens
    const userId = (user._id as Types.ObjectId).toString();
    const accessToken = generateAccessToken(userId);
    const refreshToken = generateRefreshToken(userId);

    // Update last active
    user.lastActive = new Date();
    user.isOnline = true;
    await user.save();

    return res.json({
      success: true,
      message: 'Google login successful',
      data: {
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          dateOfBirth: user.dateOfBirth,
          age: user.age,
          gender: user.gender,
          bio: user.bio,
          photos: user.photos,
          location: user.location,
          isVerified: user.isVerified,
          isPremium: user.isPremium,
          profileCompletion: user.profileCompletion,
        },
        tokens: {
          accessToken,
          refreshToken,
        },
      },
    });
  } catch (error) {
    console.error('Google login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during Google login',
    });
  }
};

export const googleCallback = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user as IUser;
    if (!user) {
      throw new Error('User not found in request');
    }

    // Generate tokens
    const userId = (user._id as Types.ObjectId).toString();
    const accessToken = generateAccessToken(userId);
    const refreshToken = generateRefreshToken(userId);

    // Update last active
    user.lastActive = new Date();
    user.isOnline = true;
    await user.save();

    // Redirect to frontend with tokens
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(
      `${frontendUrl}/auth/callback?accessToken=${accessToken}&refreshToken=${refreshToken}`
    );
  } catch (error) {
    console.error('Google callback error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/auth?error=google_auth_failed`);
  }
};
