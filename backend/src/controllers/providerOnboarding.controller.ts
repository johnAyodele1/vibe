import { Request, Response } from 'express';
import AdultUser from '../models/AdultUser';
import CreditTransaction from '../models/CreditTransaction';
import AdultMessage from '../models/AdultMessage';
import CamSession from '../models/CamSession';
import { decrypt } from '../services/encryptionService';
import { getDiamondNairaRate } from '../shared/pricing';
import { FOLDERS, uploadToCloudinary } from '../shared/media/cloudinaryUpload';
import { PROVIDER_EARNING_TYPES, REVERT_TYPES, getDateRangeBounds, calculateProviderBalanceBreakdown } from '../shared/earnings';

const geocodeLocation = async (city: string, state: string, country: string) => {
  try {
    const queryStr = `${city}, ${state}, ${country}`;
    const geoUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(queryStr)}&format=json&limit=1`;
    const geoRes = await fetch(geoUrl, {
      headers: { 'User-Agent': 'VibeApp/1.0' }
    });
    const geoData = await geoRes.json() as any;
    if (geoData[0]) {
      const lat = parseFloat(geoData[0].lat);
      const lon = parseFloat(geoData[0].lon);
      return {
        type: 'Point',
        coordinates: [lon, lat],
        lat,
        lng: lon
      };
    }
  } catch (err) {
    console.error('Geocoding helper failed:', err);
  }
  return null;
};

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

export const uploadMedia = async (req: Request, res: Response) => {
  const { context, isLocked } = req.body;
  const file = req.file;

  if (!file) return res.status(400).json({ error: 'No file provided' });

  // Determine folder and resource type from context
  const CONTEXT_MAP: Record<string, { folder: string, resourceType: 'image' | 'video' | 'raw', isPrivate: boolean }> = {
    profile_photo:    { folder: FOLDERS.profilePhoto,    resourceType: 'image',  isPrivate: false },
    onboarding_photo: { folder: FOLDERS.onboardingPhoto, resourceType: 'image',  isPrivate: false },
    onboarding_video: { folder: FOLDERS.onboardingVideo, resourceType: 'video',  isPrivate: false },
    chat_image:       { folder: FOLDERS.chatImage,       resourceType: 'image',  isPrivate: false },
    chat_video:       { folder: FOLDERS.chatVideo,       resourceType: 'video',  isPrivate: false },
    voice_note:       { folder: FOLDERS.voiceNote,       resourceType: 'video',  isPrivate: false },
    paid_image:       { folder: FOLDERS.paidMedia,       resourceType: 'image',  isPrivate: true  },
    paid_video:       { folder: FOLDERS.paidMedia,       resourceType: 'video',  isPrivate: true  },
    cam_thumbnail:    { folder: FOLDERS.camThumbnail,    resourceType: 'image',  isPrivate: false },
  };

  const config = CONTEXT_MAP[context as string];
  if (!config) return res.status(400).json({ error: 'Invalid context' });

  // File size limits per type
  const SIZE_LIMITS = {
    image: 2 * 1024 * 1024,    // 2MB (already compressed client-side to WebP at 0.4)
    audio: 5 * 1024 * 1024,    // 5MB for voice notes
    video: 5 * 1024 * 1024,    // 5MB for videos
  };

  const typeCategory = file.mimetype.startsWith('audio') || context === 'voice_note'
    ? 'audio'
    : file.mimetype.startsWith('video')
    ? 'video'
    : 'image';

  if (file.size > SIZE_LIMITS[typeCategory]) {
    return res.status(413).json({
      error: `File too large. Maximum: ${SIZE_LIMITS[typeCategory] / 1024 / 1024}MB`,
    });
  }

  try {
    const result = await uploadToCloudinary(file.buffer, {
      resourceType: config.resourceType,
      folder:       config.folder,
      isPrivate:    config.isPrivate || isLocked === 'true',
    });

    return res.json({
      url:         result.url,
      publicUrl:   result.url, // For compatibility
      publicId:    result.publicId,
      format:      result.format,
      bytes:       result.bytes,
      duration:    result.duration,
      width:       result.width,
      height:      result.height,
      isPrivate:   config.isPrivate || isLocked === 'true',
    });
  } catch (err) {
    console.error('Cloudinary upload error:', err);
    return res.status(500).json({ error: 'Upload failed. Please try again.' });
  }
};

export const getHookupNearbyProviders = async (req: Request, res: Response) => {
  try {
    const { country, state, city, isOnline, page = 1, limit = 20, view } = req.query;

    const baseProviderFilter: any = {
      role: 'provider',
      status: 'active',
      'providerProfile.onboarding.isComplete': true,
      isVerified: true,
      'providerProfile.servicesOffered': 'hookup'
    };

    if (country) {
      baseProviderFilter['providerProfile.location.country.code'] = country;
    }
    if (state) {
      baseProviderFilter['providerProfile.location.state.code'] = state;
    }
    if (city) {
      baseProviderFilter['providerProfile.location.city.name'] = { $regex: new RegExp(`^${city}$`, 'i') };
    }
    if (isOnline === 'true') {
      baseProviderFilter['providerProfile.isOnline'] = true;
    }

    if (view === 'map') {
      const providers = await AdultUser.find(baseProviderFilter)
        .select('providerProfile displayName profilePhoto country createdAt dateOfBirth isVerified')
        .limit(200)
        .lean();

      const mapped = providers
        .filter((p: any) => p.providerProfile?.location?.coordinates?.coordinates?.length === 2 || p.providerProfile?.location?.city?.lat)
        .map((p: any) => {
          let lat = p.providerProfile?.location?.city?.lat || 0;
          let lng = p.providerProfile?.location?.city?.lng || 0;
          if (p.providerProfile?.location?.coordinates?.coordinates?.length === 2) {
            lng = p.providerProfile.location.coordinates.coordinates[0];
            lat = p.providerProfile.location.coordinates.coordinates[1];
          }
          return {
            id: p._id,
            stageName: p.providerProfile?.stageName || p.displayName,
            avatarUrl: p.profilePhoto || p.providerProfile?.photos?.[0] || '/placeholder.svg',
            coordinates: [lat, lng],
            isOnline: p.providerProfile?.isOnline || false,
            tonightRate: p.providerProfile?.tonightRate,
          };
        });

      return res.json({
        success: true,
        providers: mapped
      });
    }

    // Grid view (paginated)
    const sort: any = {
      'providerProfile.isOnline': -1,
      'providerProfile.rating.average': -1,
      'createdAt': -1
    };

    const providers = await AdultUser.find(baseProviderFilter)
      .sort(sort)
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    const total = await AdultUser.countDocuments(baseProviderFilter);

    const formattedProviders = providers.map((p: any) => {
      let age = 18;
      if (p.dateOfBirth) {
        const today = new Date();
        const birth = new Date(p.dateOfBirth);
        age = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
          age--;
        }
      }

      return {
        id: p._id,
        stageName: p.providerProfile?.stageName || p.displayName,
        age,
        location: p.providerProfile?.location,
        isOnline: p.providerProfile?.isOnline || false,
        isVerified: p.isVerified,
        photoUrl: p.profilePhoto || p.providerProfile?.photos?.[0] || '/placeholder.svg',
        tonightRate: p.providerProfile?.tonightRate,
      };
    });

    return res.json({
      success: true,
      data: {
        providers: formattedProviders,
        total,
        page: Number(page),
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getAdultMemberProfile = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Auth required' } });
    }

    const location = user.location?.country?.code ? user.location : user.providerProfile?.location;

    return res.json({
      success: true,
      data: {
        id: user._id,
        email: user.email,
        username: user.username,
        role: user.role,
        displayName: user.displayName,
        bio: user.bio || '',
        location: location || null
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const updateAdultMemberProfile = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Auth required' } });
    }

    const { displayName, bio, location, username } = req.body;

    if (username !== undefined && username !== user.username) {
      const existing = await AdultUser.findOne({ username, _id: { $ne: user._id } });
      if (existing) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Username already in use' } });
      }
      user.username = username;
    }

    if (displayName !== undefined) user.displayName = displayName;
    if (bio !== undefined) user.bio = bio;
    if (location !== undefined) user.location = location;

    await user.save();

    return res.json({
      success: true,
      data: {
        id: user._id,
        email: user.email,
        username: user.username,
        role: user.role,
        displayName: user.displayName,
        bio: user.bio || '',
        location: user.location || null
      }
    });
  } catch (error: any) {
    if (error.name === 'ValidationError' && error.errors) {
      const firstErrKey = Object.keys(error.errors)[0];
      const msg = error.errors[firstErrKey]?.message || error.message;
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: msg } });
    }
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getOnboardingProgress = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user || user.role !== 'provider') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only providers can view onboarding progress' } });
    }

    const profile = (user.providerProfile || getDefaultProviderProfile()) as any;

    const currentStep = profile.onboarding?.currentStep || 1;
    const completedSteps = profile.onboarding?.completedSteps || [];
    const isComplete = profile.onboarding?.isComplete || false;

    let formattedDob = '';
    if (user.dateOfBirth) {
      formattedDob = new Date(user.dateOfBirth).toISOString().split('T')[0];
    }

    const stepData = {
      1: user.bio || formattedDob ? {
        bio: user.bio || '',
        gender: profile.gender || 'female',
        dateOfBirth: formattedDob,
      } : null,
      2: (profile.photos && profile.photos.length > 0) || profile.videoPreview ? {
        photos: profile.photos || [],
        videoPreview: profile.videoPreview || '',
        videoPreviewUrl: profile.videoPreview || '',
      } : null,
      3: profile.servicesOffered && profile.servicesOffered.length > 0 ? {
        servicesOffered: profile.servicesOffered,
      } : null,
      4: profile.pricePerMinute || profile.tonightRate || (profile.tipMenu && profile.tipMenu.length > 0) ? {
        pricing: {
          perMinuteRate: profile.pricePerMinute || 1.99,
          tonightRate: profile.tonightRate || 0,
        },
        tipMenu: profile.tipMenu || [],
      } : null,
      5: profile.location?.city ? {
        location: profile.location,
        coverageArea: profile.coverageArea || 'city',
      } : null,
      6: profile.payoutInfo?.method ? {
        payoutMethod: profile.payoutInfo.method,
        payoutDetails: profile.payoutInfo.details,
        bankDetails: profile.payoutInfo.method === 'bank' ? profile.payoutInfo.details : null,
        paypalEmail: profile.payoutInfo.method === 'paypal' ? profile.payoutInfo.details?.paypalEmail : null,
        crypto: profile.payoutInfo.method === 'crypto' ? profile.payoutInfo.details : null,
      } : null,
    };

    return res.json({
      success: true,
      currentStep,
      completedSteps,
      isComplete,
      stepData,
      data: {
        success: true,
        currentStep,
        completedSteps,
        isComplete,
        stepData,
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const saveOnboardingStep = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user || user.role !== 'provider') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only providers can save progress' } });
    }

    const stepNumber = parseInt(req.params.stepNumber as string, 10);
    if (isNaN(stepNumber) || stepNumber < 1 || stepNumber > 6) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid step number' } });
    }

    if (!user.providerProfile) {
      user.providerProfile = getDefaultProviderProfile() as any;
    }

    const profile = user.providerProfile as any;
    if (!profile.onboarding) {
      profile.onboarding = {
        currentStep: 1,
        completedSteps: [],
        isComplete: false,
        completedAt: null,
      };
    }

    if (stepNumber > 1) {
      const prevSteps = Array.from({ length: stepNumber - 1 }, (_, i) => i + 1);
      const hasAllPrev = prevSteps.every(st => profile.onboarding!.completedSteps.includes(st));
      if (!hasAllPrev) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'PREREQUISITES_NOT_MET',
            message: `Cannot save step ${stepNumber} unless all previous steps are completed.`
          }
        });
      }
    }

    const errors: Record<string, string> = {};

    if (stepNumber === 1) {
      const { bio, gender, dateOfBirth } = req.body;
      if (!bio || typeof bio !== 'string' || bio.trim().length < 10) {
        errors.bio = 'Bio must be at least 10 characters long';
      } else if (bio.trim().length > 1000) {
        errors.bio = 'Bio cannot exceed 1000 characters';
      }
      if (!gender) {
        errors.gender = 'Gender is required';
      }
      if (!dateOfBirth) {
        errors.dateOfBirth = 'Date of birth is required';
      } else {
        const dob = new Date(dateOfBirth);
        if (isNaN(dob.getTime())) {
          errors.dateOfBirth = 'Invalid date of birth';
        } else {
          const ageDiff = Date.now() - dob.getTime();
          const ageDate = new Date(ageDiff);
          const age = Math.abs(ageDate.getUTCFullYear() - 1970);
          if (dob.getTime() > Date.now()) {
            errors.dateOfBirth = 'Date of birth cannot be in the future';
          } else if (age < 18) {
            errors.dateOfBirth = 'Must be 18 years or older';
          }
        }
      }

      if (Object.keys(errors).length > 0) {
        return res.status(400).json({ success: false, errors });
      }

      user.bio = bio;
      profile.gender = gender;
      user.dateOfBirth = new Date(dateOfBirth);
    }

    else if (stepNumber === 2) {
      const { photos, videoPreview } = req.body;
      if (photos !== undefined) {
        if (!Array.isArray(photos)) {
          errors.photos = 'Photos must be an array';
        } else if (photos.length > 8) {
          errors.photos = 'Cannot upload more than 8 photos';
        }
      }

      if (Object.keys(errors).length > 0) {
        return res.status(400).json({ success: false, errors });
      }

      if (photos !== undefined) {
        profile.photos = photos;
        if (photos.length > 0) {
          user.profilePhoto = photos[0];
        }
      }
      if (videoPreview !== undefined) {
        profile.videoPreview = videoPreview;
      }
    }

    else if (stepNumber === 3) {
      const { servicesOffered } = req.body;
      const allowed = ['live_cam', 'private_call', 'sext', 'hookup', 'random'];
      if (!servicesOffered || !Array.isArray(servicesOffered) || servicesOffered.length === 0) {
        errors.servicesOffered = 'At least one service must be selected';
      } else {
        const invalid = servicesOffered.some(s => !allowed.includes(s));
        if (invalid) {
          errors.servicesOffered = 'Invalid service selection';
        }
      }

      if (Object.keys(errors).length > 0) {
        return res.status(400).json({ success: false, errors });
      }

      profile.servicesOffered = servicesOffered;
      profile.categories = servicesOffered;
    }

    else if (stepNumber === 4) {
      const { perMinuteRate, tonightRate, tipMenu } = req.body;
      const selectedServices = profile.servicesOffered || [];

      if (selectedServices.includes('private_call')) {
        if (perMinuteRate === undefined || isNaN(Number(perMinuteRate))) {
          errors.perMinuteRate = 'Per-minute rate is required';
        } else if (Number(perMinuteRate) < 0) {
          errors.perMinuteRate = 'Minimum rate per minute is 0 diamonds';
        }
      }

      if (selectedServices.includes('hookup')) {
        if (tonightRate === undefined || isNaN(Number(tonightRate))) {
          errors.tonightRate = 'Rate for tonight is required';
        } else if (Number(tonightRate) < 0) {
          errors.tonightRate = 'Minimum rate for tonight is 0 diamonds';
        }
      }

      if (tipMenu !== undefined) {
        if (!Array.isArray(tipMenu)) {
          errors.tipMenu = 'Tip menu must be an array';
        } else if (tipMenu.length > 10) {
          errors.tipMenu = 'Tip menu can contain maximum 10 items';
        } else {
          for (let i = 0; i < tipMenu.length; i++) {
            const item = tipMenu[i];
            if (!item.amount || isNaN(Number(item.amount)) || Number(item.amount) < 1) {
              errors[`tipMenu.${i}.amount`] = 'Amount must be at least 1';
            }
            if (item.action && item.action.length > 100) {
              errors[`tipMenu.${i}.action`] = 'Action description cannot exceed 100 characters';
            }
          }
        }
      }

      if (Object.keys(errors).length > 0) {
        return res.status(400).json({ success: false, errors });
      }

      if (perMinuteRate !== undefined) {
        profile.pricePerMinute = Number(perMinuteRate);
        profile.videoCallPrice = Number(perMinuteRate);
      }
      if (tonightRate !== undefined) {
        profile.tonightRate = Number(tonightRate);
      }
      if (tipMenu !== undefined) {
        profile.tipMenu = tipMenu;
      }
    }

    else if (stepNumber === 5) {
      const { country, state, city, coverageArea } = req.body;
      if (!country || !country.code || !country.name) {
        errors['location.country'] = 'Country is required';
      }
      if (!state || !state.name) {
        errors['location.state'] = 'State is required';
      }
      if (!city || !city.name) {
        errors['location.city'] = 'City is required';
      }
      if (coverageArea && !['city', 'state', 'anywhere'].includes(coverageArea)) {
        errors.coverageArea = 'Invalid coverage area';
      }

      if (Object.keys(errors).length > 0) {
        return res.status(400).json({ success: false, errors });
      }

      profile.location = {
        country,
        state,
        city: {
          name: city.name,
          lat: city.lat || 0,
          lng: city.lng || 0
        }
      };
      profile.coverageArea = coverageArea || 'city';
      if (country && country.name) {
        user.country = country.name;
      }

      // Geocode and save coordinates
      const geo = await geocodeLocation(city.name, state.name, country.name);
      if (geo) {
        profile.location.coordinates = {
          type: 'Point',
          coordinates: geo.coordinates
        };
        profile.location.city.lat = geo.lat;
        profile.location.city.lng = geo.lng;
      }
    }

    else if (stepNumber === 6) {
      const { payoutMethod, bankDetails, paypalEmail, crypto } = req.body;
      const allowedMethods = ['bank', 'paypal', 'crypto', 'pending'];

      const method = payoutMethod === 'pending' || !payoutMethod ? 'pending' : payoutMethod;

      if (!allowedMethods.includes(method)) {
        errors.payoutMethod = 'Invalid payout method';
      }

      if (method === 'bank') {
        if (!bankDetails) {
          errors.bankDetails = 'Bank details are required';
        } else {
          if (!bankDetails.bankName) errors['bankDetails.bankName'] = 'Bank name is required';
          if (!bankDetails.accountHolder) errors['bankDetails.accountHolder'] = 'Account holder is required';
          if (!bankDetails.accountNumber) errors['bankDetails.accountNumber'] = 'Account number is required';
          if (!bankDetails.routingNumber) errors['bankDetails.routingNumber'] = 'Routing number is required';
          if (!bankDetails.accountType || !['checking', 'savings'].includes(bankDetails.accountType.toLowerCase())) {
            errors['bankDetails.accountType'] = 'Account type must be checking or savings';
          }
        }
      } else if (method === 'paypal') {
        if (!paypalEmail) {
          errors.paypalEmail = 'PayPal email is required';
        } else {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(paypalEmail)) {
            errors.paypalEmail = 'Invalid PayPal email format';
          }
        }
      } else if (method === 'crypto') {
        if (!crypto) {
          errors.crypto = 'Crypto details are required';
        } else {
          if (!crypto.currency || !['BTC', 'USDT', 'ETH'].includes(crypto.currency)) {
            errors['crypto.currency'] = 'Currency must be BTC, USDT, or ETH';
          }
          if (!crypto.address || crypto.address.length < 20) {
            errors['crypto.address'] = 'Wallet address is required and must be at least 20 characters';
          }
        }
      }

      if (Object.keys(errors).length > 0) {
        return res.status(400).json({ success: false, errors });
      }

      let payoutDetails: any = {};
      if (method === 'bank') payoutDetails = bankDetails;
      else if (method === 'paypal') payoutDetails = { paypalEmail };
      else if (method === 'crypto') payoutDetails = crypto;

      profile.payoutInfo = {
        method,
        details: payoutDetails,
      };
    }

    if (!profile.onboarding.completedSteps.includes(stepNumber)) {
      profile.onboarding.completedSteps.push(stepNumber);
    }

    if (stepNumber === 6) {
      profile.onboarding.currentStep = 7;
      profile.onboarding.isComplete = true;
      profile.onboarding.completedAt = new Date();
      user.status = 'active';
      user.isVerified = true;
    } else {
      profile.onboarding.currentStep = stepNumber + 1;
    }

    user.markModified('providerProfile');
    user.markModified('providerProfile.onboarding');
    await user.save();

    return res.json({
      success: true,
      currentStep: profile.onboarding.currentStep,
      completedSteps: profile.onboarding.completedSteps,
      isComplete: profile.onboarding.isComplete,
      data: {
        success: true,
        currentStep: profile.onboarding.currentStep,
        completedSteps: profile.onboarding.completedSteps,
        isComplete: profile.onboarding.isComplete,
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getProviderEarnings = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user || user.role !== 'provider') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only providers can view earnings' } });
    }

    const { dateRange = 'This Month' } = req.query;

    // 1. Calculate unified balance breakdown
    const breakdown = await calculateProviderBalanceBreakdown(user._id);

    // 2. Fetch all transactions for this user
    const transactions = await CreditTransaction.find({ userId: user._id })
      .populate('relatedUserId', 'username displayName')
      .sort({ createdAt: -1 });

    // 3. Filter transactions based on dateRange if specified
    const startDate = getDateRangeBounds(dateRange as string);
    let filteredTransactions = transactions;
    if (startDate) {
      filteredTransactions = transactions.filter(tx => new Date(tx.createdAt) >= startDate);
    }

    const rate = breakdown.rate;

    // Lifetime metrics for financial summary cards
    const totalEarned = breakdown.totalAccumulatedCredits;
    const grossEarned = breakdown.grossEarnedCredits;
    const platformFee = breakdown.platformFeeCredits;

    // 5. Calculate Earnings Timeline (last 6 days) using completed earning transactions
    const timeline: any[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      timeline.push({
        dayName: d.toLocaleDateString('en-US', { weekday: 'short' }), // e.g. "Mon"
        dateString: d.toDateString(),
        credits: 0
      });
    }

    // Populate timeline with positive earnings transactions matching PROVIDER_EARNING_TYPES
    transactions.forEach(tx => {
      if (tx.status === 'completed' && PROVIDER_EARNING_TYPES.includes(tx.type)) {
        const txDateStr = new Date(tx.createdAt).toDateString();
        const dayObj = timeline.find(t => t.dateString === txDateStr);
        if (dayObj) {
          dayObj.credits += tx.amount;
        }
      }
    });

    // 6. Format transactions list for response
    const formattedTransactions = filteredTransactions.map(tx => {
      const txDate = new Date(tx.createdAt);
      const dateLabel = txDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      // Determine Type label
      let typeLabel = tx.type.charAt(0).toUpperCase() + tx.type.slice(1);
      if (tx.type === 'tip') typeLabel = 'Tip';
      else if (tx.type === 'payout') typeLabel = 'Payout';
      else if (tx.status === 'reverted' || REVERT_TYPES.includes(tx.type) || ((tx.type as string) === 'call_refund' && tx.amount < 0)) typeLabel = 'Revert';

      // Determine From/Method label
      let fromLabel = 'Anonymous';
      if (tx.type === 'payout') {
        fromLabel = user.providerProfile?.payoutInfo?.method || 'Bank Transfer';
        if (fromLabel === 'bank') fromLabel = 'Bank Transfer';
        else if (fromLabel === 'crypto') fromLabel = 'Crypto';
        else if (fromLabel === 'check') fromLabel = 'Check';
      } else if (tx.relatedUserId) {
        const relatedUser = tx.relatedUserId as any;
        fromLabel = relatedUser.displayName || relatedUser.username || 'Anonymous';
      }

      // Determine display status
      let displayStatus = tx.status === 'completed' ? 'Completed' : tx.status.charAt(0).toUpperCase() + tx.status.slice(1);
      if (tx.status === 'reverted') {
        displayStatus = 'Reverted';
      } else if (tx.type === 'service_payment_received' && tx.eligibleForPayout === false && !tx.inDispute && tx.status === 'completed') {
        displayStatus = 'Pending';
      } else if (tx.inDispute) {
        displayStatus = 'Disputed';
      }

      return {
        id: tx._id,
        date: dateLabel,
        type: typeLabel,
        from: fromLabel,
        amount: tx.amount,
        platformFee: tx.platformFee || 0,
        naira: Math.abs(tx.amount) * rate * (tx.amount < 0 ? -1 : 1),
        usd: Math.abs(tx.amount) * 0.0075 * (tx.amount < 0 ? -1 : 1),
        status: displayStatus,
        eligibleForPayout: tx.eligibleForPayout,
      };
    });

    return res.json({
      success: true,
      data: {
        totalEarned,
        grossEarned,
        platformFee,
        paidOut: breakdown.paidOutNaira,
        pending: breakdown.displayedUnsettledNaira,
        withdrawable: breakdown.withdrawableNaira,
        unsettled: breakdown.displayedUnsettledNaira,
        unsettledCredits: breakdown.displayedUnsettledCredits,
        normalUnsettledCredits: breakdown.unsettledCredits,
        normalUnsettledNaira: breakdown.unsettledNaira,
        disputedCredits: breakdown.disputedCredits,
        disputedNaira: breakdown.disputedNaira,
        displayedUnsettledCredits: breakdown.displayedUnsettledCredits,
        displayedUnsettledNaira: breakdown.displayedUnsettledNaira,
        withdrawableCredits: breakdown.withdrawableCredits,
        earningsToBeClaimedCredits: breakdown.earningsToBeClaimedCredits,
        earningsToBeClaimedNaira: breakdown.earningsToBeClaimedNaira,
        timeline,
        transactions: formattedTransactions
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const requestPayout = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user || user.role !== 'provider') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only providers can request payout' } });
    }

    // 1. Calculate pending credits
    const transactions = await CreditTransaction.find({ userId: user._id, status: 'completed' });
    const totalEarned = user.providerProfile?.totalEarnings || 0;
    const payoutTxs = transactions.filter(tx => tx.type === 'payout');
    const paidOutCredits = payoutTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const pendingCredits = Math.max(0, totalEarned - paidOutCredits);

    const rate = await getDiamondNairaRate();
    const pendingNaira = pendingCredits * rate;

    if (pendingCredits < 500) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: `Minimum payout threshold is 500 diamonds (≈ ₦${(500 * rate).toLocaleString('en-NG')})` } });
    }

    // 2. Check user has enough credits to withdraw (user.credits)
    const payoutAmountCredits = Math.min(pendingCredits, user.credits);

    if (payoutAmountCredits <= 0) {
      return res.status(400).json({ success: false, error: { code: 'INSUFFICIENT_CREDITS', message: 'No withdrawable credit balance remaining in your wallet' } });
    }

    // 3. Perform payout deduction and transaction creation
    user.credits -= payoutAmountCredits;
    if (user.providerProfile) {
      user.providerProfile.pendingPayout = 0; // Reset pending payout field if any
    }
    await user.save();

    const payoutTx = await CreditTransaction.create({
      userId: user._id,
      type: 'payout',
      amount: -payoutAmountCredits,
      usdAmount: -(payoutAmountCredits * 0.0075),
      nairaAmount: -(payoutAmountCredits * rate),
      description: 'Payout to configured coordinates',
      status: 'completed'
    });

    return res.json({
      success: true,
      message: 'Payout request successfully completed',
      data: {
        transaction: payoutTx,
        newBalance: user.credits
      }
    });
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

    const timeRegex = /^(0?[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/;
    for (const sch of schedule) {
      if (sch.active) {
        if (!sch.start || !timeRegex.test(sch.start)) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: `Invalid start time format for ${sch.day}. Please use HH:MM format (e.g., 12:00 to 23:59). Entered: "${sch.start || ''}"`
            }
          });
        }
        if (!sch.end || !timeRegex.test(sch.end)) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: `Invalid end time format for ${sch.day}. Please use HH:MM format (e.g., 12:00 to 23:59). Entered: "${sch.end || ''}"`
            }
          });
        }
      }
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

    // 1. Calculate Earnings (Today, Week, Month) from Completed CreditTransactions using canonical PROVIDER_EARNING_TYPES
    const now = new Date();
    const startOfToday = getDateRangeBounds('Today')!;
    const startOfWeek = getDateRangeBounds('This Week')!;
    const startOfMonth = getDateRangeBounds('This Month')!;

    const minDate = new Date(Math.min(startOfToday.getTime(), startOfWeek.getTime(), startOfMonth.getTime()));

    const txs = await CreditTransaction.find({
      userId: user._id,
      type: { $in: PROVIDER_EARNING_TYPES },
      status: 'completed',
      createdAt: { $gte: minDate }
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

    // 3. Fetch real recent sessions from CamSession using .lean()
    const recentSessions = await CamSession.find({ providerId: user._id })
      .sort({ startedAt: -1 })
      .limit(5)
      .lean();

    const formattedSessions = recentSessions.map((session: any) => {
      let dateLabel = 'Recent Show';
      if (session.startedAt) {
        const startedAtDate = new Date(session.startedAt);
        const diffMs = now.getTime() - startedAtDate.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays === 0) {
          dateLabel = 'Today';
        } else if (diffDays === 1) {
          dateLabel = 'Yesterday';
        } else {
          dateLabel = `${diffDays} days ago`;
        }

        const startHours = startedAtDate.getHours();
        const startMinutes = startedAtDate.getMinutes();
        const startAmpm = startHours >= 12 ? 'PM' : 'AM';
        const startDisplayHours = startHours % 12 === 0 ? 12 : startHours % 12;
        const startDisplayMinutes = startMinutes > 0 ? `:${startMinutes}` : '';
        dateLabel += ` ${startDisplayHours}${startDisplayMinutes}${startAmpm}`;

        if (session.endedAt) {
          const endedAtDate = new Date(session.endedAt);
          const endHours = endedAtDate.getHours();
          const endMinutes = endedAtDate.getMinutes();
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
    // ⚡ OPTIMIZATION: Eliminate N+1 database queries by batching user profile lookups
    // and using .lean() for unhydrated read queries.
    const recentDbMessages = await AdultMessage.find({
      $or: [{ senderId: user._id }, { receiverId: user._id }]
    })
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

    const otherUserIds = [...new Set(
      recentDbMessages
        .map(msg => msg.senderId.toString() === user._id.toString() ? msg.receiverId : msg.senderId)
        .filter(Boolean)
        .map(id => id!.toString())
    )];

    const otherUsers = otherUserIds.length > 0
      ? await AdultUser.find({ _id: { $in: otherUserIds } })
          .select('displayName providerProfile')
          .lean()
      : [];

    const userMap = new Map(otherUsers.map((u: any) => [u._id.toString(), u]));

    const formattedMessages = [];
    for (const msg of recentDbMessages) {
      const otherUserId = msg.senderId.toString() === user._id.toString() ? msg.receiverId : msg.senderId;
      if (!otherUserId) continue;
      const otherUser: any = userMap.get(otherUserId.toString());

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
      const msgCreatedAt = msg.createdAt ? new Date(msg.createdAt) : new Date();
      const diffMs = now.getTime() - msgCreatedAt.getTime();
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

    if (user.role === 'provider') {
      let isChanged = false;
      if (!user.providerProfile) {
        user.providerProfile = getDefaultProviderProfile({
          stageName: user.displayName || user.username || 'Stage Name'
        }) as any;
        isChanged = true;
      } else {
        if (!user.providerProfile.stageName) {
          user.providerProfile.stageName = user.displayName || user.username || 'Stage Name';
          isChanged = true;
        }
        if (!user.providerProfile.schedule || user.providerProfile.schedule.length === 0) {
          user.providerProfile.schedule = getDefaultProviderProfile().schedule;
          isChanged = true;
        }
        if (!user.providerProfile.photos) {
          user.providerProfile.photos = [];
          isChanged = true;
        }
        if (!user.providerProfile.servicesOffered) {
          user.providerProfile.servicesOffered = [];
          isChanged = true;
        }
        if (user.providerProfile.tonightRate === undefined || user.providerProfile.tonightRate === null) {
          user.providerProfile.tonightRate = 300;
          isChanged = true;
        }
      }

      if (isChanged) {
        await user.save();
      }
    }

    return res.json({ success: true, data: { user } });
  } catch (error: any) {
    console.error('Error in getMyProfile:', error);
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

    if (gender !== undefined) {
      user.providerProfile!.gender = gender;
    }

    await user.save();

    return res.json({ success: true, message: 'Profile updated successfully', data: { user } });
  } catch (error: any) {
    if (error.name === 'ValidationError' && error.errors) {
      const firstErrKey = Object.keys(error.errors)[0];
      const msg = error.errors[firstErrKey]?.message || error.message;
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: msg } });
    }
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

    if (perMinuteRate !== undefined && perMinuteRate < 0) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Minimum per-minute rate is 0 diamonds' } });
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

    user.providerProfile!.location = {
      country,
      state,
      city: {
        name: city.name,
        lat: city.lat || 0,
        lng: city.lng || 0
      }
    };
    // Also sync to main user country field if necessary as a string
    if (country && country.name) {
      user.country = country.name;
    }

    // Geocode and save coordinates
    const geo = await geocodeLocation(city.name, state.name, country.name);
    if (geo) {
      user.providerProfile!.location!.coordinates = {
        type: 'Point',
        coordinates: geo.coordinates
      };
      user.providerProfile!.location!.city!.lat = geo.lat;
      user.providerProfile!.location!.city!.lng = geo.lng;
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
