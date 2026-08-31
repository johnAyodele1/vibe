import mongoose, { Schema } from 'mongoose';

const PlatformEarningSchema = new Schema(
  {
    source: {
      type: String,
      enum: ['tip', 'gift', 'call', 'service', 'paid_media', 'spin_wheel', 'ticket_sale'],
      required: true,
    },
    amount: {
      type: Number,
      required: true, // the 15% in diamonds
    },
    nairaValue: {
      type: Number, // amount × rate at time of transaction
    },
    fromUserId: {
      type: Schema.Types.ObjectId,
      ref: 'AdultUser',
    },
    toProviderId: {
      type: Schema.Types.ObjectId,
      ref: 'AdultUser',
    },
    referenceId: {
      type: Schema.Types.ObjectId,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: 'platform_earnings',
  }
);

export const PlatformEarning = mongoose.model('PlatformEarning', PlatformEarningSchema);
export default PlatformEarning;
