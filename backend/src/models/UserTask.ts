import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IUserTask extends Document {
  userId: Types.ObjectId;
  taskId: Types.ObjectId;
  completedAt: Date;
  creditsAwarded: number;
  resetDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userTaskSchema = new Schema<IUserTask>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'AdultUser',
      required: true,
      index: true,
    },
    taskId: {
      type: Schema.Types.ObjectId,
      ref: 'RewardTask',
      required: true,
      index: true,
    },
    completedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    creditsAwarded: {
      type: Number,
      required: true,
    },
    resetDate: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

export const UserTask = mongoose.model<IUserTask>('UserTask', userTaskSchema);
export default UserTask;
