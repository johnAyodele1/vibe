import mongoose, { Schema } from 'mongoose';

const adultGiftSchema = new Schema(
  {
    name: { type: String, required: true },
    iconUrl: { type: String, required: true },
    creditCost: { type: Number, required: true },
    category: { type: String, enum: ['romantic', 'spicy', 'luxury', 'fun'], required: true },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const AdultGift = mongoose.model('AdultGift', adultGiftSchema);
export default AdultGift;
