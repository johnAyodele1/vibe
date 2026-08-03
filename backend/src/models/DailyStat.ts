import mongoose, { Schema } from 'mongoose';

const DailyStatSchema = new Schema(
  {
    date: {
      type: String,
      required: true,
      unique: true, // e.g., "2026-07-28"
    },
    uniqueActiveUsers: {
      type: Number,
      default: 0,
    },
    newMembers: {
      type: Number,
      default: 0,
    },
    newProviders: {
      type: Number,
      default: 0,
    },
    platformEarnings: {
      type: Number,
      default: 0, // in diamonds
    },
  },
  {
    collection: 'daily_stats',
  }
);

export const DailyStat = mongoose.model('DailyStat', DailyStatSchema);
export default DailyStat;
