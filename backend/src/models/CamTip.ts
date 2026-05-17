import mongoose, { Schema } from 'mongoose';
import { ICamTip } from '../types/adultModels';

const camTipSchema = new Schema<ICamTip>(
  {
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: 'CamSession',
      required: true,
      index: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'AdultUser',
      required: true,
    },
    providerId: {
      type: Schema.Types.ObjectId,
      ref: 'AdultUser',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    message: {
      type: String,
      maxlength: 100,
    },
    isAnonymous: {
      type: Boolean,
      default: false,
    },
    triggeredGoal: {
      type: Boolean,
      default: false,
    },
    goalId: String,
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export const CamTip = mongoose.model<ICamTip>('CamTip', camTipSchema);
export default CamTip;
