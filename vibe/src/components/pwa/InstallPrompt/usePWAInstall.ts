import { useState, useEffect } from 'react';
import { usePWA } from '../../../contexts/PWAContext';

export type InstallPlatform = 'ios' | 'android' | 'desktop' | 'unsupported';

export const usePWAInstall = () => {
  const { isInstallable, isStandalone, isIOS, installApp } = usePWA();

  const [platform, setPlatform] = useState<InstallPlatform>('unsupported');
  const [isDismissed, setIsDismissed] = useState(true);
  const [showInstructions, setShowInstructions] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [delayElapsed, setDelayElapsed] = useState(false);

  // 1. Detect platform & mobile viewport
  useEffect(() => {
    // Mobile screen check
    const checkMobile = () => {
      const mobileWidth = window.innerWidth < 768;
      setIsMobile(mobileWidth);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    // Platform detection
    const ua = navigator.userAgent;
    const isIOSDevice = isIOS || (/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream);
    const isSafariBrowser = /Safari/i.test(ua) && !/CriOS/i.test(ua) && !/FxiOS/i.test(ua) && !/EdgiOS/i.test(ua);

    if (isStandalone) {
      setPlatform('unsupported'); // No prompt needed
    } else if (isIOSDevice) {
      // Even if not Safari, we say iOS, but standard Safari is preferred
      setPlatform(isSafariBrowser ? 'ios' : 'unsupported');
    } else if (/Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
      setPlatform('android');
    } else if (isInstallable) {
      setPlatform('android'); // Fallback for other browsers that support beforeinstallprompt
    } else {
      setPlatform('desktop');
    }

    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, [isInstallable, isStandalone, isIOS]);

  // 2. Check dismissal persistence in localStorage
  useEffect(() => {
    const checkDismissal = () => {
      const permanent = localStorage.getItem('zippo_pwa_dismiss_permanent') === 'true';
      const until = localStorage.getItem('zippo_pwa_dismiss_until');
      const cooldownActive = until ? Date.now() < parseInt(until, 10) : false;

      setIsDismissed(permanent || cooldownActive);
    };

    checkDismissal();
    // Periodically re-check or just check on load/state changes
  }, []);

  // 3. Defensive non-intrusive 2-second delay on first load
  useEffect(() => {
    const timer = setTimeout(() => {
      setDelayElapsed(true);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  // 4. Temporary dismissal (3 days cooldown)
  const dismissTemporary = () => {
    const cooldownMs = 3 * 24 * 60 * 60 * 1000; // 3 days
    localStorage.setItem('zippo_pwa_dismiss_until', (Date.now() + cooldownMs).toString());
    setIsDismissed(true);
  };

  // 5. Permanent dismissal
  const dismissPermanent = () => {
    localStorage.setItem('zippo_pwa_dismiss_permanent', 'true');
    setIsDismissed(true);
  };

  // 6. Handle CTA action tap
  const handleInstallClick = async () => {
    if (platform === 'ios') {
      setShowInstructions(true);
    } else if (platform === 'android') {
      try {
        await installApp();
        // The browser's native install prompt runs.
        // PWAContext sets isStandalone upon completion, which auto-updates.
        // But if user cancelled/dismissed, let's apply temporary cooldown so we don't harass them.
        // We'll wait a bit then check standalone state.
        setTimeout(() => {
          const isNowStandalone =
            window.matchMedia('(display-mode: standalone)').matches ||
            (navigator as any).standalone;
          if (!isNowStandalone) {
            // User cancelled/dismissed native prompt, apply 3 day cooldown
            dismissTemporary();
          }
        }, 1000);
      } catch (err) {
        console.error('PWA install error:', err);
      }
    }
  };

  const shouldShowCTA =
    !isStandalone &&
    !isDismissed &&
    isMobile &&
    delayElapsed &&
    (platform === 'ios' || (platform === 'android' && isInstallable));

  return {
    platform,
    shouldShowCTA,
    showInstructions,
    setShowInstructions,
    dismissTemporary,
    dismissPermanent,
    handleInstallClick,
  };
};
