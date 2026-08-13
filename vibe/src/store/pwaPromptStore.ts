import { create } from 'zustand';
import { getInstallContext } from '../lib/pwa/context';

export const NOTIF_KEYS = {
  shownThisSession: 'zippo_notif_prompt_shown_session',
  lastShownAt:      'zippo_notif_prompt_last_shown_at',
  dismissed:        'zippo_notif_prompt_dismissed',
};

interface PWAPromptState {
  showInstallPrompt: boolean;
  showNotifPrompt: boolean;
  setShowInstallPrompt: (show: boolean) => void;
  setShowNotifPrompt: (show: boolean) => void;
  dismissInstallPrompt: () => void;
  shouldShowInstallPrompt: () => boolean;
  shouldShowNotifPrompt: () => boolean;
  recordInstallPromptShown: () => void;
}

export const usePWAPromptStore = create<PWAPromptState>((set) => ({
  showInstallPrompt: false,
  showNotifPrompt: false,
  setShowInstallPrompt: (show) => set({ showInstallPrompt: show }),
  setShowNotifPrompt: (show) => set({ showNotifPrompt: show }),

  dismissInstallPrompt: () => {
    set({ showInstallPrompt: false });
    // Notification onboarding follows the install prompt. It is intentionally
    // shown for both default and already-granted permission so a granted device
    // can be tested immediately instead of assuming push works.
    const ctx = getInstallContext();
    if (ctx.pushSupportedOnThisDevice) {
      set({ showNotifPrompt: true });
    }
  },

  shouldShowInstallPrompt: () => {
    const ctx = getInstallContext();
    if (ctx.isStandalone) return false;

    const ua = navigator.userAgent;
    const isIOSDevice = ctx.isIOS;
    const isSafariBrowser = /Safari/i.test(ua) && !/CriOS/i.test(ua) && !/FxiOS/i.test(ua) && !/EdgiOS/i.test(ua);
    const isIOS = isIOSDevice && isSafariBrowser;
    const isAndroid = /Android/i.test(ua);
    const isInstallable = true;

    return isIOS || isAndroid || isInstallable;
  },

  shouldShowNotifPrompt: () => {
    const ctx = getInstallContext();
    if (ctx.notificationPermission === 'denied') return false;
    if (!ctx.pushSupportedOnThisDevice) return false;
    return true;
  },

  recordInstallPromptShown: () => {
    console.log('[PWAPromptStore] Install prompt shown recorded');
  },
}));
