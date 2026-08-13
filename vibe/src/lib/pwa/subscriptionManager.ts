// vibe/src/lib/pwa/subscriptionManager.ts
import { API_BASE_URL } from '../../config';
import { getInstallContext } from './context';
import { getOrCreateDeviceId, clearDeviceId, cacheDeviceIdForSW } from './deviceId';

export type PushHealthStatus =
  | 'unsupported'
  | 'permission_required'
  | 'permission_denied'
  | 'service_worker_unavailable'
  | 'missing_subscription'
  | 'backend_missing'
  | 'healthy'
  | 'error';

export interface PushHealthResult {
  status: PushHealthStatus;
  permission: NotificationPermission | 'unsupported';
  deviceId: string;
  hasBrowserSubscription: boolean;
  backendRegistered: boolean;
  repaired: boolean;
  detail?: string;
}

const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return new Uint8Array(Array.from(raw).map(char => char.charCodeAt(0)));
};

export const fetchVapidPublicKey = async (): Promise<string | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/v1/adult/push/public-key`);
    if (!response.ok) throw new Error(`Failed to fetch VAPID public key: ${response.status}`);
    const data = await response.json();
    return data?.success && data.publicKey ? data.publicKey : null;
  } catch (err) {
    console.error('[Push] Error fetching dynamic VAPID public key:', err);
    return null;
  }
};

const authHeaders = (token: string) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
});

const registerDevice = async (
  token: string,
  deviceId: string,
  notificationPermission: NotificationPermission | 'unsupported',
  subscription?: PushSubscription,
): Promise<boolean> => {
  const ctx = getInstallContext();
  const platform = ctx.isIOS ? 'ios' : ctx.isAndroid ? 'android' : 'desktop';

  const response = await fetch(`${API_BASE_URL}/v1/adult/devices/register`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      deviceId,
      platform,
      isStandalone: ctx.isStandalone,
      notificationPermission,
      ...(subscription ? { subscription: subscription.toJSON() } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`Device registration failed: ${response.status}`);
  }

  return true;
};

const getCurrentDevice = async (token: string, deviceId: string) => {
  const response = await fetch(
    `${API_BASE_URL}/v1/adult/push/current?deviceId=${encodeURIComponent(deviceId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!response.ok) return null;
  const data = await response.json();
  return data?.device ?? null;
};

/**
 * Ensures this browser's current PushSubscription is represented by the backend.
 * This is intentionally idempotent and safe to call on every authenticated app launch.
 */
export const syncDeviceRegistration = async (userId: string): Promise<void> => {
  void userId;
  const deviceId = getOrCreateDeviceId();
  const ctx = getInstallContext();
  const permission = 'Notification' in window ? Notification.permission : 'unsupported';
  const token = localStorage.getItem('adultAccessToken');

  if (!token) return;
  await cacheDeviceIdForSW(deviceId).catch(() => {});

  if (permission !== 'granted') {
    await registerDevice(token, deviceId, permission).catch(err =>
      console.error('[Push] Basic device registration failed:', err),
    );

    if (permission === 'default') {
      window.dispatchEvent(new CustomEvent('zippo:needs_push_onboarding', {
        detail: { userId, deviceId },
      }));
    }
    return;
  }

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('[Push] Service workers or Push API unavailable');
    return;
  }

  const reg = await navigator.serviceWorker.ready;
  const vapidKey = await fetchVapidPublicKey();
  if (!vapidKey) return;

  let sub = await reg.pushManager.getSubscription();

  // If the backend knows a different endpoint, the browser subscription is stale
  // from the application's perspective. Renew it rather than keeping a dead record.
  if (sub) {
    const device = await getCurrentDevice(token, deviceId);
    const backendEndpoint = device?.endpoint ?? device?.pushEndpoint;

    if (backendEndpoint && backendEndpoint !== sub.endpoint) {
      console.warn('[Push] Backend/browser endpoints differ; renewing subscription');
      await sub.unsubscribe().catch(() => {});
      sub = null;
    }
  }

  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    } catch (err: any) {
      // A stale applicationServerKey can make subscribe fail. Remove the old
      // browser subscription once, then retry with the current server key.
      const oldSub = await reg.pushManager.getSubscription().catch(() => null);
      if (oldSub) await oldSub.unsubscribe().catch(() => {});

      try {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
      } catch (retryErr) {
        console.error('[Push] Subscription creation failed:', err, retryErr);
        return;
      }
    }
  }

  if (!sub?.endpoint?.startsWith('https://')) {
    console.error('[Push] Refusing invalid push endpoint');
    return;
  }

  await registerDevice(token, deviceId, 'granted', sub);
  console.log('[Push] Device registration healthy:', { deviceId, endpoint: sub.endpoint.slice(0, 60) });
};

