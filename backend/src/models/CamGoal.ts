import mongoose, { Schema } from 'mongoose';
import { ICamGoal } from '../types/adultModels';

const camGoalSchema = new Schema<ICamGoal>(
  {
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: 'CamSession',
      required: true,
    },
    providerId: {
      type: Schema.Types.ObjectId,
      ref: 'AdultUser',
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    targetCredits: {
      type: Number,
      required: true,
    },
    currentCredits: {
      type: Number,
      default: 0,
    },
    isCompleted: {
      type: Boolean,
      default: false,
    },
    completedAt: Date,
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export const CamGoal = mongoose.model<ICamGoal>('CamGoal', camGoalSchema);
export default CamGoal;
