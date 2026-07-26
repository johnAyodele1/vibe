import { create } from 'zustand';

export interface TipSheetState {
  isOpen: boolean;
  provider: {
    userId: string;
    stageName: string;
    avatarUrl: string;
    isOnline: boolean;
  } | null;
  selectedAmount: number | null;
  customAmount: string;
  message: string;
  step: 'select' | 'processing' | 'success' | 'error';
  result: {
    tipId: string;
    amount: number;
    newBalance: number;
    recipientName: string;
  } | null;

  // Actions
  openSheet: (provider: TipSheetState['provider'], initialAmount?: number | null) => void;
  closeSheet: () => void;
  setSelectedAmount: (amount: number | null) => void;
  setCustomAmount: (amount: string) => void;
  setMessage: (message: string) => void;
  setStep: (step: TipSheetState['step']) => void;
  setResult: (result: TipSheetState['result']) => void;
  reset: () => void;
}

export const useTipSheetStore = create<TipSheetState>((set) => ({
  isOpen: false,
  provider: null,
  selectedAmount: null,
  customAmount: '',
  message: '',
  step: 'select',
  result: null,

  openSheet: (provider, initialAmount) => set({
    isOpen: true,
    provider,
    selectedAmount: initialAmount || null,
    customAmount: '',
    message: '',
    step: 'select',
    result: null,
  }),
  closeSheet: () => set({ isOpen: false }),
  setSelectedAmount: (amount) => set({ selectedAmount: amount }),
  setCustomAmount: (amount) => set({ customAmount: amount }),
  setMessage: (message) => set({ message }),
  setStep: (step) => set({ step }),
  setResult: (result) => set({ result }),
  reset: () => set({
    selectedAmount: null,
    customAmount: '',
    message: '',
    step: 'select',
    result: null,
  }),
}));
