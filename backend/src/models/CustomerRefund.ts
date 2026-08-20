import mongoose, { Schema } from 'mongoose';
import { ICustomerRefund } from '../types/adultModels';

const customerRefundSchema = new Schema<ICustomerRefund>(
  {
    originalTxId: {
      type: Schema.Types.ObjectId,
      ref: 'CreditTransaction',
      required: true,
      index: true,
    },
    serviceRequestId: {
      type: Schema.Types.ObjectId,
      ref: 'AdultMessage',
      index: true,
    },
    disputeReportId: {
      type: Schema.Types.ObjectId,
      ref: 'Report',
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'AdultUser',
      required: true,
      index: true,
    },
    providerId: {
      type: Schema.Types.ObjectId,
      ref: 'AdultUser',
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    providerAmountReverted: {
      type: Number,
      default: 0,
    },
    platformFeeReverted: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['REFUND_PENDING', 'REFUND_COMPLETED', 'REFUND_FAILED'],
      default: 'REFUND_PENDING',
      index: true,
    },
    adminId: {
      type: Schema.Types.ObjectId,
      ref: 'AdultUser',
    },
    resolvedAt: {
      type: Date,
      default: Date.now,
    },
    completedAt: {
      type: Date,
    },
    reference: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

export const CustomerRefund = mongoose.model<ICustomerRefund>('CustomerRefund', customerRefundSchema);
export default CustomerRefund;
