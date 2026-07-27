import mongoose, { Schema, Document } from 'mongoose';

export interface IContentViolation extends Document {
  userId: mongoose.Types.ObjectId;
  accountType: 'member' | 'service_provider';
  conversationId: string;
  messageContent: string;
  violationType: 'phone' | 'platform' | 'email' | 'offplatform';
  matchedText: string;
  reviewed: boolean;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  actionTaken: 'none' | 'warned' | 'suspended' | 'dismissed';
  createdAt: Date;
  updatedAt: Date;
}

const ContentViolationSchema = new Schema<IContentViolation>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'AdultUser',
      required: true,
    },
    accountType: {
      type: String,
      enum: ['member', 'service_provider'],
      required: true,
    },
    conversationId: {
      type: String,
      required: true,
    },
    messageContent: {
      type: String,
      required: true,
      select: false, // only visible to admins or via explicit query select
    },
    violationType: {
      type: String,
      enum: ['phone', 'platform', 'email', 'offplatform'],
      required: true,
    },
    matchedText: {
      type: String,
      required: true,
    },
    reviewed: {
      type: Boolean,
      default: false,
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: 'AdultUser',
    },
    reviewedAt: {
      type: Date,
    },
    actionTaken: {
      type: String,
      enum: ['none', 'warned', 'suspended', 'dismissed'],
      default: 'none',
    },
  },
  {
    timestamps: true,
    collection: 'content_violations',
  }
);

export const ContentViolation = mongoose.model<IContentViolation>('ContentViolation', ContentViolationSchema);
export default ContentViolation;
