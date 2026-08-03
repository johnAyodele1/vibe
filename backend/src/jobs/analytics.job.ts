import cron from 'node-cron';
import Redis from 'ioredis';
import AdultUser from '../models/AdultUser';
import PlatformEarning from '../models/PlatformEarning';
import DailyStat from '../models/DailyStat';

let redisClient: Redis | null = null;
if (process.env.REDIS_URL || process.env.REDIS_HOST) {
  try {
    redisClient = new Redis(process.env.REDIS_URL || '');
  } catch (err) {}
}

const getPreviousDateString = (date: Date) => {
  const prev = new Date(date);
  prev.setDate(prev.getDate() - 1);
  return prev.toISOString().slice(0, 10); // "YYYY-MM-DD"
};

export const snapshotDailyStats = async () => {
  const yesterday = getPreviousDateString(new Date());
  const dauKey    = `adult:dau:${yesterday}`;

  let dau = 0;
  if (redisClient) {
    try {
      dau = await redisClient.scard(dauKey);
    } catch (err) {
      console.error('snapshotDailyStats scard error:', err);
    }
  }

  const startOfYesterday = new Date(yesterday + 'T00:00:00.000Z');
  const endOfYesterday = new Date(yesterday + 'T23:59:59.999Z');

  const [newMembers, newProviders, totalEarnings] = await Promise.all([
    AdultUser.countDocuments({
      role: 'user',
      createdAt: { $gte: startOfYesterday, $lte: endOfYesterday },
    }),
    AdultUser.countDocuments({
      role: 'provider',
      createdAt: { $gte: startOfYesterday, $lte: endOfYesterday },
    }),
    PlatformEarning.aggregate([
      { $match: { createdAt: { $gte: startOfYesterday, $lte: endOfYesterday } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
  ]);

  try {
    await DailyStat.findOneAndUpdate(
      { date: yesterday },
      {
        $set: {
          uniqueActiveUsers: dau,
          newMembers,
          newProviders,
          platformEarnings: totalEarnings[0]?.total || 0,
        }
      },
      { upsert: true, new: true }
    );
    console.log(`Successfully snapshotted daily stats for ${yesterday}`);
  } catch (error) {
    console.error('Error snapshotting daily stats:', error);
  }
};

export const initAnalyticsJob = () => {
  // runs at 00:01 every day
  cron.schedule('1 0 * * *', async () => {
    console.log('Running daily analytics snapshot job...');
    await snapshotDailyStats();
  });
  console.log('Daily analytics snapshot job initialized.');
};
