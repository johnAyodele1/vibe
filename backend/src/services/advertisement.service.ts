import mongoose from 'mongoose';
import Advertisement, { IAdvertisement } from '../models/Advertisement';
import AdvertisementImpression from '../models/AdvertisementImpression';

export const TWO_HOURS_MS = 2 * 60 * 60 * 1000; // 2 hours in milliseconds

export interface CreateAdInput {
  title: string;
  description?: string;
  mediaType: 'image' | 'video';
  mediaUrl: string;
  thumbnailUrl?: string;
  clickUrl?: string;
  targetAudience?: 'user' | 'provider' | 'both';
  status?: 'draft' | 'scheduled' | 'active' | 'paused' | 'expired';
  campaignStartsAt: string | Date;
  campaignEndsAt: string | Date;
  displayDurationSeconds?: number;
  closeAfterSeconds?: number;
}

export interface UpdateAdInput extends Partial<CreateAdInput> {
  isArchived?: boolean;
}

export const validateAdTimingsAndDates = (
  startsAt: Date,
  endsAt: Date,
  displayDurationSeconds: number,
  closeAfterSeconds: number,
  clickUrl?: string
) => {
  if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime())) {
    throw new Error('Invalid campaign start or end date');
  }

  if (startsAt >= endsAt) {
    throw new Error('Campaign start date must be before campaign end date');
  }

  if (displayDurationSeconds <= 0) {
    throw new Error('Display duration must be greater than 0 seconds');
  }

  if (closeAfterSeconds <= 0) {
    throw new Error('Close delay must be greater than 0 seconds');
  }

  if (closeAfterSeconds > displayDurationSeconds) {
    throw new Error('Close delay cannot exceed display duration');
  }

  if (clickUrl && clickUrl.trim().length > 0) {
    try {
      new URL(clickUrl);
    } catch {
      throw new Error('Malformed click URL format');
    }
  }
};

export class AdvertisementService {
  /**
   * Get an eligible advertisement for an authenticated user/provider.
   * Enforces 2-hour server-authoritative cooldown per user account.
   */
  static async getEligibleAdvertisement(
    userId: string | mongoose.Types.ObjectId,
    userRole: 'user' | 'provider' | 'admin'
  ) {
    const userObjId = new mongoose.Types.ObjectId(userId);

    // 1. Check user's 2-hour cooldown across all conversations
    const lastImpression = await AdvertisementImpression.findOne({ userId: userObjId })
      .sort({ shownAt: -1 })
      .lean();

    if (lastImpression) {
      const timeSinceLastImpression = Date.now() - new Date(lastImpression.shownAt).getTime();
      if (timeSinceLastImpression < TWO_HOURS_MS) {
        return null;
      }
    }

    // 2. Query eligible active advertisements within campaign window
    const now = new Date();
    const audienceFilter =
      userRole === 'provider'
        ? { targetAudience: { $in: ['provider', 'both'] } }
        : userRole === 'user'
        ? { targetAudience: { $in: ['user', 'both'] } }
        : { targetAudience: { $in: ['user', 'provider', 'both'] } };

    const candidates = await Advertisement.find({
      status: 'active',
      isArchived: false,
      campaignStartsAt: { $lte: now },
      campaignEndsAt: { $gte: now },
      ...audienceFilter,
    }).lean();

    if (!candidates || candidates.length === 0) {
      return null;
    }

    // Pick a random eligible advertisement among candidates
    const selected = candidates[Math.floor(Math.random() * candidates.length)];

    return {
      id: selected._id.toString(),
      title: selected.title,
      description: selected.description,
      mediaType: selected.mediaType,
      mediaUrl: selected.mediaUrl,
      thumbnailUrl: selected.thumbnailUrl || null,
      clickUrl: selected.clickUrl || null,
      displayDurationSeconds: selected.displayDurationSeconds,
      closeAfterSeconds: selected.closeAfterSeconds,
    };
  }

