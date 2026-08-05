import { create } from 'zustand';
import { API_BASE_URL } from '../../config';

interface WalletState {
  creditBalance: number;
  loading: boolean;
  fetchWallet: () => Promise<void>;
  setCreditBalance: (balance: number) => void;
}

export const useWalletStore = create<WalletState>((set) => ({
  creditBalance: 0,
  loading: false,
  fetchWallet: async () => {
    const token = localStorage.getItem('adultAccessToken');
    if (!token) return;
    set({ loading: true });
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/wallet`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (typeof data.creditBalance === 'number') {
        set({ creditBalance: data.creditBalance });
      }
    } catch (err) {
      console.error('Failed to fetch wallet:', err);
    } finally {
      set({ loading: false });
    }
  },
  setCreditBalance: (balance) => set({ creditBalance: balance })
}));
