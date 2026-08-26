import mongoose, { Schema, Document } from 'mongoose';

export interface IRandomMatch extends Document {
  userA: mongoose.Types.ObjectId;
  userB: mongoose.Types.ObjectId;
  roomId: string;
  mode: 'text' | 'video' | 'both';
  preferenceA?: 'girls' | 'guys' | 'anyone';
  preferenceB?: 'girls' | 'guys' | 'anyone';
  status: 'matched' | 'ended';
  startedAt: Date;
  endedAt?: Date;
}

const randomMatchSchema = new Schema<IRandomMatch>(
  {
    userA: {
      type: Schema.Types.ObjectId,
      ref: 'AdultUser',
      required: true,
      index: true,
    },
    userB: {
      type: Schema.Types.ObjectId,
      ref: 'AdultUser',
      required: true,
      index: true,
    },
    roomId: {
      type: String,
      required: true,
      index: true,
    },
    mode: {
      type: String,
      enum: ['text', 'video', 'both'],
      required: true,
      default: 'video',
    },
    preferenceA: {
      type: String,
      enum: ['girls', 'guys', 'anyone'],
    },
    preferenceB: {
      type: String,
      enum: ['girls', 'guys', 'anyone'],
    },
    status: {
      type: String,
      enum: ['matched', 'ended'],
      default: 'matched',
      required: true,
      index: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    endedAt: Date,
  },
  {
    timestamps: true,
  }
);

randomMatchSchema.index({ userA: 1, status: 1 });
randomMatchSchema.index({ userB: 1, status: 1 });

export const RandomMatch = mongoose.model<IRandomMatch>('RandomMatch', randomMatchSchema);
export default RandomMatch;
