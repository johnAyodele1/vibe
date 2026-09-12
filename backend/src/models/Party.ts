import mongoose, { Schema, Document } from 'mongoose';

export interface ITicketTier {
  tierId: string;
  name: string;
  description?: string;
  price: number;
  quantity: number;
  sold: number;
  perPersonLimit: number;
  isActive: boolean;
}

export interface IPartyMedia {
  type: 'image' | 'video';
  url: string;
  thumbnail?: string;
  order?: number;
}

export interface IParty extends Document {
  title: string;
  description: string;
  tagline?: string;
  coverImage: string;
  gallery: IPartyMedia[];
  organizerId: mongoose.Types.ObjectId;
  organizerName?: string;
  organizerPhone?: string;
  venueName: string;
  venueAddress: string;
  location: {
    country?: { name?: string; code?: string };
    state?: { name?: string; code?: string };
    city?: string;
    address?: string;
    coordinates?: { lat?: number; lng?: number };
  };
  startDate: Date;
  endDate: Date;
  timezone: string;
  ticketTiers: ITicketTier[];
  platformFeeRate: number;
  organizerPayoutMethod?: string;
  status: 'draft' | 'pending_review' | 'approved' | 'rejected' | 'cancelled' | 'completed';
  adminReviewNote?: string;
  rejectionReason?: string;
  approvedAt?: Date;
  approvedBy?: mongoose.Types.ObjectId;
  guardAccessCodeHash?: string;
  genres: string[];
  vibes: string[];
  viewCount: number;
  totalRevenue: number;
  isFeatured: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PartySchema = new Schema<IParty>(
  {
    title: { type: String, required: true, maxlength: 100 },
    description: { type: String, required: true, maxlength: 2000 },
    tagline: { type: String, maxlength: 120 },
    coverImage: { type: String, required: true },
    gallery: [
      {
        type: { type: String, enum: ['image', 'video'], required: true },
        url: { type: String, required: true },
        thumbnail: { type: String },
        order: { type: Number, default: 0 },
      },
    ],
    organizerId: { type: Schema.Types.ObjectId, required: true, ref: 'AdultUser' },
    organizerName: { type: String },
    organizerPhone: { type: String },
    venueName: { type: String, required: true },
    venueAddress: { type: String, required: true },
    location: {
      country: { name: String, code: String },
      state: { name: String, code: String },
      city: { type: String },
      address: { type: String },
      coordinates: { lat: Number, lng: Number },
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    timezone: { type: String, default: 'Africa/Lagos' },
    ticketTiers: [
      {
        tierId: { type: String, required: true },
        name: { type: String, required: true },
        description: { type: String },
        price: { type: Number, required: true },
        quantity: { type: Number, required: true },
        sold: { type: Number, default: 0 },
        perPersonLimit: { type: Number, default: 4 },
        isActive: { type: Boolean, default: true },
      },
    ],
    platformFeeRate: { type: Number, default: 0.05 },
    organizerPayoutMethod: { type: String },
    status: {
      type: String,
      enum: ['draft', 'pending_review', 'approved', 'rejected', 'cancelled', 'completed'],
      default: 'draft',
    },
    adminReviewNote: { type: String },
    rejectionReason: { type: String },
    approvedAt: { type: Date },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'AdultUser' },
    guardAccessCodeHash: { type: String },
    genres: [{ type: String }],
    vibes: [{ type: String }],
    viewCount: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
    isFeatured: { type: Boolean, default: false },
  },
  {
    collection: 'parties',
    timestamps: true,
  }
);

PartySchema.index({ status: 1, startDate: 1 });
PartySchema.index({ 'location.city': 1, startDate: 1 });
PartySchema.index({ organizerId: 1 });

export const Party = mongoose.model<IParty>('Party', PartySchema);
export default Party;
