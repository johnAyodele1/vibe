/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { API_BASE_URL } from '../config';
import { useAuth } from './AuthContext';
import { toast } from 'sonner';
import { syncDeviceRegistration, syncStandardUserPushRegistration } from '../lib/pwa/subscriptionManager';

export type InstallResult =
  | { status: 'accepted' }
  | { status: 'dismissed' }
  | { status: 'unavailable' }
  | { status: 'error' };

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface CustomWindow extends Window {
  _deferredInstallPrompt?: BeforeInstallPromptEvent | null;
  getPwaDiagnostics?: () => Record<string, unknown>;
  MSStream?: unknown;
}

interface CustomNavigator extends Navigator {
  standalone?: boolean;
  permissions: Permissions;
}

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
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default');

  const userId = user?._id;

  const getDiagnostics = useCallback(() => {
    const customWin = typeof window !== 'undefined' ? (window as CustomWindow) : null;
    return {
      protocol: typeof window !== 'undefined' ? window.location.protocol : '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      isStandalone,
      displayModeStandalone: typeof window !== 'undefined' ? window.matchMedia('(display-mode: standalone)').matches : false,
      serviceWorkerSupported: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
      serviceWorkerController: typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller,
      manifestUrl: '/manifest.json',
      notificationPermission,
      isInstallable,
      hasDeferredPrompt: !!(deferredPrompt || customWin?._deferredInstallPrompt),
    };
  }, [isStandalone, isInstallable, deferredPrompt, notificationPermission]);

  useEffect(() => {
    if (typeof window !== 'undefined') (window as CustomWindow).getPwaDiagnostics = getDiagnostics;
  }, [getDiagnostics]);

  useEffect(() => {
    const checkStandalone = () => {
      const customNav = navigator as CustomNavigator;
      const standalone = window.matchMedia('(display-mode: standalone)').matches || customNav.standalone || document.referrer.includes('android-app://');
      setIsStandalone(!!standalone);
    };
    const checkIOS = () => {
      const customWin = window as CustomWindow;
      setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent) && !customWin.MSStream);
    };
    checkStandalone();
    checkIOS();

    const customWin = window as CustomWindow;
    if (customWin._deferredInstallPrompt) {
      const promptObj = customWin._deferredInstallPrompt;
      setTimeout(() => {
        setDeferredPrompt(promptObj);
        setIsInstallable(true);
      }, 0);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      setDeferredPrompt(promptEvent);
      setIsInstallable(true);
      (window as CustomWindow)._deferredInstallPrompt = promptEvent;
    };
    const handleAppInstalled = () => {
      setIsStandalone(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
      (window as CustomWindow)._deferredInstallPrompt = null;
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !userId) return;
    const adultToken = localStorage.getItem('adultAccessToken');

    if (adultToken) {
      void syncDeviceRegistration(String(userId)).catch(err => console.error('[PWA] Adult push sync failed:', err));
      return;
    }

    if (notificationPermission === 'granted') {
      void syncStandardUserPushRegistration().catch(err => console.error('[PWA] Push sync failed:', err));
    }
  }, [isAuthenticated, userId, notificationPermission]);

  const updateUserLocation = useCallback(() => {
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
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !userId) return;
    const checkAndUpdateLocation = async () => {
      const hasRequested = sessionStorage.getItem('locationRequestedThisSession');
      if ('permissions' in navigator && navigator.permissions.query) {
        try {
          const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
          if (status.state === 'denied' || (status.state === 'prompt' && hasRequested)) return;
        } catch (e) {
          console.error('Error checking geolocation permission:', e);
        }
      } else if (hasRequested) return;
      updateUserLocation();
      sessionStorage.setItem('locationRequestedThisSession', 'true');
    };
    const interval = setInterval(checkAndUpdateLocation, 1000 * 60 * 15);
    void checkAndUpdateLocation();
    return () => clearInterval(interval);
  }, [isAuthenticated, userId, updateUserLocation]);

  const installApp = async (): Promise<InstallResult> => {
    const customWin = typeof window !== 'undefined' ? (window as CustomWindow) : null;
    const promptObj = deferredPrompt || customWin?._deferredInstallPrompt;
    if (!promptObj) return { status: 'unavailable' };
    try {
      await promptObj.prompt();
      const { outcome } = await promptObj.userChoice;
      if (outcome === 'accepted') {
        setIsInstallable(false);
        setDeferredPrompt(null);
        if (customWin) customWin._deferredInstallPrompt = null;
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
      if (adultToken && userId) await syncDeviceRegistration(String(userId));
      else await syncStandardUserPushRegistration();
      toast.success('Notifications enabled and connected.');
    } catch (error) {
      console.error('[PWA] Notification registration failed:', error);
      toast.error('Notifications were allowed, but this device could not be connected. Try again from Settings.');
    }
  };

  return <PWAContext.Provider value={{ isInstallable, isStandalone, isIOS, installApp, notificationPermission, requestNotificationPermission }}>{children}</PWAContext.Provider>;
};

export const usePWA = () => {
  const context = useContext(PWAContext);
  if (context === undefined) throw new Error('usePWA must be used within a PWAProvider');
  return context;
};
