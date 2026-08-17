import { create } from 'zustand';

interface PricingState {
  diamondNairaRate: number;
  setRate: (rate: number) => void;
}

export const usePricingStore = create<PricingState>((set) => ({
  diamondNairaRate: 100, // default — will be overwritten by API on app startup
  setRate: (rate: number) => set({ diamondNairaRate: rate }),
}));

export const diamondsToNaira = (diamonds: number, rate: number): number => {
  return diamonds * rate;
};

/**
 * Formats monetary/credit/diamond amounts to a maximum of 2 decimal places.
 * - Integer numbers display without decimal places (e.g. 3731 -> "3,731", 0 -> "0").
 * - Floating point numbers display rounded to 2 decimal places (e.g. 3731.7999999999556 -> "3,731.80", 3731.7 -> "3,731.70", 0.1 -> "0.10").
 * - Handles null, undefined, invalid values, and numeric strings safely.
 */
export const formatAmount = (val: number | string | null | undefined): string => {
  if (val === null || val === undefined) return '0';
  const num = typeof val === 'number' ? val : parseFloat(val);
  if (isNaN(num)) return '0';

  const str = num.toFixed(2);
  const parsed = parseFloat(str);
  if (Number.isInteger(parsed)) {
    return parsed.toLocaleString('en-US');
  }
  return parsed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const formatCredits = formatAmount;
export const formatDiamonds = formatAmount;

export const formatNaira = (amount: number | string | null | undefined): string => {
  if (amount === null || amount === undefined) return '₦0';
  const num = typeof amount === 'number' ? amount : parseFloat(amount);
  if (isNaN(num)) return '₦0';

  const str = num.toFixed(2);
  const parsed = parseFloat(str);
  if (Number.isInteger(parsed)) {
    return `₦${parsed.toLocaleString('en-NG')}`;
  }
  return `₦${parsed.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const formatDiamondsWithNaira = (diamonds: number | string | null | undefined, rate: number): string => {
  const d = typeof diamonds === 'number' ? diamonds : parseFloat(diamonds as string);
  const validD = isNaN(d) ? 0 : d;
  const naira = diamondsToNaira(validD, rate);
  return `💎 ${formatAmount(validD)} (${formatNaira(naira)})`;
};
