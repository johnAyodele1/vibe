import mongoose, { Schema } from 'mongoose';
import bcrypt from 'bcryptjs';
import { IAdultUser, IAdultUserModel } from '../types/adultModels';

const adultUserSchema = new Schema<IAdultUser, IAdultUserModel>(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      required: true,
      enum: ['user', 'provider'],
      default: 'user',
    },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    ageVerified: {
      type: Boolean,
      default: false,
    },
    ageVerifiedAt: {
      type: Date,
    },
    dateOfBirth: {
      type: Date,
      required: true,
    },
    country: {
      type: String,
      required: true,
    },
    location: {
      country: {
        code: String,
        name: String,
      },
      state: {
        code: String,
        name: String,
      },
      city: {
        name: String,
        lat: Number,
        lng: Number,
      },
      coordinates: {
        type: { type: String, default: 'Point' },
        coordinates: { type: [Number], default: [0, 0] }
      }
    },
    profilePhoto: String,
    bio: {
      type: String,
      maxlength: 500,
    },
    credits: {
      type: Number,
      default: 0,
    },
    subscriptionTier: {
      type: String,
      enum: ['none', 'gold', 'platinum', 'diamond'],
      default: 'none',
    },
    subscriptionExpiresAt: Date,
    isActive: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: ['pending', 'active', 'inactive'],
      default: 'pending',
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    onlineSince: {
      type: Date,
      default: null,
    },
    isBanned: {
      type: Boolean,
      default: false,
    },
    banReason: String,
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    twoFactorSecret: String,
    emailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: String,
    passwordResetToken: String,
    passwordResetExpires: Date,
    loginHistory: [
      {
        ip: String,
        userAgent: String,
        timestamp: { type: Date, default: Date.now },
        success: Boolean,
      },
    ],
    providerProfile: {
      stageName: String,
      gender: String,
      categories: [String],
      isLive: { type: Boolean, default: false },
      isOnline: { type: Boolean, default: false },
      onlineSince: { type: Date, default: null },
      pricePerMinute: { type: Number, default: 0 },
      tipMinimum: { type: Number, default: 0 },
      videoCallPrice: { type: Number, default: 0 },
      audioCallPrice: { type: Number, default: 0 },
      privateSextPrice: { type: Number, default: 0 },
      totalEarnings: { type: Number, default: 0 },
      pendingPayout: { type: Number, default: 0 },
      totalResponseCount: { type: Number, default: 0 },
      totalResponseMinutes: { type: Number, default: 0 },
      verificationStatus: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending',
      },
      idVerificationDocUrl: String,
      contentTags: [String],
      rating: {
        average: { type: Number, default: 0 },
        count: { type: Number, default: 0 },
      },
      tonightRate: Number,
      tipMenu: [
        {
          amount: Number,
          action: String,
        }
      ],
      payoutInfo: {
        method: String,
        details: Schema.Types.Mixed,
      },
      photos: [String],
      videoPreview: String,
      servicesOffered: [String],
      coverageArea: { type: String, default: 'city' },
      location: {
        country: {
          code: String,
          name: String,
        },
        state: {
          code: String,
          name: String,
        },
        city: {
          name: String,
          lat: Number,
          lng: Number,
        },
        coordinates: {
          type: { type: String, default: 'Point' },
          coordinates: { type: [Number], default: [0, 0] }
        }
      },
      profileViews: { type: Number, default: 0 },
      activeSubs: { type: Number, default: 0 },
      onboarding: {
        currentStep: { type: Number, default: 1, min: 1, max: 7 },
        completedSteps: { type: [Number], default: [] },
        isComplete: { type: Boolean, default: false },
        completedAt: { type: Date, default: null },
      },
      schedule: {
        type: [
          {
            day: String,
            active: { type: Boolean, default: true },
            start: { type: String, default: '12:00' },
            end: { type: String, default: '23:59' },
          }
        ],
        default: [
          { day: 'Monday', active: true, start: '12:00', end: '23:59' },
          { day: 'Tuesday', active: true, start: '12:00', end: '23:59' },
          { day: 'Wednesday', active: true, start: '12:00', end: '23:59' },
          { day: 'Thursday', active: true, start: '12:00', end: '23:59' },
          { day: 'Friday', active: true, start: '12:00', end: '23:59' },
          { day: 'Saturday', active: true, start: '12:00', end: '23:59' },
          { day: 'Sunday', active: true, start: '12:00', end: '23:59' }
        ]
      }
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save hook for password hashing is handled in controller or here
// Given the requirement "Hash password with bcrypt (12 rounds)"
adultUserSchema.pre<IAdultUser>('save', async function (next) {
  if (!this.isModified('passwordHash')) return next();
  try {
    const salt = await bcrypt.genSalt(12);
    this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
    next();
  } catch (error: any) {
    next(error);
  }
});

// Limit login history to 10
adultUserSchema.pre<IAdultUser>('save', function (next) {
  if (this.loginHistory.length > 10) {
    this.loginHistory = this.loginHistory.slice(-10);
  }
  next();
});

export const AdultUser = mongoose.model<IAdultUser, IAdultUserModel>('AdultUser', adultUserSchema);
export default AdultUser;
