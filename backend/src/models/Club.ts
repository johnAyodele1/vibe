import mongoose, { Schema, Document } from 'mongoose';

export interface IOperatingHour {
  day: number;
  isOpen: boolean;
  openTime?: string;
  closeTime?: string;
}

export interface IClub extends Document {
  name: string;
  slug: string;
  description?: string;
  tagline?: string;
  coverImage?: string;
  logoImage?: string;
  gallery: Array<{ url: string; caption?: string }>;
  location: {
    country?: { name?: string; code?: string };
    state?: { name?: string; code?: string };
    city?: string;
    address?: string;
    coordinates?: { lat?: number; lng?: number };
  };
  website?: string;
  instagram?: string;
  phone?: string;
  operatingHours: IOperatingHour[];
  entryFee: {
    hasEntryFee: boolean;
    amount?: number;
    description?: string;
  };
  genres: string[];
  vibes: string[];
  ownerId?: mongoose.Types.ObjectId;
  status: 'pending' | 'active' | 'suspended' | 'rejected';
  verifiedAt?: Date;
  verifiedBy?: mongoose.Types.ObjectId;
  rejectionReason?: string;
  followerCount: number;
  viewCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const ClubSchema = new Schema<IClub>(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    slug: { type: String, unique: true, required: true, trim: true, minlength: 1, maxlength: 160 },
    description: { type: String, maxlength: 5000 },
    tagline: { type: String, maxlength: 300 },
    coverImage: { type: String },
    logoImage: { type: String },
    gallery: [
      {
        url: { type: String, required: true },
        caption: { type: String, maxlength: 300 },
      },
    ],
    location: {
      country: { name: String, code: String },
      state: { name: String, code: String },
      city: { type: String, maxlength: 120 },
      address: { type: String, maxlength: 500 },
      coordinates: { lat: Number, lng: Number },
    },
    website: { type: String },
    instagram: { type: String },
    phone: { type: String },
    operatingHours: [
      {
        day: { type: Number, min: 0, max: 6, required: true },
        isOpen: { type: Boolean, default: false },
        openTime: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
        closeTime: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
      },
    ],
    entryFee: {
      hasEntryFee: { type: Boolean, default: false },
      amount: { type: Number, min: 0 },
      description: { type: String, maxlength: 300 },
    },
    genres: [{ type: String, maxlength: 80 }],
    vibes: [{ type: String, maxlength: 80 }],
    ownerId: { type: Schema.Types.ObjectId, ref: 'AdultUser' },
    status: {
      type: String,
      enum: ['pending', 'active', 'suspended', 'rejected'],
      default: 'pending',
    },
    verifiedAt: { type: Date },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'AdultUser' },
    rejectionReason: { type: String, maxlength: 1000 },
    followerCount: { type: Number, default: 0, min: 0 },
    viewCount: { type: Number, default: 0, min: 0 },
  },
  {
    collection: 'clubs',
    timestamps: true,
  }
);

ClubSchema.index({ status: 1 });
ClubSchema.index({ 'location.city': 1, 'location.country.code': 1 });

ClubSchema.pre('validate', function (next) {
  if (!Array.isArray(this.operatingHours)) return next(new Error('Operating hours must be an array'));
  if (this.operatingHours.some((hours) => hours.day < 0 || hours.day > 6)) {
    return next(new Error('Operating hour day must be between 0 and 6'));
  }
  if (this.entryFee?.hasEntryFee && (this.entryFee.amount === undefined || this.entryFee.amount < 0)) {
    return next(new Error('Entry fee amount is required when the club has an entry fee'));
  }
  if (this.location?.coordinates) {
    const { lat, lng } = this.location.coordinates;
    if (lat !== undefined && (lat < -90 || lat > 90)) return next(new Error('Invalid latitude'));
    if (lng !== undefined && (lng < -180 || lng > 180)) return next(new Error('Invalid longitude'));
  }
  next();
});

export const Club = mongoose.model<IClub>('Club', ClubSchema);
export default Club;
