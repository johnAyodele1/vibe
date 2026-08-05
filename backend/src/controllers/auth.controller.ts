import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import User from '../models/User';
import { generateAccessToken, generateRefreshToken } from '../middleware/auth';
import jwt from 'jsonwebtoken';
import { IUser } from '../types/models';
import { Types } from 'mongoose';
import { notifyUsersOfNewJoiner } from '../services/notification.service';

// @desc    Register user
// @access  Public
export const signup = async (req: Request, res: Response): Promise<Response> => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array(),
      });
    }

    const { email, password, firstName, lastName, dateOfBirth, gender } =
      req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email',
      });
    }

    // Create new user
    const user = new User({
      email,
      password, // Will be hashed by pre-save middleware
      firstName,
      lastName,
      dateOfBirth,
      gender,
    });

    await user.save();

    // Notify matching users about new joiner
    notifyUsersOfNewJoiner(user).catch(err => console.error('Error notifying users of new joiner:', err));

    // Generate tokens
    const userId = (user._id as Types.ObjectId).toString();
    const accessToken = generateAccessToken(userId);
    const refreshToken = generateRefreshToken(userId);

    return res.status(201).json({
      success: true,
      message: 'User created successfully',
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
    console.error('Signup error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during signup',
    });
  }
};

// @desc    Login user
// @access  Public
export const login = async (req: Request, res: Response): Promise<Response> => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array(),
      });
    }

    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    // Update last active
    user.lastActive = new Date();
    user.isOnline = true;
    await user.save();

    // Generate tokens
    const userId = (user._id as Types.ObjectId).toString();
    const accessToken = generateAccessToken(userId);
    const refreshToken = generateRefreshToken(userId);

    return res.json({
      success: true,
      message: 'Login successful',
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
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during login',
    });
  }
};

// @desc    Refresh access token
// @access  Public (with refresh token)
export const refresh = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token required',
      });
    }

    // Verify refresh token
    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET ||
        process.env.JWT_SECRET ||
        'fallback_secret'
    ) as { userId: string };

    // Check if user exists
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token',
      });
    }

    // Generate new access token
    const accessToken = generateAccessToken((user._id as Types.ObjectId).toString());

    return res.json({
      success: true,
      data: {
        accessToken,
      },
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    return res.status(401).json({
      success: false,
      message: 'Invalid refresh token',
    });
  }
};

// @desc    Logout user
// @access  Private
export const logout = async (req: Request, res: Response): Promise<Response> => {
  try {
    const user = req.user as IUser;
    if (user) {
      // Update user's online status
      user.isOnline = false;
      user.lastActive = new Date();
      await user.save();
    }

    return res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during logout',
    });
  }
};

// @desc    Get current user
// @access  Private
export const me = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const user = await User.findById(req.user._id)
      .select('-password')
      .populate('matches.user', 'firstName lastName age photos');

    return res.json({
      success: true,
      data: { user },
    });
  } catch (error) {
    console.error('Get current user error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};
