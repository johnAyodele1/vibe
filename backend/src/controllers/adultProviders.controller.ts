import { Request, Response } from 'express';
import AdultUser from '../models/AdultUser';
import { sendAdminNotification } from '../services/emailService';

export const getProviders = async (req: Request, res: Response) => {
  const { page = 1, limit = 20, category, isLive, sortBy = 'rating' } = req.query;

  const query: any = {
    role: 'provider',
    status: 'active',
    'providerProfile.onboarding.isComplete': true,
    isVerified: true
  };

  if (category) query['providerProfile.categories'] = category;
  if (isLive === 'true') query['providerProfile.isLive'] = true;

  const sort: any = {};
  if (sortBy === 'rating') sort['providerProfile.rating.average'] = -1;
  else if (sortBy === 'newest') sort['createdAt'] = -1;
  else if (sortBy === 'popular') sort['providerProfile.viewerCount'] = -1;

  const providers = await AdultUser.find(query)
    .select('providerProfile username displayName profilePhoto country createdAt')
    .sort(sort)
    .limit(Number(limit))
    .skip((Number(page) - 1) * Number(limit));

  const total = await AdultUser.countDocuments(query);

  res.json({ success: true, data: { providers, total, page: Number(page), pages: Math.ceil(total / Number(limit)) } });
};

export const applyAsProvider = async (req: Request, res: Response) => {
  const { stageName, idVerificationDocUrl, categories, contentTags, pricePerMinute, tipMinimum } = req.body;
  const user = req.adultUser;

  if (!user) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Auth required' } });

  const existing = await AdultUser.findOne({ 'providerProfile.stageName': stageName });
  if (existing) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Stage name already in use' } });

  user.role = 'provider';
  user.providerProfile = {
    stageName,
    idVerificationDocUrl,
    categories,
    contentTags,
    pricePerMinute: pricePerMinute || 0,
    tipMinimum: tipMinimum || 0,
    totalEarnings: 0,
    pendingPayout: 0,
    verificationStatus: 'pending',
    isLive: false,
    rating: { average: 0, count: 0 },
  };

  await user.save();
  await sendAdminNotification('New Provider Application', `User ${user.username} applied as ${stageName}`);

  res.json({ success: true, message: 'Application submitted successfully' });
};

export const updateProviderStatus = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status } = req.body; // 'approved' | 'rejected'

    const provider = await AdultUser.findById(id);
    if (!provider || !provider.providerProfile) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Provider not found' } });

    provider.providerProfile.verificationStatus = status;
    await provider.save();

    res.json({ success: true, message: `Provider ${status}` });
};

export const updateProviderProfile = async (req: Request, res: Response) => {
  const user = req.adultUser;
  if (!user || user.role !== 'provider') {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only providers can update profile' } });
  }

  const {
    stageName,
    bio,
    country,
    profilePhoto,
    categories,
    contentTags,
    pricePerMinute,
    tipMinimum,
    videoCallPrice,
    audioCallPrice,
    privateSextPrice,
  } = req.body;

  if (stageName && stageName !== user.providerProfile?.stageName) {
    const existing = await AdultUser.findOne({ 'providerProfile.stageName': stageName, _id: { $ne: user._id } });
    if (existing) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Stage name already in use' } });
    }
  }

  if (bio !== undefined) user.bio = bio;
  if (country !== undefined) user.country = country;
  if (profilePhoto !== undefined) user.profilePhoto = profilePhoto;

  if (!user.providerProfile) {
    user.providerProfile = {
      stageName: stageName || '',
      categories: categories || [],
      contentTags: contentTags || [],
      pricePerMinute: pricePerMinute || 0,
      tipMinimum: tipMinimum || 0,
      videoCallPrice: videoCallPrice || 0,
      audioCallPrice: audioCallPrice || 0,
      privateSextPrice: privateSextPrice || 0,
      totalEarnings: 0,
      pendingPayout: 0,
      verificationStatus: 'pending',
      isLive: false,
      rating: { average: 0, count: 0 },
    };
  } else {
    if (stageName !== undefined) user.providerProfile.stageName = stageName;
    if (categories !== undefined) user.providerProfile.categories = categories;
    if (contentTags !== undefined) user.providerProfile.contentTags = contentTags;
    if (pricePerMinute !== undefined) user.providerProfile.pricePerMinute = pricePerMinute;
    if (tipMinimum !== undefined) user.providerProfile.tipMinimum = tipMinimum;
    if (videoCallPrice !== undefined) user.providerProfile.videoCallPrice = videoCallPrice;
    if (audioCallPrice !== undefined) user.providerProfile.audioCallPrice = audioCallPrice;
    if (privateSextPrice !== undefined) user.providerProfile.privateSextPrice = privateSextPrice;
  }

  await user.save();

  res.json({
    success: true,
    message: 'Profile updated successfully',
    data: {
      user: {
        id: user._id,
        bio: user.bio,
        country: user.country,
        profilePhoto: user.profilePhoto,
        providerProfile: user.providerProfile,
      }
    }
  });
};

