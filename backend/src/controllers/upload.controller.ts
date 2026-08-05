import { Request, Response } from 'express';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import User from '../models/User';
import { IUser } from '../types/models';
import { Types } from 'mongoose';

// Configure Cloudinary
cloudinary.config({
  cloudinary_url: process.env.CLOUDINARY_URL,
});

// @desc    Upload user photo to Cloudinary
// @access  Private
export const uploadPhoto = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });

    // Upload to Cloudinary
    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'vibe-photos',
          public_id: `${(req.user!._id as Types.ObjectId).toString()}_${Date.now()}`,
          transformation: [
            { width: 500, height: 500, crop: 'limit' },
            { quality: 'auto' },
          ],
        },
        (error, result) => {
          if (error || !result) reject(error);
          else resolve(result);
        }
      );
      stream.end(req.file!.buffer);
    });

    // Add photo to user's photos array
    const user = await User.findById(req.user._id) as IUser | null;
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const photoData = {
      url: result.secure_url,
      publicId: result.public_id,
      isMain: user.photos.length === 0, // First photo is main by default
      order: user.photos.length,
      uploadedAt: new Date()
    };

    user.photos.push(photoData);
    await user.save();

    return res.json({
      success: true,
      message: 'Photo uploaded successfully',
      data: {
        photo: photoData,
      },
    });
  } catch (error) {
    console.error('Photo upload error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during upload',
    });
  }
};

// @desc    Upload image for chat
// @access  Private
export const uploadChatImage = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });

    // Upload to Cloudinary
    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'vibe-chat-images',
          public_id: `chat_${(req.user!._id as Types.ObjectId).toString()}_${Date.now()}`,
          transformation: [
            { width: 1000, height: 1000, crop: 'limit' },
            { quality: 'auto' },
          ],
        },
        (error, result) => {
          if (error || !result) reject(error);
          else resolve(result);
        }
      );
      stream.end(req.file!.buffer);
    });

    return res.json({
      success: true,
      message: 'Image uploaded successfully',
      data: {
        url: result.secure_url,
        publicId: result.public_id,
      },
    });
  } catch (error) {
    console.error('Chat image upload error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during upload',
    });
  }
};

// @desc    Delete user photo from Cloudinary
// @access  Private
export const deletePhoto = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const publicId = req.params.publicId
      ? decodeURIComponent(req.params.publicId as string)
      : '';

    // Find and remove photo from user's photos array
    const user = await User.findById(req.user._id) as IUser | null;
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const photoIndex = user.photos.findIndex((photo: any) => photo.publicId === publicId);

    if (photoIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Photo not found',
      });
    }

    // Delete from Cloudinary only if publicId exists
    if (publicId) {
      try {
        await cloudinary.uploader.destroy(publicId);
      } catch (cloudinaryError) {
        console.error('Cloudinary deletion error (non-critical):', cloudinaryError);
        // Continue with database deletion even if Cloudinary fails
      }
    }

    // Remove from user's photos array
    user.photos.splice(photoIndex, 1);
    await user.save();

    return res.json({
      success: true,
      message: 'Photo deleted successfully',
    });
  } catch (error) {
    console.error('Photo delete error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during deletion',
    });
  }
};

// @desc    Set a photo as main profile picture
// @access  Private
export const setMainPhoto = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const photoIndex = parseInt(req.params.index as string);

    const user = await User.findById(req.user._id) as IUser | null;
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (photoIndex < 0 || photoIndex >= user.photos.length) {
      return res.status(400).json({
        success: false,
        message: 'Invalid photo index',
      });
    }

    // Set all photos as not main
    user.photos.forEach((photo) => {
      photo.isMain = false;
    });

    // Set selected photo as main
    user.photos[photoIndex].isMain = true;
    await user.save();

    return res.json({
      success: true,
      message: 'Main photo updated successfully',
    });
  } catch (error) {
    console.error('Set main photo error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};
