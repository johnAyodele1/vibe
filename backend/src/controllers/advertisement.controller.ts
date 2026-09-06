import { Request, Response } from 'express';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { AdvertisementService } from '../services/advertisement.service';

cloudinary.config({
  cloudinary_url: process.env.CLOUDINARY_URL,
});

/**
  * Helper to extract authenticated user & role from request
  */
const getAuthUserAndRole = (req: Request): { userId: string; role: 'user' | 'provider' | 'admin' } | null => {
  if (req.user) {
    const role = (req.user as any).role || 'user';
    return {
      userId: ((req.user as any)._id?.toString() || (req.user as any).id) as string,
      role: (req.user as any).isAdmin ? 'admin' : role,
    };
  }

  if (req.adultUser) {
    return {
      userId: req.adultUser._id.toString(),
      role: req.adultUser.isAdmin ? 'admin' : req.adultUser.role || 'user',
    };
  }

  return null;
};

// @desc    Get an eligible advertisement for current user
// @route   GET /api/v1/ads/eligible
// @access  Private
export const getEligibleAd = async (req: Request, res: Response): Promise<Response> => {
  try {
    const auth = getAuthUserAndRole(req);
    if (!auth) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const advertisement = await AdvertisementService.getEligibleAdvertisement(
      auth.userId,
      auth.role
    );

    return res.json({
      success: true,
      data: {
        advertisement,
      },
    });
  } catch (error: any) {
    console.error('Error fetching eligible ad:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch eligible advertisement',
    });
  }
};

// @desc    Record impression for displayed ad
// @route   POST /api/v1/ads/:id/impression
// @access  Private
export const recordImpression = async (req: Request, res: Response): Promise<Response> => {
  try {
    const auth = getAuthUserAndRole(req);
    if (!auth) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const adId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const impression = await AdvertisementService.recordImpression(
      auth.userId,
      adId,
      auth.role
    );

    return res.json({
      success: true,
      data: {
        impression,
      },
    });
  } catch (error: any) {
    console.error('Error recording ad impression:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to record ad impression',
    });
  }
};

// @desc    Record CTA click on ad
// @route   POST /api/v1/ads/:id/click
// @access  Private
export const recordClick = async (req: Request, res: Response): Promise<Response> => {
  try {
    const auth = getAuthUserAndRole(req);
    if (!auth) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const adId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const result = await AdvertisementService.recordClick(auth.userId, adId);

    return res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Error recording ad click:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to record ad click',
    });
  }
};

// --- ADMIN CONTROLLERS ---

// @desc    Admin: List advertisements
// @route   GET /api/v1/admin/ads
// @access  Admin
export const adminGetAds = async (req: Request, res: Response): Promise<Response> => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;

    const result = await AdvertisementService.adminGetAdvertisements(page, limit);

    return res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Admin list ads error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to list advertisements',
    });
  }
};

// @desc    Admin: Create advertisement
// @route   POST /api/v1/admin/ads
// @access  Admin
export const adminCreateAd = async (req: Request, res: Response): Promise<Response> => {
  try {
    const auth = getAuthUserAndRole(req);
    const advertisement = await AdvertisementService.adminCreateAdvertisement(
      req.body,
      auth?.userId
    );

    return res.status(201).json({
      success: true,
      message: 'Advertisement created successfully',
      data: {
        advertisement,
      },
    });
  } catch (error: any) {
    console.error('Admin create ad error:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to create advertisement',
    });
  }
};

// @desc    Admin: Update advertisement
// @route   PUT /api/v1/admin/ads/:id
// @access  Admin
export const adminUpdateAd = async (req: Request, res: Response): Promise<Response> => {
  try {
    const adId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const advertisement = await AdvertisementService.adminUpdateAdvertisement(
      adId,
      req.body
    );

    return res.json({
      success: true,
      message: 'Advertisement updated successfully',
      data: {
        advertisement,
      },
    });
  } catch (error: any) {
    console.error('Admin update ad error:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to update advertisement',
    });
  }
};

// @desc    Admin: Update ad status
// @route   PATCH /api/v1/admin/ads/:id/status
// @access  Admin
export const adminUpdateAdStatus = async (req: Request, res: Response): Promise<Response> => {
  try {
    const adId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { status } = req.body;

    if (!['draft', 'scheduled', 'active', 'paused', 'expired'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value',
      });
    }

    const advertisement = await AdvertisementService.adminUpdateAdvertisementStatus(
      adId,
      status
    );

    return res.json({
      success: true,
      message: `Advertisement status changed to ${status}`,
      data: {
        advertisement,
      },
    });
  } catch (error: any) {
    console.error('Admin update ad status error:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to update advertisement status',
    });
  }
};

// @desc    Admin: Delete advertisement (soft delete / archive)
// @route   DELETE /api/v1/admin/ads/:id
// @access  Admin
export const adminDeleteAd = async (req: Request, res: Response): Promise<Response> => {
  try {
    const adId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await AdvertisementService.adminDeleteAdvertisement(adId);

    return res.json({
      success: true,
      message: 'Advertisement deleted successfully',
    });
  } catch (error: any) {
    console.error('Admin delete ad error:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to delete advertisement',
    });
  }
};

// @desc    Admin: Upload ad media file (image/video)
// @route   POST /api/v1/admin/ads/upload-media
// @access  Admin
export const adminUploadMedia = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No media file provided',
      });
    }

    const file = req.file;
    const isImage = file.mimetype.startsWith('image/');
    const isVideo = file.mimetype.startsWith('video/');

    if (!isImage && !isVideo) {
      return res.status(400).json({
        success: false,
        message: 'Unsupported media type. Allowed formats: JPEG, PNG, WEBP, MP4, WEBM',
      });
    }

    const allowedMimeTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'video/mp4',
      'video/webm',
    ];

    if (!allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file MIME type. Only JPEG, PNG, WEBP, MP4, and WEBM are allowed.',
      });
    }

    // Upload to Cloudinary using upload_stream
    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const uploadOptions: any = {
        folder: 'vibe-ads-media',
        resource_type: isVideo ? 'video' : 'image',
        public_id: `ad_${Date.now()}`,
      };

      const stream = cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
        if (error || !result) reject(error || new Error('Upload to Cloudinary failed'));
        else resolve(result);
      });

      stream.end(file.buffer);
    });

    return res.json({
      success: true,
      message: 'Ad media uploaded successfully',
      data: {
        mediaUrl: result.secure_url,
        mediaType: isVideo ? 'video' : 'image',
        publicId: result.public_id,
      },
    });
  } catch (error: any) {
    console.error('Admin upload ad media error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to upload ad media',
    });
  }
};