  /**
   * Record that an advertisement was displayed.
   */
  static async recordImpression(
    userId: string | mongoose.Types.ObjectId,
    advertisementId: string,
    userRole: 'user' | 'provider' | 'admin'
  ) {
    if (!mongoose.Types.ObjectId.isValid(advertisementId)) {
      throw new Error('Invalid advertisement ID');
    }

    const userObjId = new mongoose.Types.ObjectId(userId);
    const adObjId = new mongoose.Types.ObjectId(advertisementId);

    // Verify advertisement exists, is active, within campaign dates
    const ad = await Advertisement.findById(adObjId).lean();
    if (!ad || ad.isArchived || ad.status !== 'active') {
      throw new Error('Advertisement is not active or available');
    }

    const now = new Date();
    if (now < new Date(ad.campaignStartsAt) || now > new Date(ad.campaignEndsAt)) {
      throw new Error('Advertisement campaign is not currently active');
    }

    // Verify audience targeting matches user role
    if (
      userRole === 'provider' && ad.targetAudience === 'user' ||
      userRole === 'user' && ad.targetAudience === 'provider'
    ) {
      throw new Error('Advertisement is not targeted to your account type');
    }

    // Duplicate impression protection (e.g. component remounts within 1 minute)
    const recentImpression = await AdvertisementImpression.findOne({
      userId: userObjId,
      advertisementId: adObjId,
      shownAt: { $gte: new Date(Date.now() - 60 * 1000) },
    }).lean();

    if (recentImpression) {
      return {
        id: recentImpression._id.toString(),
        advertisementId: recentImpression.advertisementId.toString(),
        userId: recentImpression.userId.toString(),
        shownAt: recentImpression.shownAt,
      };
    }

    const impression = await AdvertisementImpression.create({
      advertisementId: adObjId,
      userId: userObjId,
      shownAt: new Date(),
    });

    return {
      id: impression._id.toString(),
      advertisementId: impression.advertisementId.toString(),
      userId: impression.userId.toString(),
      shownAt: impression.shownAt,
    };
  }

  /**
   * Record click on an advertisement CTA.
   */
  static async recordClick(
    userId: string | mongoose.Types.ObjectId,
    advertisementId: string
  ) {
    if (!mongoose.Types.ObjectId.isValid(advertisementId)) {
      throw new Error('Invalid advertisement ID');
    }

    const userObjId = new mongoose.Types.ObjectId(userId);
    const adObjId = new mongoose.Types.ObjectId(advertisementId);

    const ad = await Advertisement.findById(adObjId).lean();
    if (!ad) {
      throw new Error('Advertisement not found');
    }

    // Find recent impression for this user & ad and update clickedAt
    const impression = await AdvertisementImpression.findOneAndUpdate(
      { userId: userObjId, advertisementId: adObjId },
      { $set: { clickedAt: new Date() } },
      { sort: { shownAt: -1 }, new: true }
    );

    return {
      success: true,
      clickedAt: impression?.clickedAt || new Date(),
    };
  }

  // --- ADMIN MANAGEMENT METHODS ---

