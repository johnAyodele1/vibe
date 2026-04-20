import mongoose, { Schema } from 'mongoose';
import { IUser, IUserModel } from '../types/models';

export const userSchema = new Schema<IUser, IUserModel>(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please enter a valid email',
      ],
    },
    password: {
      type: String,
      required: function (this: IUser) {
        return !this.googleId;
      },
      minlength: [6, 'Password must be at least 6 characters long'],
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      maxlength: [50, 'First name cannot exceed 50 characters'],
    },
    lastName: {
      type: String,
      trim: true,
      maxlength: [50, 'Last name cannot exceed 50 characters'],
    },
    dateOfBirth: {
      type: Date,
      required: function (this: IUser) {
        return !this.googleId;
      },
    },
    gender: {
      type: String,
      required: function (this: IUser) {
        return !this.googleId;
      },
      enum: ['Male', 'Female', 'Non-binary', 'Other'],
    },
    bio: {
      type: String,
      maxlength: [500, 'Bio cannot exceed 500 characters'],
      trim: true,
    },
    photos: [
      {
        url: {
          type: String,
          required: true,
        },
        isMain: {
          type: Boolean,
          default: false,
        },
        order: {
          type: Number,
          default: 0,
        },
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        default: [0, 0], // [longitude, latitude]
      },
      city: String,
      country: String,
    },
    interests: [
      {
        type: String,
        trim: true,
        maxlength: [30, 'Interest cannot exceed 30 characters'],
      },
    ],
    preferences: {
      genderPreference: {
        type: String,
        enum: ['Male', 'Female', 'Everyone'],
        default: 'Everyone',
      },
      ageRange: {
        min: {
          type: Number,
          default: 18,
          min: 18,
          max: 100,
        },
        max: {
          type: Number,
          default: 50,
          min: 18,
          max: 100,
        },
      },
      maxDistance: {
        type: Number,
        default: 50, // km
        min: 1,
        max: 500,
      },
    },
    settings: {
      notifications: {
        matches: { type: Boolean, default: true },
        messages: { type: Boolean, default: true },
        likes: { type: Boolean, default: true },
      },
      privacy: {
        showOnlineStatus: { type: Boolean, default: true },
        showDistance: { type: Boolean, default: true },
        showAge: { type: Boolean, default: true },
      },
    },
    likedUsers: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    favouritedUsers: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    dislikedUsers: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    matches: [
      {
        user: {
          type: Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        matchedAt: {
          type: Date,
          default: Date.now,
        },
        isActive: {
          type: Boolean,
          default: true,
        },
      },
    ],
    isVerified: {
      type: Boolean,
      default: false,
    },
    isPremium: {
      type: Boolean,
      default: false,
    },
    views: {
      type: Number,
      default: 0,
      min: 0,
    },
    profileCompletion: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    lastActive: {
      type: Date,
      default: Date.now,
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    verificationToken: String,
    verificationTokenExpires: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);
