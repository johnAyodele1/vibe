import { Schema, Document, Types, Model } from 'mongoose';

export interface IAdultPhoto {
  url: string;
  publicId: string | null;
  isMain: boolean;
  order: number;
  uploadedAt: Date;
}

export interface ILoginHistory {
  ip: string;
  userAgent: string;
  timestamp: Date;
  success: boolean;
}

export interface IAdultUser extends Document {
  email: string;
  passwordHash: string;
  role: 'user' | 'provider';
  username: string;
  displayName: string;
  ageVerified: boolean;
  ageVerifiedAt?: Date;
  dateOfBirth: Date;
  country: string;
  location?: {
    country?: { code: string; name: string };
    state?: { code: string; name: string };
    city?: { name: string; lat: number; lng: number };
    coordinates?: {
      type: string;
      coordinates: number[];
    };
  };
  profilePhoto?: string;
  bio?: string;
  credits: number;
  subscriptionTier: 'none' | 'gold' | 'platinum' | 'diamond';
  subscriptionExpiresAt?: Date;
  isActive: boolean;
  isBanned: boolean;
  banReason?: string;
  isOnline?: boolean;
  onlineSince?: Date | null;
  twoFactorEnabled: boolean;
  twoFactorSecret?: string;
  emailVerified: boolean;
  emailVerificationToken?: string;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  loginHistory: ILoginHistory[];
  status?: string;
  isVerified?: boolean;
  providerProfile?: {
    stageName: string;
    gender?: string;
    categories: string[];
    isLive: boolean;
    isOnline?: boolean;
    onlineSince?: Date | null;
    pricePerMinute: number;
    tipMinimum: number;
    videoCallPrice?: number;
    audioCallPrice?: number;
    privateSextPrice?: number;
    totalEarnings: number;
    pendingPayout: number;
    verificationStatus: 'pending' | 'approved' | 'rejected';
    idVerificationDocUrl?: string;
    contentTags: string[];
    rating: {
      average: number;
      count: number;
    };
    tonightRate?: number;
    tipMenu?: Array<{ amount: number; action: string }>;
    payoutInfo?: { method: string; details: any };
    photos?: string[];
    videoPreview?: string;
    servicesOffered?: string[];
    coverageArea?: string;
    location?: {
      country?: { code: string; name: string };
      state?: { code: string; name: string };
      city?: { name: string; lat: number; lng: number };
      coordinates?: {
        type: string;
        coordinates: number[];
      };
    };
    profileViews?: number;
    activeSubs?: number;
    schedule?: Array<{ day: string; active: boolean; start: string; end: string }>;
    onboarding?: {
      currentStep: number;
      completedSteps: number[];
      isComplete: boolean;
      completedAt: Date | null;
    };
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface IAdultUserModel extends Model<IAdultUser> {}

export interface ICreditTransaction extends Document {
  userId: Types.ObjectId;
  type: 'purchase' | 'spend' | 'refund' | 'tip_sent' | 'tip_received' | 'cam_tip' | 'payout' | 'bonus' | 'tip' | 'subscription' | 'reward' | 'call_charge' | 'call_earning' | 'service_payment_received' | 'service_payment_sent' | 'paid_media_unlock' | 'spin_wheel';
  amount: number;
  usdAmount: number;
  nairaAmount?: number;
  description: string;
  relatedUserId?: Types.ObjectId;
  paymentProvider?: 'stripe' | 'apple' | 'google' | 'crypto';
  paymentIntentId?: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  platformFee?: number;
  eligibleForPayout?: boolean;
  paidOut?: boolean;
  inPayoutRequest?: Types.ObjectId;
  inDispute?: boolean;
  disputeReason?: string;
  disputeResolvedAt?: Date;
  disputeResolution?: 'upheld' | 'dismissed';
  metadata?: any;
  createdAt: Date;
}

export interface IRoom extends Document {
  name: string;
  description: string;
  category: string;
  createdBy: Types.ObjectId;
  isActive: boolean;
  activeUsers: {
    userId: Types.ObjectId;
    joinedAt: Date;
  }[];
  maxUsers: number;
  isExplicit: boolean;
  mood: 'chill' | 'wild' | 'explicit';
  tags: string[];
  isPinned: boolean;
  messageCount: number;
  coverGradient: string[];
  icon: string;
  rules: string[];
  requiresSubscription: boolean;
  memberCount: number;
  moderators: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IAdultThread extends Document {
  roomId: Types.ObjectId;
  authorId: Types.ObjectId;
  authorName: string;
  authorAvatarUrl?: string;
  title: string;
  body: string;
  mediaUrl?: string;
  replyCount: number;
  viewCount: number;
  reactionCounts: {
    [key: string]: number;
  };
  reactions: {
    userId: Types.ObjectId;
    emoji: string;
  }[];
  isPinned: boolean;
  isLocked: boolean;
  lastReplyAt?: Date;
  lastReplyAuthor?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IReaction {
  emoji: string;
  userIds: Types.ObjectId[];
  count: number;
}

export interface IAdultRoomMessage extends Document {
  roomId: Types.ObjectId;
  threadId?: Types.ObjectId | null;
  senderId: Types.ObjectId;
  senderName: string;
  senderAvatarUrl?: string;
  senderBadge?: string | null;
  content: string;
  mediaUrl?: string | null;
  mediaType?: 'image' | 'gif' | 'audio' | null;
  isExplicit: boolean;
  replyToMessageId?: Types.ObjectId | null;
  reactions: IReaction[];
  isPinned: boolean;
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IRoomMembership extends Document {
  roomId: Types.ObjectId;
  userId: Types.ObjectId;
  role: 'member' | 'moderator' | 'admin';
  joinedAt: Date;
  lastSeenAt: Date;
  messageCount: number;
  tipsReceived: number;
  mutedUntil?: Date | null;
}

export interface IPollOption {
  id: string;
  text: string;
  voteCount: number;
}

export interface IAdultRoomPoll extends Document {
  roomId: Types.ObjectId;
  createdBy: Types.ObjectId;
  question: string;
  options: IPollOption[];
  voterIds: Types.ObjectId[];
  expiresAt: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMessage extends Document {
  conversationId: string;
  senderId: Types.ObjectId;
  receiverId?: Types.ObjectId;
  content: string;
  messageType: string; // support expanded types: text, image, video, audio, voice_note, gift, locked_image, locked_video, request_photo, system
  mediaUrl?: string;
  cloudinaryPublicId?: string;
  mediaThumbnailUrl?: string;
  mediaDurationSeconds?: number;
  mediaFileSizeBytes?: number;
  mediaMimeType?: string;
  isLocked?: boolean;
  creditCost?: number;
  mediaBlurred: boolean;
  unlockCost: number;
  unlockedBy: Types.ObjectId[];
  gift?: {
    giftId: string;
    giftName: string;
    giftIconUrl: string;
    giftValue: number;
    message?: string;
  };
  giftRequest?: {
    giftId: string;
    giftName: string;
    giftIconUrl: string;
    giftValue: number;
    message?: string;
    status: 'pending' | 'fulfilled' | 'different_sent' | 'dismissed';
    fulfilledGiftId?: string;
    fulfilledGiftName?: string;
    fulfilledAt?: string;
  };
  serviceRequest?: {
    baseRate: number;
    extras: { label: string; amount: number }[];
    totalAmount: number;
    note?: string;
    status: 'pending' | 'paid' | 'completed' | 'auto_completed' | 'reported';
    paidAt?: string;
    completedAt?: string;
    reportedAt?: string;
    eligibleForPayout: boolean;
  };
  photoRequest?: {
    status: 'pending' | 'fulfilled' | 'declined';
    note?: string;
    fulfilledMessageId?: Types.ObjectId | null;
  };
  serviceTonightRequest?: {
    status: 'pending' | 'fulfilled' | 'declined';
    note?: string;
    fulfilledMessageId?: Types.ObjectId | null;
  };
  systemText?: string;
  reactions: {
    userId: Types.ObjectId;
    emoji: string;
    reactedAt?: Date;
  }[];
  isRead: boolean;
  readAt?: Date;
  deliveredAt?: Date | null;
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: Types.ObjectId[];
  reportedBy?: Types.ObjectId[];
  isFlagged?: boolean;
  flagReason?: string;
  flaggedText?: string;
  createdAt: Date;
}

export interface ICamSession extends Document {
  providerId: Types.ObjectId;
  sessionType: 'public' | 'private' | 'vip_only' | 'premium_only';
  status: 'scheduled' | 'live' | 'ended' | 'interrupted';
  streamKey: string;
  streamPlaybackUrl: string;
  thumbnailUrl?: string;
  previewGifUrl?: string;
  startedAt?: Date;
  endedAt?: Date;
  durationSeconds: number;
  peakViewerCount: number;
  totalViewerCount: number;
  totalTipsReceived: number;
  totalTipsUsdValue: number;
  privateShowRate: number;
  tags: string[];
  title: string;
  resolution: '720p' | '1080p' | '4K';
  isHD: boolean;
  isInteractive: boolean;
  chatEnabled: boolean;
  recordingEnabled: boolean;
  recordingUrl?: string;
  reportCount: number;
  isFlagged: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICamViewer extends Document {
  sessionId: Types.ObjectId;
  userId: Types.ObjectId;
  joinedAt: Date;
  leftAt?: Date;
  totalWatchSeconds: number;
  totalTipped: number;
  isInPrivateShow: boolean;
  privateShowStartedAt?: Date;
  privateShowEndedAt?: Date;
  privateShowCreditsSpent: number;
  deviceType: 'desktop' | 'mobile' | 'tablet';
  connectionQuality: 'low' | 'medium' | 'high';
}

export interface ICamTip extends Document {
  sessionId: Types.ObjectId;
  senderId: Types.ObjectId;
  providerId: Types.ObjectId;
  amount: number;
  message?: string;
  isAnonymous: boolean;
  triggeredGoal: boolean;
  goalId?: string;
  createdAt: Date;
}

export interface ICamGoal extends Document {
  sessionId: Types.ObjectId;
  providerId: Types.ObjectId;
  title: string;
  targetCredits: number;
  currentCredits: number;
  isCompleted: boolean;
  completedAt?: Date;
  isActive: boolean;
  createdAt: Date;
}

export interface IPrivateShowRequest extends Document {
  sessionId: Types.ObjectId;
  requesterId: Types.ObjectId;
  providerId: Types.ObjectId;
  status: 'pending' | 'accepted' | 'rejected' | 'ended' | 'expired';
  creditsPerMinute: number;
  totalCreditsSpent: number;
  startedAt?: Date;
  endedAt?: Date;
  privateStreamKey?: string;
  privatePlaybackUrl?: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface IProviderEarnings extends Document {
  providerId: Types.ObjectId;
  period: string;
  totalTipsCredits: number;
  totalPrivateShowCredits: number;
  totalCreditsEarned: number;
  platformFeePercent: number;
  netCreditsAfterFee: number;
  usdEquivalent: number;
  payoutStatus: 'pending' | 'processing' | 'paid' | 'failed';
  payoutMethod: 'bank' | 'crypto' | 'check';
  payoutReference?: string;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
