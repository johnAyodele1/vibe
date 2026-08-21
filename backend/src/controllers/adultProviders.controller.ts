import { Request, Response } from 'express';
import mongoose from 'mongoose';
import AdultUser from '../models/AdultUser';
import { sendAdminNotification } from '../services/emailService';
import Redis from 'ioredis';
import CreditTransaction from '../models/CreditTransaction';
import { sendPushToUser } from '../shared/push';

let redisClient: Redis | null = null;
const memoryProfileViews = new Map<string, number>();
if (process.env.REDIS_URL || process.env.REDIS_HOST) {
  try {
    redisClient = new Redis(process.env.REDIS_URL || '');
  } catch (err) {}
}

const memoryPhotoUnlocks = new Map<string, Set<string>>();

export const getProviderPublicProfile = async (req: Request, res: Response) => {
  try {
    const { providerId } = req.params;

    if (typeof providerId !== 'string' || !mongoose.Types.ObjectId.isValid(providerId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ID',
          message: 'Invalid provider ID format'
        }
      });
    }

    const provider = await AdultUser.findOne({
      _id: providerId,
      role: 'provider'
    });

    if (!provider) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Provider not found' } });
    }

    // Profile view tracking and rate-limited push trigger
    const viewerId = req.adultUser?._id;
    if (viewerId && viewerId.toString() !== providerId) {
      const viewKey = `profile_view:${providerId}:${viewerId.toString()}`;
      let alreadyNotified = false;

      if (redisClient) {
        try {
          alreadyNotified = (await redisClient.exists(viewKey)) === 1;
        } catch (err) {
          console.error('Redis exists profile_view error:', err);
        }
      } else {
        const lastNotified = memoryProfileViews.get(viewKey);
        if (lastNotified && Date.now() - lastNotified < 3600000) {
          alreadyNotified = true;
        }
      }

      if (!alreadyNotified) {
        if (redisClient) {
          try {
            await redisClient.setex(viewKey, 3600, '1');
          } catch (err) {
            console.error('Redis setex profile_view error:', err);
          }
        } else {
          memoryProfileViews.set(viewKey, Date.now());
        }

        // Send push notification to provider
        const viewer = await AdultUser.findById(viewerId);
        if (viewer) {
          sendPushToUser(providerId, {
            title:    `👀 ${viewer.displayName || viewer.username || 'Someone'} viewed your profile`,
            body:     'Check who stopped by',
            icon:     viewer.profilePhoto || '/icons/icon-192x192.png',
            badge:    '/icons/badge-72x72.png',
            tag:      `profile_view_${providerId}`,
            renotify: false,
            url:      '/adult/provider/dashboard',
            unreadCount: 0,
            type:     'profile_view',
          }).catch(err => console.error('[Push][View] Failed:', err));
        }
      }
    }

    const date = new Date(provider.createdAt);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const memberSince = `Member since ${months[date.getMonth()]} ${date.getFullYear()}`;

    // Map photos
    const photos = (provider.providerProfile?.photos || []).map((url, index) => ({
      url,
      order: index,
      isExplicit: index > 0 // Heuristic: secondary photos are explicit
    }));

    const memberId = req.adultUser?._id?.toString();
    const unlockedPhotoIndexes: number[] = [];
    if (memberId) {
      const unlockKey = `unlock:provider:${providerId}:member:${memberId}`;
      if (redisClient) {
        try {
          const members = await redisClient.smembers(unlockKey);
          members.forEach(m => {
            const parsed = parseInt(m);
            if (!isNaN(parsed)) unlockedPhotoIndexes.push(parsed);
          });
        } catch (e) {
          console.error('smembers error:', e);
        }
      } else {
        const set = memoryPhotoUnlocks.get(unlockKey);
        if (set) {
          set.forEach(m => {
            const parsed = parseInt(m);
            if (!isNaN(parsed)) unlockedPhotoIndexes.push(parsed);
          });
        }
      }
    }

    const pricing = {
      perMinuteRate: provider.providerProfile?.servicesOffered?.includes('private_call')
        ? (provider.providerProfile?.pricePerMinute || null)
        : null,
      tonightRate: provider.providerProfile?.servicesOffered?.includes('hookup')
        ? (provider.providerProfile?.tonightRate || null)
        : null,
      tipMenu: (provider.providerProfile?.tipMenu || []).map(item => ({
        amount: item.amount,
        description: item.action || 'Tip'
      }))
    };

    const publicProfile = {
      id: provider._id.toString(),
      stageName: provider.providerProfile?.stageName || provider.displayName || 'Unknown',
      bio: provider.bio || '',
      tagline: provider.providerProfile?.contentTags?.join(', ') || '',
      gender: provider.providerProfile?.gender || 'Not specified',
      avatarUrl: provider.profilePhoto || provider.providerProfile?.photos?.[0] || '',
      photos,
      unlockedPhotoIndexes,
      videoPreviewUrl: provider.providerProfile?.videoPreview || null,
      location: {
        city: provider.providerProfile?.location?.city?.name || provider.location?.city?.name || 'Unknown',
        country: {
          name: provider.providerProfile?.location?.country?.name || provider.location?.country?.name || 'Unknown'
        }
      },
      servicesOffered: provider.providerProfile?.servicesOffered || [],
      pricing,
      isOnline: provider.providerProfile?.isOnline || false,
      rating: provider.providerProfile?.rating?.average || 0,
      reviewCount: provider.providerProfile?.rating?.count || 0,
      isVerified: provider.isVerified || false,
      memberSince,
      totalResponseCount: provider.providerProfile?.totalResponseCount || 0,
      totalResponseMinutes: provider.providerProfile?.totalResponseMinutes || 0,
    };

    return res.json({ success: true, data: publicProfile });
  } catch (error) {
    console.error('Error fetching provider public profile:', error);
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Internal server error' } });
  }
};

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
    // Security check: Only admins can update provider verification status
    const user = req.adultUser;
    if (!user || (user.role !== 'admin' && !user.isAdmin)) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
    }

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

