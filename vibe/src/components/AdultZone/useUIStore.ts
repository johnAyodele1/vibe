import { create } from 'zustand';

interface UIStore {
  hideGlobalHeader: boolean;
  setHideGlobalHeader: (hide: boolean) => void;
  hideFooter: boolean;
  setHideFooter: (hide: boolean) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  hideGlobalHeader: false,
  setHideGlobalHeader: (hide) => set({ hideGlobalHeader: hide }),
  hideFooter: false,
  setHideFooter: (hide) => set({ hideFooter: hide }),
}));
