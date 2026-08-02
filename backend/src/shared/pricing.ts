import AppConfig from '../models/AppConfig';
import { getCache, setCache } from '../config/redisFallback';

const RATE_CACHE_KEY = 'config:diamond_naira_rate';
const RATE_CACHE_TTL = 300; // 5 minutes

export const getDiamondNairaRate = async (): Promise<number> => {
  // Check Redis / fallback cache first
  const cached = await getCache(RATE_CACHE_KEY);
  if (cached) return parseInt(cached, 10);

  let config = await AppConfig.findOne({ key: 'diamond_naira_rate' });
  if (!config) {
    // Robust on-the-fly seeding if missing
    config = await AppConfig.findOneAndUpdate(
      { key: 'diamond_naira_rate' },
      {
        $setOnInsert: {
          key: 'diamond_naira_rate',
          value: 100,
          label: 'Diamond to Naira Rate',
          description: 'How many Naira equals 1 diamond credit',
          createdAt: new Date(),
        },
        $set: { updatedAt: new Date() },
      },
      { upsert: true, new: true }
    );
  }

  const rate = config?.value || 100;

  await setCache(RATE_CACHE_KEY, RATE_CACHE_TTL, rate.toString());
  return rate;
};

export const diamondsToNaira = async (diamonds: number): Promise<number> => {
  const rate = await getDiamondNairaRate();
  return diamonds * rate;
};

export const nairaToDiamonds = async (naira: number): Promise<number> => {
  const rate = await getDiamondNairaRate();
  return Math.floor(naira / rate);
};

export const formatNaira = (amount: number): string => {
  if (Number.isInteger(amount)) {
    return `₦${amount.toLocaleString('en-NG')}`;
  }
  return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
