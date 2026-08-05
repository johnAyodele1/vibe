import mongoose, { Schema } from 'mongoose';
import { IReport } from '../types/models';

const reportSchema = new Schema<IReport>(
  {
    reporter: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reported: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reason: {
      type: String,
      required: [true, 'Reason is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending', 'resolved', 'dismissed'],
      default: 'pending',
    },
  },
  {
    timestamps: true,
  }
);

export const Report = mongoose.model<IReport>('Report', reportSchema);
export default Report;