  static async adminGetAdvertisements(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [ads, total] = await Promise.all([
      Advertisement.find({ isArchived: false })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Advertisement.countDocuments({ isArchived: false }),
    ]);

    // Update effective availability status if needed on fetch
    const now = new Date();
    const formattedAds = ads.map(ad => {
      let effectiveStatus = ad.status;
      if (ad.status === 'active' && (now > new Date(ad.campaignEndsAt) || now < new Date(ad.campaignStartsAt))) {
        effectiveStatus = now > new Date(ad.campaignEndsAt) ? 'expired' : 'scheduled';
      }

      return {
        id: ad._id.toString(),
        title: ad.title,
        description: ad.description || '',
        mediaType: ad.mediaType,
        mediaUrl: ad.mediaUrl,
        thumbnailUrl: ad.thumbnailUrl || null,
        clickUrl: ad.clickUrl || null,
        targetAudience: ad.targetAudience,
        status: ad.status,
        effectiveStatus,
        campaignStartsAt: ad.campaignStartsAt,
        campaignEndsAt: ad.campaignEndsAt,
        displayDurationSeconds: ad.displayDurationSeconds,
        closeAfterSeconds: ad.closeAfterSeconds,
        createdAt: ad.createdAt,
        updatedAt: ad.updatedAt,
      };
    });

    return {
      advertisements: formattedAds,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  static async adminCreateAdvertisement(input: CreateAdInput, adminUserId?: string) {
    const startsAt = new Date(input.campaignStartsAt);
    const endsAt = new Date(input.campaignEndsAt);
    const displayDurationSeconds = input.displayDurationSeconds ?? 30;
    const closeAfterSeconds = input.closeAfterSeconds ?? 15;

    validateAdTimingsAndDates(
      startsAt,
      endsAt,
      displayDurationSeconds,
      closeAfterSeconds,
      input.clickUrl
    );

    const createdByObjId = adminUserId && mongoose.Types.ObjectId.isValid(adminUserId)
      ? new mongoose.Types.ObjectId(adminUserId)
      : undefined;

    const ad = await Advertisement.create({
      title: input.title.trim(),
      description: input.description?.trim(),
      mediaType: input.mediaType,
      mediaUrl: input.mediaUrl.trim(),
      thumbnailUrl: input.thumbnailUrl?.trim(),
      clickUrl: input.clickUrl?.trim(),
      targetAudience: input.targetAudience || 'both',
      status: input.status || 'draft',
      campaignStartsAt: startsAt,
      campaignEndsAt: endsAt,
      displayDurationSeconds,
      closeAfterSeconds,
      createdBy: createdByObjId,
      isArchived: false,
    });

    return ad;
  }

  static async adminUpdateAdvertisement(adId: string, input: UpdateAdInput) {
    if (!mongoose.Types.ObjectId.isValid(adId)) {
      throw new Error('Invalid advertisement ID');
    }

    const existing = await Advertisement.findById(adId);
    if (!existing || existing.isArchived) {
      throw new Error('Advertisement not found');
    }

    const startsAt = input.campaignStartsAt ? new Date(input.campaignStartsAt) : existing.campaignStartsAt;
    const endsAt = input.campaignEndsAt ? new Date(input.campaignEndsAt) : existing.campaignEndsAt;
    const displayDurationSeconds = input.displayDurationSeconds ?? existing.displayDurationSeconds;
    const closeAfterSeconds = input.closeAfterSeconds ?? existing.closeAfterSeconds;
    const clickUrl = input.clickUrl !== undefined ? input.clickUrl : existing.clickUrl;

    validateAdTimingsAndDates(
      startsAt,
      endsAt,
      displayDurationSeconds,
      closeAfterSeconds,
      clickUrl
    );

    if (input.title !== undefined) existing.title = input.title.trim();
    if (input.description !== undefined) existing.description = input.description.trim();
    if (input.mediaType !== undefined) existing.mediaType = input.mediaType;
    if (input.mediaUrl !== undefined) existing.mediaUrl = input.mediaUrl.trim();
    if (input.thumbnailUrl !== undefined) existing.thumbnailUrl = input.thumbnailUrl.trim();
    if (input.clickUrl !== undefined) existing.clickUrl = input.clickUrl.trim();
    if (input.targetAudience !== undefined) existing.targetAudience = input.targetAudience;
    if (input.status !== undefined) existing.status = input.status;
    existing.campaignStartsAt = startsAt;
    existing.campaignEndsAt = endsAt;
    existing.displayDurationSeconds = displayDurationSeconds;
    existing.closeAfterSeconds = closeAfterSeconds;

    await existing.save();
    return existing;
  }

  static async adminUpdateAdvertisementStatus(adId: string, status: 'draft' | 'scheduled' | 'active' | 'paused' | 'expired') {
    if (!mongoose.Types.ObjectId.isValid(adId)) {
      throw new Error('Invalid advertisement ID');
    }

    const ad = await Advertisement.findOneAndUpdate(
      { _id: adId, isArchived: false },
      { $set: { status } },
      { new: true }
    );

    if (!ad) {
      throw new Error('Advertisement not found');
    }

    return ad;
  }

  static async adminDeleteAdvertisement(adId: string) {
    if (!mongoose.Types.ObjectId.isValid(adId)) {
      throw new Error('Invalid advertisement ID');
    }

    const ad = await Advertisement.findOneAndUpdate(
      { _id: adId },
      { $set: { isArchived: true, status: 'expired' } },
      { new: true }
    );

    if (!ad) {
      throw new Error('Advertisement not found');
    }

    return { success: true };
  }
}
