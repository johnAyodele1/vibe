import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { requestForToken, onMessageListener } from '../firebase';
import { API_BASE_URL } from '../config';
import { useAuth } from './AuthContext';
import { toast } from 'sonner';

interface PWAContextType {
  isInstallable: boolean;
  installApp: () => Promise<void>;
  notificationPermission: NotificationPermission;
  requestNotificationPermission: () => Promise<void>;
}

const PWAContext = createContext<PWAContextType | undefined>(undefined);

export const PWAProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated, user } = useAuth();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    (typeof window !== 'undefined' && 'Notification' in window)
      ? Notification.permission
      : 'default' as NotificationPermission
  );

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  // Handle push token sync
  useEffect(() => {
    if (isAuthenticated) {
      // Attempt sync if granted or default (default may trigger browser prompt)
      if (notificationPermission === 'granted' || notificationPermission === 'default') {
        syncPushToken();
      }

      if (notificationPermission === 'default') {
        // Also suggest enabling notifications with a toast as a backup/clearer CTA
        const hasPrompted = sessionStorage.getItem('notificationPromptedThisSession');
        if (!hasPrompted) {
          toast("Enable notifications to stay updated!", {
            action: {
              label: "Enable",
              onClick: () => requestNotificationPermission(),
            },
          });
          sessionStorage.setItem('notificationPromptedThisSession', 'true');
        }
      }
    }
  }, [isAuthenticated, notificationPermission]);

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
    try {
      const token = await requestForToken();
      if (token) {
        console.log('FCM Token retrieved successfully');
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
