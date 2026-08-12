import { useState, useEffect } from 'react';
import { usePWA } from '../../../contexts/PWAContext';
import { usePWAPromptStore } from '../../../store/pwaPromptStore';

export type InstallPlatform = 'ios' | 'android' | 'desktop' | 'unsupported';

export const usePWAInstall = () => {
  const { isInstallable, isStandalone, isIOS, installApp } = usePWA();
  const { showInstallPrompt, dismissInstallPrompt } = usePWAPromptStore();

  const [platform, setPlatform] = useState<InstallPlatform>('unsupported');
  const [isDismissed, setIsDismissed] = useState(false);
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

  // 2. Defensive non-intrusive 2-second delay on first load
  useEffect(() => {
    const timer = setTimeout(() => {
      setDelayElapsed(true);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  // 3. Temporary dismissal (3 days cooldown)
  const dismissTemporary = () => {
    const cooldownMs = 3 * 24 * 60 * 60 * 1000; // 3 days
    localStorage.setItem('zippo_pwa_dismiss_until', (Date.now() + cooldownMs).toString());
    setIsDismissed(true);
    dismissInstallPrompt();
  };

  // 4. Permanent dismissal
  const dismissPermanent = () => {
    localStorage.setItem('zippo_pwa_dismiss_permanent', 'true');
    setIsDismissed(true);
    dismissInstallPrompt();
  };

  // 6. Handle CTA action tap
  const handleInstallClick = async () => {
    if (platform === 'ios') {
      setShowInstructions(true);
    } else if (platform === 'android') {
      try {
        const result = await installApp();
        if (result.status === 'accepted') {
          // Success! State is fully updated by PWAContext's appinstalled event
        } else if (result.status === 'dismissed') {
          // User dismissed native prompt, apply temporary cooldown so we don't harass them.
          dismissTemporary();
        }
      } catch (err) {
        console.error('PWA install error:', err);
      }
    }
  };

  // Android MUST only show CTA if isInstallable is true (meaning native prompt is ready and cached)
  // Objective 6: platform === 'android' && isInstallable
  const shouldShowCTA =
    showInstallPrompt &&
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