/**
 * Runs a local + backend health check and repairs missing/stale subscriptions.
 * It does not send a notification. Use sendPushTest() when an actual delivery test
 * is requested by the user.
 */
export const checkPushHealth = async (userId: string): Promise<PushHealthResult> => {
  const deviceId = getOrCreateDeviceId();
  const permission: PushHealthResult['permission'] =
    'Notification' in window ? Notification.permission : 'unsupported';

  const base = {
    deviceId,
    permission,
    hasBrowserSubscription: false,
    backendRegistered: false,
    repaired: false,
  };

  if (permission === 'unsupported') return { ...base, status: 'unsupported' };
  if (permission === 'denied') return { ...base, status: 'permission_denied' };
  if (permission === 'default') return { ...base, status: 'permission_required' };
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ...base, status: 'service_worker_unavailable' };
  }

  const token = localStorage.getItem('adultAccessToken');
  if (!token) return { ...base, status: 'error', detail: 'Authentication required' };

  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    let repaired = false;

    if (!sub) {
      await syncDeviceRegistration(userId);
      sub = await reg.pushManager.getSubscription();
      repaired = !!sub;
    }

    if (!sub) {
      return { ...base, status: 'missing_subscription', repaired };
    }

    const device = await getCurrentDevice(token, deviceId);
    const backendEndpoint = device?.endpoint ?? device?.pushEndpoint;

    if (!device || !device.isActive || !backendEndpoint || backendEndpoint !== sub.endpoint) {
      await syncDeviceRegistration(userId);
      const refreshed = await getCurrentDevice(token, deviceId);
      const refreshedEndpoint = refreshed?.endpoint ?? refreshed?.pushEndpoint;

      repaired = true;
      if (!refreshed || refreshedEndpoint !== sub.endpoint) {
        return {
          ...base,
          status: 'backend_missing',
          hasBrowserSubscription: true,
          backendRegistered: false,
          repaired,
        };
      }
    }

    return {
      ...base,
      status: 'healthy',
      hasBrowserSubscription: true,
      backendRegistered: true,
      repaired,
    };
  } catch (err: any) {
    console.error('[Push] Health check failed:', err);
    return { ...base, status: 'error', detail: err?.message || 'Unknown push error' };
  }
};

/**
 * Performs a real provider delivery test after repairing the current device.
 * The backend's 404/410 handling removes stale subscriptions automatically.
 */
export const sendPushTest = async (userId: string): Promise<{
  success: boolean;
  status: PushHealthStatus;
  deliveredToProvider: boolean;
  reason?: string;
}> => {
  const health = await checkPushHealth(userId);

  if (health.status !== 'healthy') {
    return {
      success: false,
      status: health.status,
      deliveredToProvider: false,
      reason: health.detail || `Push is not healthy: ${health.status}`,
    };
  }

  const token = localStorage.getItem('adultAccessToken');
  if (!token) {
    return { success: false, status: 'error', deliveredToProvider: false, reason: 'Authentication required' };
  }

  try {
    const response = await fetch(`${API_BASE_URL}/v1/adult/push/test`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ deviceId: health.deviceId }),
    });

    const data = await response.json();
    const deliveredToProvider = Array.isArray(data?.results)
      ? data.results.some((result: any) => result.success === true)
      : false;

    if (!response.ok || !deliveredToProvider) {
      return {
        success: false,
        status: 'error',
        deliveredToProvider,
        reason: data?.reason || 'Push provider rejected the notification',
      };
    }

    return {
      success: true,
      status: 'healthy',
      deliveredToProvider: true,
    };
  } catch (err: any) {
    return {
      success: false,
      status: 'error',
      deliveredToProvider: false,
      reason: err?.message || 'Network error while testing push',
    };
  }
};

export const deregisterDevice = async (): Promise<void> => {
  const deviceId = getOrCreateDeviceId();
  const token = localStorage.getItem('adultAccessToken');

  if (token) {
    await fetch(`${API_BASE_URL}/v1/adult/devices/current`, {
      method: 'DELETE',
      headers: authHeaders(token),
      body: JSON.stringify({ deviceId }),
    }).catch(err => console.error('[Device] Deregister failed:', err));
  }

  clearDeviceId();
};

/** Must be called from a direct user gesture. */
export const requestAndSubscribe = async (userId: string): Promise<boolean> => {
  const ctx = getInstallContext();

  if (ctx.isIOS && !ctx.isStandalone) {
    window.dispatchEvent(new CustomEvent('zippo:show_install_guide'));
    return false;
  }

  if (!('Notification' in window)) return false;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    await syncDeviceRegistration(userId);
    return false;
  }

  await syncDeviceRegistration(userId);
  const health = await checkPushHealth(userId);
  return health.status === 'healthy';
};
