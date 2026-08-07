import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { requestForToken, onMessageListener } from '../firebase';
import { API_BASE_URL } from '../config';
import { useAuth } from './AuthContext';
import { toast } from 'sonner';

interface PWAContextType {
  isInstallable: boolean;
  isStandalone: boolean;
  isIOS: boolean;
  installApp: () => Promise<void>;
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
    (typeof window !== 'undefined' && 'Notification' in window)
      ? Notification.permission
      : 'default' as NotificationPermission
  );

  useEffect(() => {
    // Detect if running in standalone mode
    const checkStandalone = () => {
      const isStandaloneMode =
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as any).standalone ||
        document.referrer.includes('android-app://');
      setIsStandalone(!!isStandaloneMode);
    };

    // Detect iOS
    const checkIOS = () => {
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
      setIsIOS(ios);
    };

    checkStandalone();
    checkIOS();

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    const handleAppInstalled = () => {
      console.log('App was successfully installed');
      setIsStandalone(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);


  // Handle push token sync
  useEffect(() => {
    if (isAuthenticated && user) {
      console.log('[PWA] Checking notification state...');

      const hasToken = user.fcmTokens && user.fcmTokens.length > 0;

      if (notificationPermission === 'granted') {
        // Even if we have a token, we sync periodically or if forced
        syncPushToken();
      } else if (notificationPermission === 'default') {
        // Prioritize: if they haven't decided, prompt them every time until they do
        toast("Enable push notifications to get matches and messages on your phone!", {
          action: {
            label: "Enable Now",
            onClick: () => requestNotificationPermission(),
          },
          duration: 15000,
        });
      } else if (notificationPermission === 'denied' && !hasToken) {
        // If denied and we have no tokens, show a helpful message once per session
        const hasWarned = sessionStorage.getItem('notificationDeniedWarned');
        if (!hasWarned) {
          toast.error("Push notifications are blocked in your browser settings. You'll miss out on instant match alerts!", {
            duration: 6000,
          });
          sessionStorage.setItem('notificationDeniedWarned', 'true');
        }
      }
    }
  }, [isAuthenticated, user?.fcmTokens, notificationPermission]);

  // Handle periodic geolocation updates
  useEffect(() => {
    if (isAuthenticated && user) {
      const checkAndUpdateLocation = async () => {
        // Check if we already requested location this session to avoid nagging
        const hasRequested = sessionStorage.getItem('locationRequestedThisSession');

        if ('permissions' in navigator && (navigator.permissions as any).query) {
          try {
            const status = await (navigator.permissions as any).query({ name: 'geolocation' });
            if (status.state === 'denied') {
              console.log('Geolocation permission denied');
              return;
            }
            if (status.state === 'prompt' && hasRequested) {
              console.log('Geolocation in prompt state and already requested this session, skipping auto-prompt');
              return;
            }
          } catch (e) {
            console.error('Error checking geolocation permission:', e);
          }
        } else if (hasRequested) {
          // Fallback for browsers without permissions API
          return;
        }

        updateUserLocation();
        sessionStorage.setItem('locationRequestedThisSession', 'true');
      };

      const interval = setInterval(checkAndUpdateLocation, 1000 * 60 * 15); // Every 15 minutes
      checkAndUpdateLocation(); // Initial check/update
      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  // Listen for foreground messages
  useEffect(() => {
    const unsubscribe = onMessageListener((payload: any) => {
      toast(payload.notification.title, {
        description: payload.notification.body,
      });
    });

    return () => unsubscribe();
  }, []);

  const syncPushToken = async () => {
    // Avoid redundant syncs if already done recently
    const lastSync = localStorage.getItem('lastPushTokenSync');
    const now = Date.now();
    if (lastSync && now - parseInt(lastSync) < 1000 * 60 * 60 * 24) { // Sync at most once every 24h if token hasn't changed
      console.log('[PWA] Push token synced recently, skipping periodic sync');
      return;
    }

    console.log('[PWA] Starting syncPushToken...');
    try {
      let registration;
      if ('serviceWorker' in navigator) {
        registration = await navigator.serviceWorker.ready;
      }

      const token = await requestForToken(registration);
      if (token) {
        console.log('[PWA] FCM Token retrieved successfully, syncing with backend');
        const response = await fetch(`${API_BASE_URL}/users/push-token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
          },
          body: JSON.stringify({ token }),
        });

        if (response.ok) {
          console.log('Push token synced with backend successfully');
          localStorage.setItem('lastPushTokenSync', Date.now().toString());
        } else {
          const errorData = await response.json();
          console.error('Failed to sync push token with backend:', errorData);
        }
      } else {
        console.warn('No FCM token retrieved. Notifications may not work.');
      }
    } catch (error) {
      console.error('Error in syncPushToken:', error);
    }
  };

  const updateUserLocation = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          try {
            await fetch(`${API_BASE_URL}/users/location`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
              },
              body: JSON.stringify({ latitude, longitude }),
            });
          } catch (error) {
            console.error('Error updating location:', error);
          }
        },
        (error) => console.warn('Geolocation update failed:', error),
        { enableHighAccuracy: true }
      );
    }
  };

  const installApp = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
      setIsInstallable(false);
      setDeferredPrompt(null);
    }
  };

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      toast.error('This browser does not support notifications.');
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);

    if (permission === 'granted') {
      toast.success('Notifications enabled!');
      syncPushToken();
    } else if (permission === 'denied') {
      toast.error('Notification permission denied. Please enable them in settings.');
    }
  };

  return (
    <PWAContext.Provider
      value={{
        isInstallable,
        isStandalone,
        isIOS,
        installApp,
        notificationPermission,
        requestNotificationPermission,
      }}
    >
      {children}
    </PWAContext.Provider>
  );
};

export const usePWA = () => {
  const context = useContext(PWAContext);
  if (context === undefined) {
    throw new Error('usePWA must be used within a PWAProvider');
  }
  return context;
};
