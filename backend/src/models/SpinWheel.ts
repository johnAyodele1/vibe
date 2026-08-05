import mongoose, { Schema, Document } from 'mongoose';

export interface ISpinWheelItem {
  id: string;
  label: string;
  creditCost: number;
  probability: number;
  color: string;
}

export interface ISpinWheel extends Document {
  providerId: mongoose.Types.ObjectId;
  isActive: boolean;
  items: ISpinWheelItem[];
  totalSpins: number;
  totalEarned: number;
  createdAt: Date;
  updatedAt: Date;
}

const spinWheelItemSchema = new Schema({
  id: { type: String, required: true },
  label: { type: String, required: true, maxlength: 40 },
  creditCost: { type: Number, required: true, min: 5 },
  probability: { type: Number, default: 1, min: 1, max: 10 },
  color: { type: String, required: true },
});

const spinWheelSchema = new Schema<ISpinWheel>(
  {
    providerId: { type: Schema.Types.ObjectId, ref: 'AdultUser', required: true, unique: true, index: true },
    isActive: { type: Boolean, default: false },
    items: [spinWheelItemSchema],
    totalSpins: { type: Number, default: 0 },
    totalEarned: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const SpinWheel = mongoose.model<ISpinWheel>('SpinWheel', spinWheelSchema);
export default SpinWheel;