export const getAdultProfileMe = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Auth required' } });
    }
    return res.json({ success: true, data: user, ...user.toObject() });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getHookupProviders = async (req: Request, res: Response) => {
  try {
    const { country, state, city, intention, isOnline, page = 1, limit = 20, view } = req.query;

    const filter: any = {
      role: 'provider',
      status: 'active',
      'providerProfile.onboarding.isComplete': true,
      isVerified: true,
      'providerProfile.servicesOffered': 'hookup'
    };

    if (country) {
      filter['providerProfile.location.country.code'] = country;
    }
    if (state) {
      filter['providerProfile.location.state.code'] = state;
    }
    if (city) {
      filter.$or = [
        { 'providerProfile.location.city': { $regex: new RegExp(`^${city}$`, 'i') } },
        { 'providerProfile.location.city.name': { $regex: new RegExp(`^${city}$`, 'i') } }
      ];
    }

    if (intention && intention !== 'Any') {
      filter['providerProfile.categories'] = { $regex: new RegExp(`^${intention}$`, 'i') };
    }

    if (isOnline === 'true') {
      filter['providerProfile.isLive'] = true;
    }

    if (view === 'map') {
      const providers = await AdultUser.find(filter)
        .select('providerProfile displayName profilePhoto username lastActive isOnline')
        .limit(200)
        .lean();

      const mappedProviders = providers
        .filter((p: any) => p.providerProfile?.location?.coordinates?.coordinates?.length === 2 || (p.providerProfile?.location?.city?.lat && p.providerProfile?.location?.city?.lng))
        .map((p: any) => {
          let lat = 0;
          let lng = 0;
          if (p.providerProfile?.location?.coordinates?.coordinates?.length === 2) {
            lng = p.providerProfile.location.coordinates.coordinates[0];
            lat = p.providerProfile.location.coordinates.coordinates[1];
          } else if (p.providerProfile?.location?.city?.lat && p.providerProfile?.location?.city?.lng) {
            lat = p.providerProfile.location.city.lat;
            lng = p.providerProfile.location.city.lng;
          }
          return {
            id: p._id,
            stageName: p.providerProfile?.stageName || p.displayName || p.username,
            avatarUrl: p.profilePhoto || p.providerProfile?.photos?.[0] || '/placeholder.svg',
            coordinates: [lat, lng],
            isOnline: p.providerProfile?.isLive || false,
            tonightRate: p.providerProfile?.tonightRate,
          };
        });

      return res.json({
        success: true,
        providers: mappedProviders
      });
    }

    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 20;

    const providers = await AdultUser.find(filter)
      .sort({ 'providerProfile.isLive': -1, 'providerProfile.rating.average': -1, createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    const total = await AdultUser.countDocuments(filter);

    return res.json({
      success: true,
      data: {
        providers,
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
