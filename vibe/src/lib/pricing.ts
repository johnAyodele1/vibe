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

export const formatNaira = (amount: number): string => {
  if (Number.isInteger(amount)) {
    return `₦${amount.toLocaleString('en-NG')}`;
  }
  return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const formatDiamondsWithNaira = (diamonds: number, rate: number): string => {
  const naira = diamondsToNaira(diamonds, rate);
  return `💎 ${diamonds} (${formatNaira(naira)})`;
};
