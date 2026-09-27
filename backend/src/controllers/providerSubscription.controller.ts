import { Request, Response } from 'express';
import mongoose from 'mongoose';
import AdultUser from '../models/AdultUser';
import ProviderSubscription from '../models/ProviderSubscription';
import { sendPushToUser } from '../shared/push';

const getAuthenticatedUserId = (req: Request): mongoose.Types.ObjectId | null => {
  const userId = req.adultUser?._id;
  return userId ? new mongoose.Types.ObjectId(userId) : null;
};

const validateProvider = async (providerId: string) => {
  if (!mongoose.Types.ObjectId.isValid(providerId)) return null;

  return AdultUser.findOne({
    _id: providerId,
    role: 'provider',
    status: 'active',
    'providerProfile.onboarding.isComplete': true,
    isVerified: true,
  })
    .select('_id displayName username providerProfile.stageName profilePhoto')
    .lean();
};

export const getProviderSubscription = async (req: Request, res: Response) => {
  try {
    const subscriberId = getAuthenticatedUserId(req);
    if (!subscriberId) return res.status(401).json({ success: false, message: 'Authentication required' });

    const providerId = String(req.params.providerId);
    const provider = await validateProvider(providerId);
    if (!provider) return res.status(404).json({ success: false, message: 'Provider not found' });

    const subscription = await ProviderSubscription.findOne({
      providerId: provider._id,
      subscriberId,
      isActive: true,
    }).select('_id createdAt').lean();

    return res.json({
      success: true,
      data: {
        isFollowing: Boolean(subscription),
        subscriptionId: subscription?._id ?? null,
      },
    });
  } catch (error: any) {
    console.error('[ProviderSubscription] Status failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to load subscription status' });
  }
};

export const followProvider = async (req: Request, res: Response) => {
  try {
    const subscriberId = getAuthenticatedUserId(req);
    if (!subscriberId) return res.status(401).json({ success: false, message: 'Authentication required' });

    const providerId = String(req.params.providerId);
    const provider = await validateProvider(providerId);
    if (!provider) return res.status(404).json({ success: false, message: 'Provider not found' });

    if (provider._id.toString() === subscriberId.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot follow yourself' });
    }

    const subscription = await ProviderSubscription.findOneAndUpdate(
      { providerId: provider._id, subscriberId },
      {
        $set: { isActive: true },
        $setOnInsert: { providerId: provider._id, subscriberId },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).select('_id createdAt').lean();

    return res.status(200).json({
      success: true,
      data: { isFollowing: true, subscriptionId: subscription?._id ?? null },
    });
  } catch (error: any) {
    console.error('[ProviderSubscription] Follow failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to follow provider' });
  }
};

export const unfollowProvider = async (req: Request, res: Response) => {
  try {
    const subscriberId = getAuthenticatedUserId(req);
    if (!subscriberId) return res.status(401).json({ success: false, message: 'Authentication required' });

    const providerId = String(req.params.providerId);
    if (!mongoose.Types.ObjectId.isValid(providerId)) {
      return res.status(400).json({ success: false, message: 'Invalid provider ID' });
    }

    await ProviderSubscription.updateOne(
      { providerId, subscriberId },
      { $set: { isActive: false } },
    );

    return res.json({ success: true, data: { isFollowing: false } });
  } catch (error: any) {
    console.error('[ProviderSubscription] Unfollow failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to unfollow provider' });
  }
};

export const getProviderSubscriberStats = async (req: Request, res: Response) => {
  try {
    const providerId = getAuthenticatedUserId(req);
    if (!providerId) return res.status(401).json({ success: false, message: 'Authentication required' });

    const provider = await AdultUser.findOne({ _id: providerId, role: 'provider' }).select('_id').lean();
    if (!provider) return res.status(403).json({ success: false, message: 'Only providers can view subscriber stats' });

    const activeSubs = await ProviderSubscription.countDocuments({
      providerId,
      isActive: true,
    });

    return res.json({ success: true, data: { activeSubs } });
  } catch (error: any) {
    console.error('[ProviderSubscription] Stats failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to load subscriber stats' });
  }
};

const normalizeNotificationText = (value: unknown, maxLength: number) => {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
};

export const notifyProviderSubscribers = async (req: Request, res: Response) => {
  try {
    const providerId = getAuthenticatedUserId(req);
    if (!providerId) return res.status(401).json({ success: false, message: 'Authentication required' });

    const provider = await AdultUser.findOne({ _id: providerId, role: 'provider' })
      .select('_id displayName username providerProfile.stageName profilePhoto')
      .lean();

    if (!provider) return res.status(403).json({ success: false, message: 'Only providers can notify subscribers' });

    const title = normalizeNotificationText(req.body?.title, 80);
    const body = normalizeNotificationText(req.body?.body, 240);

    if (!title || !body) {
      return res.status(400).json({
        success: false,
        message: 'Notification title and message are required',
      });
    }

    const subscriptions = await ProviderSubscription.find({
      providerId,
      isActive: true,
    })
      .select('subscriberId')
      .lean();

    if (!subscriptions.length) {
      return res.status(400).json({
        success: false,
        message: 'You do not have any active subscribers yet',
        data: { subscribers: 0, sent: 0, failed: 0 },
      });
    }

    const providerName =
      provider.providerProfile?.stageName ||
      provider.displayName ||
      provider.username ||
      'A provider';

    const payload = {
      title,
      body,
      icon: provider.profilePhoto || '/icons/icon-192x192.png',
      badge: '/icons/badge-72x72.png',
      tag: `provider_subscriber_${providerId.toString()}`,
      renotify: true,
      url: `/adult/provider/${providerId.toString()}`,
      type: 'provider_subscriber_notification',
      timestamp: Date.now(),
      providerId: providerId.toString(),
      providerName,
    };

    let sent = 0;
    let failed = 0;

    // Keep the fan-out bounded so a provider with many subscribers does not
    // create an unbounded promise set or overload the push provider.
    for (let i = 0; i < subscriptions.length; i += 25) {
      const batch = subscriptions.slice(i, i + 25);
      const results = await Promise.allSettled(
        batch.map(subscription => sendPushToUser(subscription.subscriberId, payload, 'adult')),
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          sent += result.value.sent;
          failed += result.value.failed;
        } else {
          failed += 1;
        }
      }
    }

    return res.json({
      success: true,
      message: sent > 0 ? 'Notification sent to your subscribers' : 'No subscribers currently have an active push device',
      data: {
        subscribers: subscriptions.length,
        sent,
        failed,
      },
    });
  } catch (error: any) {
    console.error('[ProviderSubscription] Subscriber notification failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to notify subscribers' });
  }
};
