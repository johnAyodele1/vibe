import mongoose, { Schema, Document } from 'mongoose';

export interface IRandomMatch extends Document {
  userA: mongoose.Types.ObjectId;
  userB: mongoose.Types.ObjectId;
  roomId: string;
  mode: string;
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
    },
    userB: {
      type: Schema.Types.ObjectId,
      ref: 'AdultUser',
      required: true,
    },
    roomId: {
      type: String,
      required: true,
    },
    mode: {
      type: String,
      required: true,
      default: 'video',
    },
    status: {
      type: String,
      enum: ['matched', 'ended'],
      default: 'matched',
      required: true,
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

export const RandomMatch = mongoose.model<IRandomMatch>('RandomMatch', randomMatchSchema);
export default RandomMatch;
