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
    name: { type: String, required: true },
    slug: { type: String, unique: true, required: true },
    description: { type: String },
    tagline: { type: String },
    coverImage: { type: String },
    logoImage: { type: String },
    gallery: [
      {
        url: { type: String, required: true },
        caption: { type: String },
      },
    ],
    location: {
      country: { name: String, code: String },
      state: { name: String, code: String },
      city: { type: String },
      address: { type: String },
      coordinates: { lat: Number, lng: Number },
    },
    website: { type: String },
    instagram: { type: String },
    phone: { type: String },
    operatingHours: [
      {
        day: { type: Number, min: 0, max: 6, required: true },
        isOpen: { type: Boolean, default: false },
        openTime: { type: String },
        closeTime: { type: String },
      },
    ],
    entryFee: {
      hasEntryFee: { type: Boolean, default: false },
      amount: { type: Number },
      description: { type: String },
    },
    genres: [{ type: String }],
    vibes: [{ type: String }],
    ownerId: { type: Schema.Types.ObjectId, ref: 'AdultUser' },
    status: {
      type: String,
      enum: ['pending', 'active', 'suspended', 'rejected'],
      default: 'pending',
    },
    verifiedAt: { type: Date },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'AdultUser' },
    rejectionReason: { type: String },
    followerCount: { type: Number, default: 0 },
    viewCount: { type: Number, default: 0 },
  },
  {
    collection: 'clubs',
    timestamps: true,
  }
);

ClubSchema.index({ status: 1 });
ClubSchema.index({ 'location.city': 1, 'location.country.code': 1 });

export const Club = mongoose.model<IClub>('Club', ClubSchema);
export default Club;
