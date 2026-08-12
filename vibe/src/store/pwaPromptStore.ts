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
  shouldShowInstallPrompt: () => boolean;
  shouldShowNotifPrompt: () => boolean;
  recordInstallPromptShown: () => void;
}

export const usePWAPromptStore = create<PWAPromptState>((set, get) => ({
  showInstallPrompt: false,
  showNotifPrompt: false,
  setShowInstallPrompt: (show) => set({ showInstallPrompt: show }),
  setShowNotifPrompt: (show) => set({ showNotifPrompt: show }),

  shouldShowInstallPrompt: () => {
    const ctx = getInstallContext();
    if (ctx.isStandalone) return false;

    // Check permanent dismissal or temporary dismissal (cooldown)
    const permanent = localStorage.getItem('zippo_pwa_dismiss_permanent') === 'true';
    const until = localStorage.getItem('zippo_pwa_dismiss_until');
    const cooldownActive = until ? Date.now() < parseInt(until, 10) : false;

    if (permanent || cooldownActive) return false;

    // Only show on mobile
    const isMobile = window.innerWidth < 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (!isMobile) return false;

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

    // Check if dismissed or shown this session
    const dismissed = localStorage.getItem(NOTIF_KEYS.dismissed) === '1';
    const shownThisSession = sessionStorage.getItem(NOTIF_KEYS.shownThisSession) === '1';
    if (dismissed || shownThisSession) return false;

    // Cooldown check: 24h since last shown
    const lastShownAt = localStorage.getItem(NOTIF_KEYS.lastShownAt);
    if (lastShownAt) {
      const timeDiff = Date.now() - parseInt(lastShownAt, 10);
      if (timeDiff < 24 * 60 * 60 * 1000) return false; // 24 hours cooldown
    }

    return true;
  },

  recordInstallPromptShown: () => {
    console.log('[PWAPromptStore] Install prompt shown recorded');
  },
}));
