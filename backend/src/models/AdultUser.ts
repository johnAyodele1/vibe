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
      categories: [String],
      isLive: { type: Boolean, default: false },
      pricePerMinute: { type: Number, default: 0 },
      tipMinimum: { type: Number, default: 0 },
      totalEarnings: { type: Number, default: 0 },
      pendingPayout: { type: Number, default: 0 },
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
