import mongoose, { Schema, Document } from 'mongoose';

export interface IRewardTask extends Document {
  title: string;
  description?: string;
  reward: number;
  type: 'daily_checkin' | 'watch_cam' | 'send_message' | 'custom';
  actionUrl?: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const rewardTaskSchema = new Schema<IRewardTask>(
  {
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    reward: {
      type: Number,
      required: true,
      min: 1,
    },
    type: {
      type: String,
      required: true,
      enum: ['daily_checkin', 'watch_cam', 'send_message', 'custom'],
    },
    actionUrl: {
      type: String,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

export const RewardTask = mongoose.model<IRewardTask>('RewardTask', rewardTaskSchema);
export default RewardTask;