export const unlockProviderPhoto = async (req: Request, res: Response) => {
  try {
    const providerId = req.params.providerId as string;
    const photoIndex = req.params.photoIndex as string;
    const memberId = req.adultUser?._id;

    if (!memberId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }

    const UNLOCK_COST = 1;  // 1 diamond

    // Get provider
    const provider = await AdultUser.findOne({ _id: providerId, role: 'provider' });
    if (!provider || !provider.providerProfile || !provider.providerProfile.photos) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Provider profile not found' } });
    }

    const idx = parseInt(photoIndex);
    const photosCount = provider.providerProfile.photos.length;
    if (isNaN(idx) || idx < 1 || idx >= photosCount) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Photo not found' } });
    }

    const realPhotoUrl = provider.providerProfile.photos[idx];

    // Check if already unlocked
    const unlockKey = `unlock:provider:${providerId}:member:${memberId}`;
    let alreadyUnlocked = false;

    if (redisClient) {
      try {
        alreadyUnlocked = (await redisClient.sismember(unlockKey, idx.toString())) === 1;
      } catch (err) {
        console.error('Redis sismember error:', err);
      }
    } else {
      alreadyUnlocked = !!memoryPhotoUnlocks.get(unlockKey)?.has(idx.toString());
    }

    if (alreadyUnlocked) {
      return res.json({ success: true, url: realPhotoUrl, alreadyUnlocked: true });
    }

    // Check balance
    const memberCredits = req.adultUser!.credits;
    if (memberCredits < UNLOCK_COST) {
      return res.status(402).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_FUNDS',
          message: 'Not enough credits',
          required: UNLOCK_COST,
        }
      });
    }

    // Deduct from member atomically
    const updatedMember = await AdultUser.findOneAndUpdate(
      { _id: memberId, credits: { $gte: UNLOCK_COST } },
      { $inc: { credits: -UNLOCK_COST } },
      { new: true }
    );

    if (!updatedMember) {
      return res.status(402).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_FUNDS',
          message: 'Not enough credits',
          required: UNLOCK_COST,
        }
      });
    }

    // Increment provider
    const updatedProvider = await AdultUser.findByIdAndUpdate(
      providerId,
      {
        $inc: {
          credits: UNLOCK_COST,
          'providerProfile.totalEarnings': UNLOCK_COST
        }
      },
      { new: true }
    );

    // Record transaction for member
    await CreditTransaction.create({
      userId: memberId,
      type: 'paid_media_unlock',
      amount: UNLOCK_COST,
      usdAmount: 0,
      description: `Unlocked photo index ${idx} for provider ${provider.providerProfile?.stageName || provider.displayName}`,
      relatedUserId: provider._id,
      status: 'completed',
      platformFee: 0,
      eligibleForPayout: true,
    });

    // Record transaction for provider as earning
    await CreditTransaction.create({
      userId: provider._id,
      type: 'paid_media_unlock',
      amount: UNLOCK_COST,
      usdAmount: 0,
      description: `Earning from photo index ${idx} unlocked by member ${updatedMember.displayName}`,
      relatedUserId: memberId,
      status: 'completed',
      platformFee: 0,
      eligibleForPayout: true,
    });

    // Record the unlock in Redis / Memory cache
    if (redisClient) {
      try {
        await redisClient.sadd(unlockKey, idx.toString());
        await redisClient.expire(unlockKey, 30 * 24 * 60 * 60);  // 30 days
      } catch (err) {
        console.error('Redis sadd error:', err);
      }
    } else {
      if (!memoryPhotoUnlocks.has(unlockKey)) {
        memoryPhotoUnlocks.set(unlockKey, new Set());
      }
      memoryPhotoUnlocks.get(unlockKey)!.add(idx.toString());
    }

    // Emit socket updates dynamically to prevent circular dependencies
    const { socketService: dynamicSocketService } = require('../services/socketService');
    dynamicSocketService.emitToUser(memberId.toString(), 'wallet:updated', { balance: updatedMember.credits });
    if (updatedProvider) {
      dynamicSocketService.emitToUser(providerId.toString(), 'wallet:updated', { balance: updatedProvider.credits });
    }

    return res.json({ success: true, url: realPhotoUrl });
  } catch (error) {
    console.error('Error unlocking provider photo:', error);
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Internal server error' } });
  }
};
