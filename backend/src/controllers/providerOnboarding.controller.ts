import { Request, Response } from 'express';
import AdultUser from '../models/AdultUser';

export const getPresignedUrl = async (req: Request, res: Response) => {
  try {
    const { type, filename } = req.query;
    if (!type || !filename) {
      return res.status(400).json({ success: false, error: 'type and filename are required' });
    }
    const mockFileId = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const extension = String(filename).split('.').pop() || 'jpg';

    // We provide a mock upload URL pointing to our local server's direct upload endpoint!
    // This allows the frontend to upload directly via PUT exactly as they would with S3.
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const uploadUrl = `${baseUrl}/api/v1/adult/media/upload-mock?fileId=${mockFileId}&ext=${extension}`;
    const publicUrl = `https://vibe-media-s3.s3.amazonaws.com/adult-zone/${mockFileId}.${extension}`;

    return res.json({ uploadUrl, publicUrl });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const handleMockUpload = async (req: Request, res: Response) => {
  // Mock successful direct S3 upload
  return res.status(200).send('Successfully uploaded to mock S3');
};

export const getMyProfile = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Auth required' } });
    }
    return res.json({ success: true, data: { user } });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const updateProfile = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user || user.role !== 'provider') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only providers can update profile' } });
    }

    const { stageName, bio, gender, dateOfBirth, profilePhoto } = req.body;

    if (stageName && stageName !== user.providerProfile?.stageName) {
      const existing = await AdultUser.findOne({ 'providerProfile.stageName': stageName, _id: { $ne: user._id } });
      if (existing) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Stage name already in use' } });
      }
    }

    if (!user.providerProfile) {
      user.providerProfile = {
        stageName: stageName || '',
        categories: [],
        contentTags: [],
        pricePerMinute: 0,
        tipMinimum: 0,
        videoCallPrice: 0,
        audioCallPrice: 0,
        privateSextPrice: 0,
        totalEarnings: 0,
        pendingPayout: 0,
        verificationStatus: 'approved',
        isLive: false,
        rating: { average: 0, count: 0 },
      };
    }

    if (stageName !== undefined) user.providerProfile.stageName = stageName;
    if (bio !== undefined) user.bio = bio;
    if (profilePhoto !== undefined) user.profilePhoto = profilePhoto;
    if (dateOfBirth !== undefined) {
      // Validate age is 18+
      const dob = new Date(dateOfBirth);
      const ageDiff = Date.now() - dob.getTime();
      const ageDate = new Date(ageDiff);
      const age = Math.abs(ageDate.getUTCFullYear() - 1970);
      if (age < 18) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Must be 18 or older' } });
      }
      user.dateOfBirth = dob;
    }

    // Since gender isn't directly on AdultUser, let's keep it in providerProfile or bio metadata
    // We can also store gender on the model as mixed metadata if needed
    await user.save();

    return res.json({ success: true, message: 'Profile updated successfully', data: { user } });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const updateServices = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user || user.role !== 'provider') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only providers can update services' } });
    }

    const { servicesOffered } = req.body;
    if (!servicesOffered || !Array.isArray(servicesOffered) || servicesOffered.length === 0) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'At least one service must be selected' } });
    }

    if (!user.providerProfile) {
      user.providerProfile = {
        stageName: '',
        categories: servicesOffered,
        contentTags: [],
        pricePerMinute: 0,
        tipMinimum: 0,
        videoCallPrice: 0,
        audioCallPrice: 0,
        privateSextPrice: 0,
        totalEarnings: 0,
        pendingPayout: 0,
        verificationStatus: 'approved',
        isLive: false,
        rating: { average: 0, count: 0 },
      };
    } else {
      user.providerProfile.servicesOffered = servicesOffered;
      // Also map to categories to prevent any mismatch
      user.providerProfile.categories = servicesOffered;
    }

    await user.save();
    return res.json({ success: true, message: 'Services updated successfully', data: { user } });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const updatePricing = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user || user.role !== 'provider') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only providers can update pricing' } });
    }

    const { perMinuteRate, tonightRate, tipMenu, videoCallPrice, audioCallPrice, privateSextPrice } = req.body;

    if (perMinuteRate !== undefined && perMinuteRate < 1.99) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Minimum per-minute rate is $1.99' } });
    }

    if (!user.providerProfile) {
      user.providerProfile = {
        stageName: '',
        categories: [],
        contentTags: [],
        pricePerMinute: perMinuteRate || 0,
        tipMinimum: 0,
        videoCallPrice: videoCallPrice || perMinuteRate || 0,
        audioCallPrice: audioCallPrice || 0,
        privateSextPrice: privateSextPrice || 0,
        totalEarnings: 0,
        pendingPayout: 0,
        verificationStatus: 'approved',
        isLive: false,
        rating: { average: 0, count: 0 },
      };
    } else {
      if (perMinuteRate !== undefined) {
        user.providerProfile.pricePerMinute = perMinuteRate;
        user.providerProfile.videoCallPrice = perMinuteRate;
      }
      if (videoCallPrice !== undefined) user.providerProfile.videoCallPrice = videoCallPrice;
      if (audioCallPrice !== undefined) user.providerProfile.audioCallPrice = audioCallPrice;
      if (privateSextPrice !== undefined) user.providerProfile.privateSextPrice = privateSextPrice;
      if (tonightRate !== undefined) user.providerProfile.tonightRate = tonightRate;
      if (tipMenu !== undefined) user.providerProfile.tipMenu = tipMenu;
    }

    await user.save();
    return res.json({ success: true, message: 'Pricing updated successfully', data: { user } });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const updateLocation = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user || user.role !== 'provider') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only providers can update location' } });
    }

    const { country, state, city } = req.body;

    if (!user.providerProfile) {
      user.providerProfile = {
        stageName: '',
        categories: [],
        contentTags: [],
        pricePerMinute: 0,
        tipMinimum: 0,
        videoCallPrice: 0,
        audioCallPrice: 0,
        privateSextPrice: 0,
        totalEarnings: 0,
        pendingPayout: 0,
        verificationStatus: 'approved',
        isLive: false,
        rating: { average: 0, count: 0 },
      };
    }

    user.providerProfile.location = { country, state, city };
    // Also sync to main user country field if necessary as a string
    if (country && country.name) {
      user.country = country.name;
    }

    await user.save();
    return res.json({ success: true, message: 'Location updated successfully', data: { user } });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const updatePayout = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user || user.role !== 'provider') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only providers can update payout info' } });
    }

    const { payoutInfo } = req.body;

    if (!user.providerProfile) {
      user.providerProfile = {
        stageName: '',
        categories: [],
        contentTags: [],
        pricePerMinute: 0,
        tipMinimum: 0,
        videoCallPrice: 0,
        audioCallPrice: 0,
        privateSextPrice: 0,
        totalEarnings: 0,
        pendingPayout: 0,
        verificationStatus: 'approved',
        isLive: false,
        rating: { average: 0, count: 0 },
      };
    }

    user.providerProfile.payoutInfo = payoutInfo;
    await user.save();

    return res.json({ success: true, message: 'Payout info updated successfully', data: { user } });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const updateStatus = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user || user.role !== 'provider') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only providers can update status' } });
    }

    const { isOnline } = req.body;

    if (!user.providerProfile) {
      user.providerProfile = {
        stageName: '',
        categories: [],
        contentTags: [],
        pricePerMinute: 0,
        tipMinimum: 0,
        videoCallPrice: 0,
        audioCallPrice: 0,
        privateSextPrice: 0,
        totalEarnings: 0,
        pendingPayout: 0,
        verificationStatus: 'approved',
        isLive: isOnline || false,
        rating: { average: 0, count: 0 },
      };
    } else {
      user.providerProfile.isLive = isOnline;
    }

    await user.save();
    return res.json({ success: true, message: 'Status updated successfully', data: { user } });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const updatePhotos = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user || user.role !== 'provider') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only providers can update photos' } });
    }

    const { photos, videoPreview } = req.body;

    if (!user.providerProfile) {
      user.providerProfile = {
        stageName: '',
        categories: [],
        contentTags: [],
        pricePerMinute: 0,
        tipMinimum: 0,
        videoCallPrice: 0,
        audioCallPrice: 0,
        privateSextPrice: 0,
        totalEarnings: 0,
        pendingPayout: 0,
        verificationStatus: 'approved',
        isLive: false,
        rating: { average: 0, count: 0 },
      };
    }

    if (photos !== undefined) {
      user.providerProfile.photos = photos;
      if (photos.length > 0) {
        user.profilePhoto = photos[0];
      }
    }
    if (videoPreview !== undefined) {
      user.providerProfile.videoPreview = videoPreview;
    }

    await user.save();
    return res.json({ success: true, message: 'Photos updated successfully', data: { user } });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
