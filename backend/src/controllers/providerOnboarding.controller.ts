import { Request, Response } from 'express';
import AdultUser from '../models/AdultUser';
import CreditTransaction from '../models/CreditTransaction';
import AdultMessage from '../models/AdultMessage';
import CamSession from '../models/CamSession';
import { decrypt } from '../services/encryptionService';

const getDefaultProviderProfile = (overrides: any = {}) => {
  return {
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
    profileViews: 0,
    activeSubs: 0,
    schedule: [
      { day: 'Monday', active: true, start: '12:00', end: '23:59' },
      { day: 'Tuesday', active: true, start: '12:00', end: '23:59' },
      { day: 'Wednesday', active: true, start: '12:00', end: '23:59' },
      { day: 'Thursday', active: true, start: '12:00', end: '23:59' },
      { day: 'Friday', active: true, start: '12:00', end: '23:59' },
      { day: 'Saturday', active: true, start: '12:00', end: '23:59' },
      { day: 'Sunday', active: true, start: '12:00', end: '23:59' }
    ],
    ...overrides
  };
};

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

export const updateSchedule = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user || user.role !== 'provider') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only providers can update schedule' } });
    }

    const { schedule } = req.body;
    if (!schedule || !Array.isArray(schedule)) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Schedule is required and must be an array' } });
    }

    if (!user.providerProfile) {
      user.providerProfile = getDefaultProviderProfile();
    }

    user.providerProfile!.schedule = schedule;
    await user.save();

    return res.json({ success: true, message: 'Schedule updated successfully', data: { user } });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getProviderDashboard = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user || user.role !== 'provider') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only providers can view dashboard stats' } });
    }

    const profile = user.providerProfile || getDefaultProviderProfile();

    // 1. Calculate Earnings (Today, Week, Month) from Completed CreditTransactions
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Start of week (7 days ago)
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - 7);

    // Start of month (1st day of current month)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const txs = await CreditTransaction.find({
      userId: user._id,
      status: 'completed',
      amount: { $gt: 0 }
    });

    let todayEarnings = 0;
    let weekEarnings = 0;
    let monthEarnings = 0;

    txs.forEach(tx => {
      const date = new Date(tx.createdAt);
      if (date >= startOfToday) {
        todayEarnings += tx.amount;
      }
      if (date >= startOfWeek) {
        weekEarnings += tx.amount;
      }
      if (date >= startOfMonth) {
        monthEarnings += tx.amount;
      }
    });

    // 2. Fetch real unread messages count
    const unreadMessagesCount = await AdultMessage.countDocuments({
      receiverId: user._id,
      isRead: false
    });

    // 3. Fetch real recent sessions from CamSession
    const recentSessions = await CamSession.find({ providerId: user._id })
      .sort({ startedAt: -1 })
      .limit(5);

    const formattedSessions = recentSessions.map(session => {
      let dateLabel = 'Recent Show';
      if (session.startedAt) {
        const diffMs = now.getTime() - session.startedAt.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays === 0) {
          dateLabel = 'Today';
        } else if (diffDays === 1) {
          dateLabel = 'Yesterday';
        } else {
          dateLabel = `${diffDays} days ago`;
        }

        const startHours = session.startedAt.getHours();
        const startMinutes = session.startedAt.getMinutes();
        const startAmpm = startHours >= 12 ? 'PM' : 'AM';
        const startDisplayHours = startHours % 12 === 0 ? 12 : startHours % 12;
        const startDisplayMinutes = startMinutes > 0 ? `:${startMinutes}` : '';
        dateLabel += ` ${startDisplayHours}${startDisplayMinutes}${startAmpm}`;

        if (session.endedAt) {
          const endHours = session.endedAt.getHours();
          const endMinutes = session.endedAt.getMinutes();
          const endAmpm = endHours >= 12 ? 'PM' : 'AM';
          const endDisplayHours = endHours % 12 === 0 ? 12 : endHours % 12;
          const endDisplayMinutes = endMinutes > 0 ? `:${endMinutes}` : '';
          dateLabel += ` - ${endDisplayHours}${endDisplayMinutes}${endAmpm}`;
        }
      }
      return {
        date: dateLabel,
        tips: session.totalTipsReceived || 0,
        peakViewers: session.peakViewerCount || 0
      };
    });

    // 4. Fetch real recent messages
    const recentDbMessages = await AdultMessage.find({
      $or: [{ senderId: user._id }, { receiverId: user._id }]
    })
    .sort({ createdAt: -1 })
    .limit(5);

    const formattedMessages = [];
    for (const msg of recentDbMessages) {
      const otherUserId = msg.senderId.toString() === user._id.toString() ? msg.receiverId : msg.senderId;
      if (!otherUserId) continue;
      const otherUser = await AdultUser.findById(otherUserId).select('displayName providerProfile');

      let text = '';
      try {
        text = decrypt(msg.content);
      } catch (err) {
        text = msg.content;
      }
      if (msg.unlockCost > 0 && msg.senderId.toString() !== user._id.toString() && (!msg.unlockedBy || !msg.unlockedBy.some(id => id.toString() === user._id.toString()))) {
        text = '[🔒 Premium message]';
      }

      let timeLabel = 'Just now';
      const diffMs = now.getTime() - msg.createdAt.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays > 0) {
        timeLabel = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
      } else if (diffHours > 0) {
        timeLabel = `${diffHours} hr${diffHours > 1 ? 's' : ''} ago`;
      } else if (diffMins > 0) {
        timeLabel = `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
      }

      formattedMessages.push({
        id: msg._id,
        name: otherUser?.providerProfile?.stageName || otherUser?.displayName || 'User',
        text: text,
        time: timeLabel,
      });
    }

    const dbSchedule = profile.schedule && profile.schedule.length > 0 ? profile.schedule : [
      { day: 'Monday', active: true, start: '12:00', end: '23:59' },
      { day: 'Tuesday', active: true, start: '12:00', end: '23:59' },
      { day: 'Wednesday', active: true, start: '12:00', end: '23:59' },
      { day: 'Thursday', active: true, start: '12:00', end: '23:59' },
      { day: 'Friday', active: true, start: '12:00', end: '23:59' },
      { day: 'Saturday', active: true, start: '12:00', end: '23:59' },
      { day: 'Sunday', active: true, start: '12:00', end: '23:59' }
    ];

    return res.json({
      success: true,
      data: {
        stats: {
          todayEarnings,
          weekEarnings,
          monthEarnings,
          profileViews: profile.profileViews || 0,
          newMessages: unreadMessagesCount,
          activeSubs: profile.activeSubs || 0,
          avgRating: profile.rating?.average || 0,
          reviewCount: profile.rating?.count || 0
        },
        recentSessions: formattedSessions,
        recentMessages: formattedMessages,
        schedule: dbSchedule
      }
    });
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
      user.providerProfile = getDefaultProviderProfile({ stageName: stageName || '' });
    }

    if (stageName !== undefined) user.providerProfile!.stageName = stageName;
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
      user.providerProfile = getDefaultProviderProfile({
        categories: servicesOffered,
        servicesOffered
      });
    } else {
      user.providerProfile!.servicesOffered = servicesOffered;
      // Also map to categories to prevent any mismatch
      user.providerProfile!.categories = servicesOffered;
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
      user.providerProfile = getDefaultProviderProfile({
        pricePerMinute: perMinuteRate || 0,
        videoCallPrice: videoCallPrice || perMinuteRate || 0,
        audioCallPrice: audioCallPrice || 0,
        privateSextPrice: privateSextPrice || 0,
        tonightRate,
        tipMenu
      });
    } else {
      if (perMinuteRate !== undefined) {
        user.providerProfile!.pricePerMinute = perMinuteRate;
        user.providerProfile!.videoCallPrice = perMinuteRate;
      }
      if (videoCallPrice !== undefined) user.providerProfile!.videoCallPrice = videoCallPrice;
      if (audioCallPrice !== undefined) user.providerProfile!.audioCallPrice = audioCallPrice;
      if (privateSextPrice !== undefined) user.providerProfile!.privateSextPrice = privateSextPrice;
      if (tonightRate !== undefined) user.providerProfile!.tonightRate = tonightRate;
      if (tipMenu !== undefined) user.providerProfile!.tipMenu = tipMenu;
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
      user.providerProfile = getDefaultProviderProfile();
    }

    user.providerProfile!.location = { country, state, city };
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
      user.providerProfile = getDefaultProviderProfile();
    }

    user.providerProfile!.payoutInfo = payoutInfo;
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
      user.providerProfile = getDefaultProviderProfile({ isLive: isOnline || false });
    } else {
      user.providerProfile!.isLive = isOnline;
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
      user.providerProfile = getDefaultProviderProfile();
    }

    if (photos !== undefined) {
      user.providerProfile!.photos = photos;
      if (photos.length > 0) {
        user.profilePhoto = photos[0];
      }
    }
    if (videoPreview !== undefined) {
      user.providerProfile!.videoPreview = videoPreview;
    }

    await user.save();
    return res.json({ success: true, message: 'Photos updated successfully', data: { user } });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
