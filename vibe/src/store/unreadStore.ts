import { create } from 'zustand';

interface UnreadStore {
  totalUnread:  number;
  setUnread:    (count: number) => void;
  increment:    () => void;
  decrement:    (by?: number) => void;
  clear:        () => void;
}

export const useUnreadStore = create<UnreadStore>((set) => ({
  totalUnread: 0,
  setUnread:   (count) => set({ totalUnread: Math.max(0, count) }),
  increment:   () => set((s) => ({ totalUnread: s.totalUnread + 1 })),
  decrement:   (by = 1) => set((s) => ({ totalUnread: Math.max(0, s.totalUnread - by) })),
  clear:       () => set({ totalUnread: 0 }),
}));
