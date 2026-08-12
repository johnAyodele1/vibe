import { getOrCreateDeviceId, clearDeviceId } from './deviceId';
import { getInstallContext } from './context';
import { API_BASE_URL } from '../../config';
import { fetchVapidPublicKey, registerServiceWorker } from '../push/pushSubscription';

const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = window.atob(base64);
  return new Uint8Array(Array.from(raw).map(char => char.charCodeAt(0)));
};

export const initializeDevice = async (userId: string): Promise<void> => {
  const deviceId = getOrCreateDeviceId();
  const ctx      = getInstallContext();
  const token    = localStorage.getItem('adultAccessToken');

  if (!token) {
    console.log('[DeviceInit] No auth token found, skipping device init');
    return;
  }

  console.log('[DeviceInit] Initializing device for user:', {
    userId, deviceId, platform: ctx.isIOS ? 'ios' : ctx.isAndroid ? 'android' : 'desktop',
    isStandalone: ctx.isStandalone,
  });

  try {
    // Step 1: Get current device registration from backend
    const response = await fetch(`${API_BASE_URL}/v1/adult/push/current?deviceId=${deviceId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch current device: ${response.status}`);
    }

    const { device } = await response.json();

    console.log('[DeviceInit] Backend registration status:', {
      exists:      !!device,
      hasToken:    !!device?.endpoint,
      permission:  device?.notificationsEnabled,
      isActive:    device?.isActive,
    });

    // Step 2: Get current browser permission state
    const browserPermission = 'Notification' in window
      ? Notification.permission   // 'default' | 'granted' | 'denied'
      : 'unsupported';

    console.log('[DeviceInit] Browser notification permission:', browserPermission);

    // Step 3: Determine what action to take (spec decision tree)
    if (browserPermission === 'granted') {
      // Permission granted — ensure we have a valid subscription
      await ensureSubscriptionRegistered(userId, deviceId, ctx, device);

    } else if (browserPermission === 'default') {
      // Permission not yet asked
      // SPEC: show notification onboarding — but via user gesture, not here
      // Signal to UI that onboarding is needed
      const needsOnboarding = !device || !device.endpoint || !device.notificationsEnabled;
      if (needsOnboarding) {
        console.log('[DeviceInit] Device needs notification onboarding — dispatching event');
        window.dispatchEvent(new CustomEvent('zippo:needs_notification_onboarding', {
          detail: { userId, deviceId },
        }));
      }

    } else if (browserPermission === 'denied') {
      // SPEC: do not spam native permission dialog
      console.log('[DeviceInit] Notification permission denied — recording state');
      await fetch(`${API_BASE_URL}/v1/adult/push/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          deviceId,
          platform: ctx.isIOS ? 'ios' : ctx.isAndroid ? 'android' : 'desktop',
          isStandalone: ctx.isStandalone,
          notificationPermission: 'denied',
        })
      });

      // Show settings CTA only if backend had a token (was previously working but now revoked)
      if (device?.endpoint) {
        window.dispatchEvent(new CustomEvent('zippo:show_notif_settings'));
      }
    }
  } catch (err: any) {
    console.error('[DeviceInit] Device initialization failed:', err.message);
  }
};

// Ensure this device has a valid subscription when permission is already granted
// SPEC section 17: "permission = granted, device_id exists, backend registration = missing/invalid → register silently"
export const ensureSubscriptionRegistered = async (
  userId: string,
  deviceId: string,
  ctx: any,
  backendDevice: any
): Promise<void> => {
  console.log('[DeviceInit] Permission granted — ensuring subscription exists');
  const token = localStorage.getItem('adultAccessToken');

  if (!token) return;

  const registration = await registerServiceWorker();
  if (!registration) {
    console.warn('[DeviceInit] Could not register service worker');
    return;
  }

  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    // SPEC: "do not unnecessarily ask for permission again"
    // Permission is already granted — create subscription silently
    console.log('[DeviceInit] No subscription despite granted permission — creating silently');
    try {
      const activeVapidKey = await fetchVapidPublicKey();
      if (!activeVapidKey) {
        console.error('[DeviceInit] Dynamic VAPID public key missing. Aborting silent subscription.');
        return;
      }

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(activeVapidKey),
      });
      console.log('[DeviceInit] New subscription created:', {
        endpoint: subscription.endpoint.slice(0, 60),
      });
    } catch (err: any) {
      console.error('[DeviceInit] Failed to create subscription:', err.message);
      if (err.name === 'NotAllowedError') {
        // OS revoked permission without JS knowing — show settings CTA
        window.dispatchEvent(new CustomEvent('zippo:show_notif_settings'));
      }
      return;
    }
  }

  // Register/update device with current subscription on backend
  const response = await fetch(`${API_BASE_URL}/v1/adult/push/subscribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      deviceId,
      platform: ctx.isIOS ? 'ios' : ctx.isAndroid ? 'android' : 'desktop',
      isStandalone: ctx.isStandalone,
      subscription: subscription.toJSON(),
      notificationPermission: 'granted',
    })
  });

  const data = await response.json();
  console.log('[DeviceInit] Device registered:', {
    isNew:    data.isNew,
    replaced: data.replaced,
    notificationsEnabled: data.notificationsEnabled,
  });

  // Listen for subscription refresh
  // SPEC section 9: "must listen for token refresh events"
  try {
    const currentSub = await registration.pushManager.getSubscription();
    if (currentSub && currentSub.endpoint !== subscription.endpoint) {
      console.log('[DeviceInit] Push token rotated — updating backend');
      await fetch(`${API_BASE_URL}/v1/adult/push/token`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          deviceId,
          subscription: currentSub.toJSON(),
        })
      });
    }
  } catch (err: any) {
    console.error('[DeviceInit] Push token rotation check failed:', err.message);
  }
};

