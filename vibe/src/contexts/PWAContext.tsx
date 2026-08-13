import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { API_BASE_URL } from '../config';
import { useAuth } from './AuthContext';
import { toast } from 'sonner';
import { syncDeviceRegistration, syncStandardUserPushRegistration } from '../lib/pwa/subscriptionManager';

export type InstallResult =
  | { status: 'accepted' }
  | { status: 'dismissed' }
  | { status: 'unavailable' }
  | { status: 'error' };

interface PWAContextType {
  isInstallable: boolean;
  isStandalone: boolean;
  isIOS: boolean;
  installApp: () => Promise<InstallResult>;
  notificationPermission: NotificationPermission;
  requestNotificationPermission: () => Promise<void>;
}

const PWAContext = createContext<PWAContextType | undefined>(undefined);

export const PWAProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated, user } = useAuth();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );

  const getDiagnostics = () => ({
    protocol: typeof window !== 'undefined' ? window.location.protocol : '',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    isStandalone,
    displayModeStandalone: typeof window !== 'undefined' ? window.matchMedia('(display-mode: standalone)').matches : false,
    serviceWorkerSupported: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
    serviceWorkerController: typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller,
    manifestUrl: '/manifest.json',
    notificationPermission,
    isInstallable,
    hasDeferredPrompt: !!(deferredPrompt || (typeof window !== 'undefined' && (window as any)._deferredInstallPrompt))
  });

  useEffect(() => {
    if (typeof window !== 'undefined') (window as any).getPwaDiagnostics = getDiagnostics;
  }, [isStandalone, isInstallable, deferredPrompt, notificationPermission]);

  useEffect(() => {
    const checkStandalone = () => {
      const standalone = window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as any).standalone || document.referrer.includes('android-app://');
      setIsStandalone(!!standalone);
    };
    const checkIOS = () => setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream);

    checkStandalone();
    checkIOS();

    if ((window as any)._deferredInstallPrompt) {
      setDeferredPrompt((window as any)._deferredInstallPrompt);
      setIsInstallable(true);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
      (window as any)._deferredInstallPrompt = e;
    };

    const handleAppInstalled = () => {
      setIsStandalone(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
      (window as any)._deferredInstallPrompt = null;
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const adultToken = localStorage.getItem('adultAccessToken');
    if (adultToken) {
      void syncDeviceRegistration(String(user.id)).catch(err => console.error('[PWA] Adult push sync failed:', err));
      return;
    }

    if (notificationPermission === 'granted') {
      void syncStandardUserPushRegistration().catch(err => console.error('[PWA] Push sync failed:', err));
    } else if (notificationPermission === 'default') {
      toast('Enable push notifications to get matches and messages on your phone!', {
        action: { label: 'Enable Now', onClick: () => requestNotificationPermission() },
        duration: 15000,
      });
    } else {
      const hasWarned = sessionStorage.getItem('notificationDeniedWarned');
      if (!hasWarned) {
        toast.error("Push notifications are blocked in your browser settings.", { duration: 6000 });
        sessionStorage.setItem('notificationDeniedWarned', 'true');
      }
    }
  }, [isAuthenticated, user?.id, notificationPermission]);

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const checkAndUpdateLocation = async () => {
      const hasRequested = sessionStorage.getItem('locationRequestedThisSession');
      if ('permissions' in navigator && (navigator.permissions as any).query) {
        try {
          const status = await (navigator.permissions as any).query({ name: 'geolocation' });
          if (status.state === 'denied' || (status.state === 'prompt' && hasRequested)) return;
        } catch (e) {
          console.error('Error checking geolocation permission:', e);
        }
      } else if (hasRequested) return;
      updateUserLocation();
      sessionStorage.setItem('locationRequestedThisSession', 'true');
    };

    const interval = setInterval(checkAndUpdateLocation, 1000 * 60 * 15);
    checkAndUpdateLocation();
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const updateUserLocation = () => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(async position => {
      const { latitude, longitude } = position.coords;
      try {
        await fetch(`${API_BASE_URL}/users/location`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
          body: JSON.stringify({ latitude, longitude }),
        });
      } catch (error) {
        console.error('Error updating location:', error);
      }
    }, error => console.warn('Geolocation update failed:', error), { enableHighAccuracy: true });
  };

  const installApp = async (): Promise<InstallResult> => {
    const promptObj = deferredPrompt || (typeof window !== 'undefined' && (window as any)._deferredInstallPrompt);
    if (!promptObj) return { status: 'unavailable' };
    try {
      promptObj.prompt();
      const { outcome } = await promptObj.userChoice;
      if (outcome === 'accepted') {
        setIsInstallable(false);
        setDeferredPrompt(null);
        (window as any)._deferredInstallPrompt = null;
        return { status: 'accepted' };
      }
      return { status: 'dismissed' };
    } catch (err) {
      console.error('[PWA] Install prompt error:', err);
      return { status: 'error' };
    }
  };

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      toast.error('This browser does not support notifications.');
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);

    if (permission !== 'granted') {
      if (permission === 'denied') toast.error('Notification permission denied. Please enable it in browser settings.');
      return;
    }

    try {
      const adultToken = localStorage.getItem('adultAccessToken');
      if (adultToken && user) {
        await syncDeviceRegistration(String(user.id));
      } else {
        await syncStandardUserPushRegistration();
      }
      toast.success('Notifications enabled and connected.');
    } catch (error) {
      console.error('[PWA] Notification registration failed:', error);
      toast.error('Notifications were allowed, but this device could not be connected. Try again from Settings.');
    }
  };

  return (
    <PWAContext.Provider value={{ isInstallable, isStandalone, isIOS, installApp, notificationPermission, requestNotificationPermission }}>
      {children}
    </PWAContext.Provider>
  );
};

export const usePWA = () => {
  const context = useContext(PWAContext);
  if (context === undefined) throw new Error('usePWA must be used within a PWAProvider');
  return context;
};
