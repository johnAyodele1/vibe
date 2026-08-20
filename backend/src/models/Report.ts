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
      enum: ['pending', 'resolved', 'dismissed', 'open'],
      default: 'pending',
    },
    type: {
      type: String,
    },
    serviceRequestId: {
      type: Schema.Types.ObjectId,
      ref: 'AdultMessage',
    },
    originalTxId: {
      type: Schema.Types.ObjectId,
      ref: 'CreditTransaction',
    },
    conversationId: {
      type: String,
    },
    details: {
      type: String,
    },
    amountInDispute: {
      type: Number,
    },
    providerAmountHeld: {
      type: Number,
    },
    resolvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'AdultUser',
    },
    resolvedAt: {
      type: Date,
    },
    resolution: {
      type: String,
      enum: ['upheld', 'dismissed'],
    },
    adminNotes: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Sparse unique index on reporter + serviceRequestId for service disputes
reportSchema.index(
  { reporter: 1, serviceRequestId: 1 },
  { unique: true, sparse: true }
);

export const Report = mongoose.model<IReport>('Report', reportSchema);
export default Report;
