import mongoose, { Schema, Document } from 'mongoose';

export interface ISpinResult extends Document {
  wheelId: mongoose.Types.ObjectId;
  providerId: mongoose.Types.ObjectId;
  spinnerId: mongoose.Types.ObjectId;
  spinnerName: string;
  camSessionId: mongoose.Types.ObjectId | null;
  itemId: string;
  itemLabel: string;
  creditsPaid: number;
  creditsToProvider: number;
  platformFee: number;
  createdAt: Date;
}

const spinResultSchema = new Schema<ISpinResult>(
  {
    wheelId: { type: Schema.Types.ObjectId, ref: 'SpinWheel', required: true },
    providerId: { type: Schema.Types.ObjectId, ref: 'AdultUser', required: true, index: true },
    spinnerId: { type: Schema.Types.ObjectId, ref: 'AdultUser', required: true, index: true },
    spinnerName: { type: String, required: true },
    camSessionId: { type: Schema.Types.ObjectId, ref: 'CamSession', default: null },
    itemId: { type: String, required: true },
    itemLabel: { type: String, required: true },
    creditsPaid: { type: Number, required: true },
    creditsToProvider: { type: Number, required: true },
    platformFee: { type: Number, required: true },
  },
  { timestamps: true }
);

export const SpinResult = mongoose.model<ISpinResult>('SpinResult', spinResultSchema);
export default SpinResult;
