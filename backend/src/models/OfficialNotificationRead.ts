import mongoose, { Schema, Document } from 'mongoose';

export interface IOfficialNotificationRead extends Document {
  userId: mongoose.Types.ObjectId;
  notificationId: mongoose.Types.ObjectId;
  readAt: Date;
}

const officialNotificationReadSchema = new Schema<IOfficialNotificationRead>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'AdultUser',
      required: true,
      index: true,
    },
    notificationId: {
      type: Schema.Types.ObjectId,
      ref: 'OfficialNotification',
      required: true,
      index: true,
    },
    readAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
  }
);

officialNotificationReadSchema.index(
  { userId: 1, notificationId: 1 },
  { unique: true }
);

export const OfficialNotificationRead = mongoose.model<IOfficialNotificationRead>(
  'OfficialNotificationRead',
  officialNotificationReadSchema
);
export default OfficialNotificationRead;
