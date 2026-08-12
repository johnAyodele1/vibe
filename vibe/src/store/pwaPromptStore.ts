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
    // Show notification prompt immediately after install prompt is dismissed
    const ctx = getInstallContext();
    const canPromptNotif = ctx.notificationPermission === 'default';
    if (canPromptNotif) {
      set({ showNotifPrompt: true });
    }
  },

  shouldShowInstallPrompt: () => {
    const ctx = getInstallContext();
    if (ctx.isStandalone) return false;

    // NO MORE COOLDOWNS OR PERSISTENT LOCAL STORAGE DISMISSALS ON LOAD!
    // It must show on every load/reload.
    // Platform detection: standard iOS or Android or installable browser
    const ua = navigator.userAgent;
    const isIOSDevice = ctx.isIOS;
    const isSafariBrowser = /Safari/i.test(ua) && !/CriOS/i.test(ua) && !/FxiOS/i.test(ua) && !/EdgiOS/i.test(ua);

    const isIOS = isIOSDevice && isSafariBrowser;
    const isAndroid = /Android/i.test(ua);
    const isInstallable = true; // standard fallback

    return isIOS || isAndroid || isInstallable;
  },

  shouldShowNotifPrompt: () => {
    const ctx = getInstallContext();
    // Notification permission must be default
    if (ctx.notificationPermission !== 'default') return false;

    // Must be supported on this device
    if (!ctx.pushSupportedOnThisDevice) return false;

    // NO MORE COOLDOWNS OR PERSISTENT LOCAL STORAGE DISMISSALS ON LOAD!
    return true;
  },

  recordInstallPromptShown: () => {
    console.log('[PWAPromptStore] Install prompt shown recorded');
  },
}));
