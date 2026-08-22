import { Request, Response } from 'express';
import mongoose from 'mongoose';
import AdultMessage from '../models/AdultMessage';
import AdultUser from '../models/AdultUser';
import { getProviderPublicProfile } from './adultProviders.controller';

const CONVERSATIONAL_MESSAGE_TYPES = [
  'text',
  'image',
  'video',
  'audio',
  'voice_note',
  'voice',
  'locked_image',
  'locked_video',
];

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toPositiveInt = (value: unknown, fallback: number, max: number) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
};

const shuffleInPlace = <T>(items: T[]) => {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
};

const responseMetricsLookup = {
  $lookup: {
    from: AdultMessage.collection.name,
    let: { providerId: '$_id' },
    pipeline: [
      {
        $match: {
          $expr: {
            $and: [
              { $eq: ['$receiverId', '$$providerId'] },
              { $ne: ['$repliedAt', null] },
              { $gte: ['$replyTimeMinutes', 0] },
              { $in: ['$messageType', CONVERSATIONAL_MESSAGE_TYPES] },
            ],
          },
        },
      },
      { $sort: { repliedAt: -1 } },
      {
        $group: {
          _id: '$senderId',
          responseTimeMinutes: { $first: '$replyTimeMinutes' },
          respondedAt: { $first: '$repliedAt' },
        },
      },
      { $sort: { respondedAt: -1 } },
      { $limit: 10 },
      {
        $group: {
          _id: null,
          sampleCount: { $sum: 1 },
          totalResponseMinutes: { $sum: '$responseTimeMinutes' },
        },
      },
      {
        $project: {
          _id: 0,
          sampleCount: 1,
          averageResponseMinutes: {
            $divide: ['$totalResponseMinutes', '$sampleCount'],
          },
        },
      },
    ],
    as: 'recentResponseStats',
  },
};

const responseMetricStages = [
  responseMetricsLookup,
  {
    $set: {
      recentResponseCount: {
        $ifNull: [{ $arrayElemAt: ['$recentResponseStats.sampleCount', 0] }, 0],
      },
      recentAverageResponseMinutes: {
        $arrayElemAt: ['$recentResponseStats.averageResponseMinutes', 0],
      },
      legacyAverageResponseMinutes: {
        $cond: [
          { $gt: [{ $ifNull: ['$providerProfile.totalResponseCount', 0] }, 0] },
          {
            $divide: [
              { $ifNull: ['$providerProfile.totalResponseMinutes', 0] },
              '$providerProfile.totalResponseCount',
            ],
          },
          null,
        ],
      },
    },
  },
  {
    $set: {
      effectiveResponseMinutes: {
        $ifNull: ['$recentAverageResponseMinutes', '$legacyAverageResponseMinutes'],
      },
    },
  },
  {
    $set: {
      hasResponseData: { $ne: ['$effectiveResponseMinutes', null] },
    },
  },
  {
    $set: {
      priorityTier: {
        $switch: {
          branches: [
            {
              case: {
                $and: [
                  { $eq: ['$providerProfile.isOnline', true] },
                  { $eq: ['$hasResponseData', true] },
                ],
              },
              then: 1,
            },
            {
              case: {
                $and: [
                  { $eq: ['$providerProfile.isOnline', true] },
                  { $eq: ['$providerProfile.isLive', true] },
                ],
              },
              then: 2,
            },
            {
              case: { $eq: ['$hasResponseData', true] },
              then: 3,
            },
          ],
          default: 4,
        },
      },
    },
  },
];

const getRecentResponseMetrics = async (providerId: string) => {
  if (!mongoose.Types.ObjectId.isValid(providerId)) return null;

  const [result] = await AdultUser.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId(providerId), role: 'provider' } },
    ...responseMetricStages,
    {
      $project: {
        _id: 0,
        recentResponseCount: 1,
        recentAverageResponseMinutes: 1,
        effectiveResponseMinutes: 1,
      },
    },
  ]);

  return result || null;
};

const buildBaseProviderFilter = (req: Request, hookupOnly = false) => {
  const { category, isLive, country, state, city, isOnline } = req.query;

  const filter: Record<string, unknown> = {
    role: 'provider',
    status: 'active',
    'providerProfile.onboarding.isComplete': true,
    isVerified: true,
  };

  if (hookupOnly) filter['providerProfile.servicesOffered'] = 'hookup';
  if (category) filter['providerProfile.categories'] = category;
  if (isLive === 'true') filter['providerProfile.isLive'] = true;
  if (isOnline === 'true') filter['providerProfile.isOnline'] = true;
  if (country) filter['providerProfile.location.country.code'] = country;
  if (state) filter['providerProfile.location.state.code'] = state;
  if (city) {
    filter['providerProfile.location.city.name'] = {
      $regex: new RegExp(`^${escapeRegex(String(city))}$`, 'i'),
    };
  }

  return filter;
};

const buildDiscoveryPipeline = (filter: Record<string, unknown>, page: number, limit: number) => [
  { $match: filter },
  ...responseMetricStages,
  {
    $facet: {
      metadata: [{ $count: 'total' }],
      results: [
        {
          $sort: {
            priorityTier: 1,
            effectiveResponseMinutes: 1,
            'providerProfile.rating.average': -1,
            createdAt: -1,
          },
        },
        { $skip: (page - 1) * limit },
        { $limit: limit },
        {
          $project: {
            _id: 1,
            displayName: 1,
            profilePhoto: 1,
            country: 1,
            dateOfBirth: 1,
            createdAt: 1,
            isVerified: 1,
            providerProfile: 1,
            recentResponseCount: 1,
            recentAverageResponseMinutes: 1,
            effectiveResponseMinutes: 1,
          },
        },
      ],
    },
  },
];