// Grant permission and register — called from user gesture (button tap)
export const requestAndRegisterPush = async (userId: string): Promise<boolean> => {
  const deviceId = getOrCreateDeviceId();
  const ctx      = getInstallContext();
  const token    = localStorage.getItem('adultAccessToken');

  console.log('[PushRequest] User tapped enable notifications:', {
    userId, deviceId, platform: ctx.isIOS ? 'ios' : 'android/desktop',
    isStandalone: ctx.isStandalone,
  });

  // iOS non-standalone → redirect to install flow
  if (ctx.isIOS && !ctx.isStandalone) {
    console.log('[PushRequest] iOS non-standalone — showing install guide first');
    window.dispatchEvent(new CustomEvent('zippo:show_install_guide'));
    return false;
  }

  // Request permission (must be synchronous call from user gesture)
  const permission = await Notification.requestPermission();
  console.log('[PushRequest] Permission result:', permission);

  if (permission !== 'granted') {
    if (token) {
      // Update backend with denied state
      await fetch(`${API_BASE_URL}/v1/adult/push/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          deviceId,
          platform: ctx.isIOS ? 'ios' : ctx.isAndroid ? 'android' : 'desktop',
          isStandalone: ctx.isStandalone,
          notificationPermission: permission,
        })
      });
    }
    return false;
  }

  // Permission granted — create subscription and register
  await ensureSubscriptionRegistered(userId, deviceId, ctx, null);
  return true;
};

// Logout: remove THIS device only
// SPEC section 7: never DELETE all devices for user
export const deregisterCurrentDevice = async (): Promise<void> => {
  const deviceId = getOrCreateDeviceId();
  const token    = localStorage.getItem('adultAccessToken');

  console.log('[DeviceLogout] Deregistering device:', deviceId);

  if (token) {
    try {
      await fetch(`${API_BASE_URL}/v1/adult/push/subscribe`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ deviceId }),
      });
      console.log('[DeviceLogout] Device removed from backend');
    } catch (err: any) {
      console.error('[DeviceLogout] Failed to deregister (non-fatal):', err.message);
    }
  }

  clearDeviceId();
  console.log('[DeviceLogout] DeviceId cleared');
};
