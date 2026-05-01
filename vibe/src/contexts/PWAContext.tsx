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
    typeof window !== 'undefined' ? Notification.permission : 'default'
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
    if (isAuthenticated && notificationPermission === 'granted') {
      syncPushToken();
    }
  }, [isAuthenticated, notificationPermission]);

  // Handle periodic geolocation updates
  useEffect(() => {
    if (isAuthenticated && user) {
      const interval = setInterval(updateUserLocation, 1000 * 60 * 15); // Every 15 minutes
      updateUserLocation(); // Initial update
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
    const token = await requestForToken();
    if (token) {
      try {
        await fetch(`${API_BASE_URL}/users/push-token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
          },
          body: JSON.stringify({ token }),
        });
      } catch (error) {
        console.error('Error syncing push token:', error);
      }
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
