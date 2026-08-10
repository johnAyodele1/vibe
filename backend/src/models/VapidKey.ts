import mongoose, { Schema, Document } from 'mongoose';

export interface IVapidKey extends Document {
  publicKey: string;
  privateKey: string;
  subject: string;
  createdAt: Date;
  updatedAt: Date;
}

const vapidKeySchema = new Schema<IVapidKey>(
  {
    publicKey: { type: String, required: true },
    privateKey: { type: String, required: true },
    subject: { type: String, required: true },
  },
  { timestamps: true }
);

export const VapidKey = mongoose.model<IVapidKey>('VapidKey', vapidKeySchema);
export default VapidKey;