const attachResponseStats = (provider: any) => ({
  ...provider,
  providerProfile: {
    ...(provider.providerProfile || {}),
    recentResponseCount: provider.recentResponseCount || 0,
    recentAverageResponseMinutes: provider.recentAverageResponseMinutes ?? null,
    effectiveResponseMinutes: provider.effectiveResponseMinutes ?? null,
  },
});

export const getRecommendedProviders = async (req: Request, res: Response) => {
  try {
    const limit = toPositiveInt(req.query.limit, 6, 24);
    const page = toPositiveInt(req.query.page, 1, 10000);
    const filter = buildBaseProviderFilter(req, false);

    const [result] = await AdultUser.aggregate(buildDiscoveryPipeline(filter, page, limit));
    const providers = shuffleInPlace((result?.results || []).map(attachResponseStats));
    const total = result?.metadata?.[0]?.total || 0;

    return res.json({
      success: true,
      data: { providers, total, page, pages: Math.ceil(total / limit) },
    });
  } catch (error: any) {
    console.error('Error fetching recommended providers:', error);
    return res.status(500).json({ success: false, error: 'Failed to load provider recommendations' });
  }
};

export const getRecommendedHookupProviders = async (req: Request, res: Response) => {
  try {
    const limit = toPositiveInt(req.query.limit, 12, 48);
    const page = toPositiveInt(req.query.page, 1, 10000);
    const filter = buildBaseProviderFilter(req, true);

    const [result] = await AdultUser.aggregate(buildDiscoveryPipeline(filter, page, limit));
    const providers = shuffleInPlace((result?.results || []).map((provider: any) => {
      const dateOfBirth = provider.dateOfBirth ? new Date(provider.dateOfBirth) : null;
      let age = 18;
      if (dateOfBirth) {
        const now = new Date();
        age = now.getFullYear() - dateOfBirth.getFullYear();
        const monthDelta = now.getMonth() - dateOfBirth.getMonth();
        if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < dateOfBirth.getDate())) age -= 1;
        age = Math.max(age, 18);
      }

      return {
        id: String(provider._id),
        stageName: provider.providerProfile?.stageName || provider.displayName,
        age,
        location: provider.providerProfile?.location,
        isOnline: provider.providerProfile?.isOnline || false,
        isVerified: provider.isVerified || false,
        photoUrl: provider.profilePhoto || provider.providerProfile?.photos?.[0] || '/placeholder.svg',
        avatarUrl: provider.profilePhoto || provider.providerProfile?.photos?.[0] || '/placeholder.svg',
        tonightRate: provider.providerProfile?.tonightRate,
        recentResponseCount: provider.recentResponseCount || 0,
        recentAverageResponseMinutes: provider.recentAverageResponseMinutes ?? null,
        effectiveResponseMinutes: provider.effectiveResponseMinutes ?? null,
      };
    }));

    const total = result?.metadata?.[0]?.total || 0;

    return res.json({
      success: true,
      data: { providers, total, page, pages: Math.ceil(total / limit) },
    });
  } catch (error: any) {
    console.error('Error fetching recommended hookup providers:', error);
    return res.status(500).json({ success: false, error: 'Failed to load hookup recommendations' });
  }
};

export const getProviderResponseStats = async (req: Request, res: Response) => {
  try {
    const { providerId } = req.params;
    if (!providerId || !mongoose.Types.ObjectId.isValid(providerId)) {
      return res.status(400).json({ success: false, error: 'Invalid provider ID' });
    }

    const result = await getRecentResponseMetrics(providerId);
    if (!result) {
      return res.status(404).json({ success: false, error: 'Provider not found' });
    }

    return res.json({
      success: true,
      data: {
        recentResponseCount: result.recentResponseCount || 0,
        recentAverageResponseMinutes: result.recentAverageResponseMinutes ?? null,
        effectiveResponseMinutes: result.effectiveResponseMinutes ?? null,
      },
    });
  } catch (error: any) {
    console.error('Error fetching provider response stats:', error);
    return res.status(500).json({ success: false, error: 'Failed to load response stats' });
  }
};

export const getPublicProviderProfileWithResponseStats = async (req: Request, res: Response) => {
  try {
    const providerId = String(req.params.providerId || '');
    const metrics = await getRecentResponseMetrics(providerId);

    if (metrics?.recentResponseCount > 0 && Number.isFinite(metrics.recentAverageResponseMinutes)) {
      const originalJson = res.json.bind(res);
      res.json = ((body: any) => {
        if (body?.success && body?.data) {
          body.data.totalResponseCount = metrics.recentResponseCount;
          body.data.totalResponseMinutes = metrics.recentAverageResponseMinutes * metrics.recentResponseCount;
        }
        return originalJson(body);
      }) as typeof res.json;
    }

    return getProviderPublicProfile(req, res);
  } catch (error: any) {
    console.error('Error enriching provider public profile response stats:', error);
    return getProviderPublicProfile(req, res);
  }
};
