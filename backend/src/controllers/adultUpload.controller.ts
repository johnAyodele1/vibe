import { Request, Response } from 'express';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import AdultUser from '../models/AdultUser';
import { Types } from 'mongoose';

// Configure Cloudinary
cloudinary.config({
  cloudinary_url: process.env.CLOUDINARY_URL,
});

// @desc    Upload adult user photo to Cloudinary
// @access  Private
export const uploadAdultPhoto = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    const user = req.adultUser;
    if (!user) return res.status(401).json({ success: false, message: 'Not authenticated' });

    // Upload to Cloudinary
    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'vibe-adult-photos',
          public_id: `adult_${user._id.toString()}_${Date.now()}`,
          transformation: [
            { width: 800, height: 800, crop: 'limit' },
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

    const setAsProfile = req.body.setProfilePhoto === 'true' || req.query.setProfilePhoto === 'true';
    if (setAsProfile) {
      user.profilePhoto = result.secure_url;
      await user.save();
    }

    return res.json({
      success: true,
      message: 'Photo uploaded successfully',
      data: {
        url: result.secure_url,
        publicId: result.public_id,
        profilePhotoUpdated: setAsProfile
      },
    });
  } catch (error) {
    console.error('Adult photo upload error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during photo upload',
    });
  }
};

// @desc    Upload adult video to Cloudinary
// @access  Private
export const uploadAdultVideo = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    const user = req.adultUser;
    if (!user) return res.status(401).json({ success: false, message: 'Not authenticated' });

    // Upload to Cloudinary with video resource type
    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'vibe-adult-videos',
          resource_type: 'video',
          public_id: `adult_video_${user._id.toString()}_${Date.now()}`,
          transformation: [
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
      message: 'Video uploaded successfully',
      data: {
        url: result.secure_url,
        publicId: result.public_id,
      },
    });
  } catch (error) {
    console.error('Adult video upload error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during video upload',
    });
  }
};
