import { API_BASE_URL } from '../../config';
import { getInstallContext } from './context';
import { getOrCreateDeviceId, clearDeviceId, cacheDeviceIdForSW } from './deviceId';
import { toast } from 'sonner';

export type PushHealthStatus = 'unsupported' | 'permission_required' | 'permission_denied' | 'service_worker_unavailable' | 'missing_subscription' | 'backend_missing' | 'verification_required' | 'unhealthy' | 'healthy' | 'error';

export interface PushHealthResult {
  status: PushHealthStatus;
  permission: NotificationPermission | 'unsupported';
  deviceId: string;
  hasBrowserSubscription: boolean;
  backendRegistered: boolean;
  repaired: boolean;
  lastVerifiedAt?: string;
  lastSuccessfulPushAt?: string;
  pushHealthStatus?: 'unknown' | 'healthy' | 'unhealthy';
  detail?: string;
}

const PUSH_VERIFICATION_MAX_AGE_MS = 30 * 60 * 1000;
const urlBase64ToUint8Array = (value: string): Uint8Array => {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const raw = window.atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return new Uint8Array(Array.from(raw).map(char => char.charCodeAt(0)));
};
const authHeaders = (token: string) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` });
const isAdultSession = () => Boolean(localStorage.getItem('adultAccessToken'));
const getAuthToken = () => localStorage.getItem('adultAccessToken') || localStorage.getItem('accessToken');
const getPlatform = () => { const ctx = getInstallContext(); return ctx.isIOS ? 'ios' : ctx.isAndroid ? 'android' : 'desktop'; };

export const fetchVapidPublicKey = async (): Promise<string | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/v1/adult/push/public-key`);
    if (!response.ok) throw new Error(`Failed to fetch VAPID public key: ${response.status}`);
    const data = await response.json();
    return data?.success && data.publicKey ? data.publicKey : null;
  } catch (error) {
    console.error('[Push] VAPID key lookup failed:', error);
    return null;
  }
};

const registerDevice = async (token: string, deviceId: string, permission: NotificationPermission | 'unsupported', subscription?: PushSubscription) => {
  const ctx = getInstallContext();
  const adult = isAdultSession();
  const endpoint = adult ? '/v1/adult/devices/register' : '/users/push/subscribe';
  const body = { deviceId, platform: getPlatform(), isStandalone: ctx.isStandalone, notificationPermission: permission, ...(subscription ? { subscription: subscription.toJSON() } : {}) };
  const response = await fetch(`${API_BASE_URL}${endpoint}`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Push device registration failed: ${response.status}`);
};

const getCurrentDevice = async (token: string, deviceId: string) => {
  const endpoint = isAdultSession() ? `/v1/adult/push/current?deviceId=${encodeURIComponent(deviceId)}` : `/users/push/subscribe/current?deviceId=${encodeURIComponent(deviceId)}`;
  const response = await fetch(`${API_BASE_URL}${endpoint}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) return null;
  const data = await response.json();
  return data?.device ?? null;
};

const syncCurrentSessionDevice = async (userId: string) => {
  const deviceId = getOrCreateDeviceId();
  const permission = 'Notification' in window ? Notification.permission : 'unsupported';
  const token = getAuthToken();
  if (!token) return;
  await cacheDeviceIdForSW(deviceId).catch(() => {});

  if (permission !== 'granted') {
    await registerDevice(token, deviceId, permission);
    if (permission === 'default') window.dispatchEvent(new CustomEvent('zippo:needs_push_onboarding', { detail: { userId, deviceId } }));
    return;
  }

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Push APIs are unavailable on this device');
  const registration = await navigator.serviceWorker.ready;
  const vapidKey = await fetchVapidPublicKey();
  if (!vapidKey) throw new Error('Push configuration is unavailable');

  let subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    const device = await getCurrentDevice(token, deviceId);
    const backendEndpoint = device?.endpoint ?? device?.pushEndpoint;
    if (backendEndpoint && backendEndpoint !== subscription.endpoint) {
      await subscription.unsubscribe().catch(() => {});
      subscription = null;
    }
  }

  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) });
    } catch (firstError) {
      const stale = await registration.pushManager.getSubscription().catch(() => null);
      if (stale) await stale.unsubscribe().catch(() => {});
      try {
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) });
      } catch (secondError) {
        console.error('[Push] Subscription creation failed:', firstError, secondError);
        throw new Error('This device could not create a push subscription');
      }
    }
  }

  if (!subscription.endpoint.startsWith('https://')) throw new Error('Invalid push subscription endpoint');
  await registerDevice(token, deviceId, 'granted', subscription);
};

export const syncDeviceRegistration = async (userId: string): Promise<void> => {
  if (!isAdultSession()) return;
  await syncCurrentSessionDevice(userId);
};

export const checkPushHealth = async (userId: string): Promise<PushHealthResult> => {
  const deviceId = getOrCreateDeviceId();
  const permission: PushHealthResult['permission'] = 'Notification' in window ? Notification.permission : 'unsupported';
  const base = { deviceId, permission, hasBrowserSubscription: false, backendRegistered: false, repaired: false };
  if (permission === 'unsupported') return { ...base, status: 'unsupported' };
  if (permission === 'denied') return { ...base, status: 'permission_denied' };
  if (permission === 'default') return { ...base, status: 'permission_required' };
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return { ...base, status: 'service_worker_unavailable' };
  const token = getAuthToken();
  if (!token) return { ...base, status: 'error', detail: 'Authentication required' };

  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    let repaired = false;
    if (!subscription) {
      await syncCurrentSessionDevice(userId);
      subscription = await registration.pushManager.getSubscription();
      repaired = Boolean(subscription);
    }
    if (!subscription) return { ...base, status: 'missing_subscription', repaired };

    let device = await getCurrentDevice(token, deviceId);
    const endpoint = device?.endpoint ?? device?.pushEndpoint;
    if (!device || !device.isActive || endpoint !== subscription.endpoint || !device.notificationsEnabled) {
      await syncCurrentSessionDevice(userId);
      device = await getCurrentDevice(token, deviceId);
      repaired = true;
    }
    const refreshedEndpoint = device?.endpoint ?? device?.pushEndpoint;
    const lastSuccessfulPushAt = device?.lastSuccessfulPushAt ? new Date(device.lastSuccessfulPushAt).toISOString() : undefined;
    const common = { ...base, hasBrowserSubscription: true, backendRegistered: Boolean(device?.isActive && device.notificationsEnabled && refreshedEndpoint === subscription.endpoint), repaired, lastVerifiedAt: device?.lastVerifiedAt ? new Date(device.lastVerifiedAt).toISOString() : undefined, lastSuccessfulPushAt, pushHealthStatus: device?.pushHealthStatus as PushHealthResult['pushHealthStatus'] };
    if (!device || !device.isActive || !device.notificationsEnabled || refreshedEndpoint !== subscription.endpoint) return { ...common, status: 'backend_missing' };
    if (device.pushHealthStatus === 'unhealthy') return { ...common, status: 'unhealthy' };
    if (!lastSuccessfulPushAt || Date.now() - new Date(lastSuccessfulPushAt).getTime() > PUSH_VERIFICATION_MAX_AGE_MS) return { ...common, status: 'verification_required' };
    return { ...common, status: 'healthy' };
  } catch (error: any) {
    console.error('[Push] Health check failed:', error);
    return { ...base, status: 'error', detail: error?.message || 'Unknown push error' };
  }
};

const waitForPushTestReceipt = async (token: string, deviceId: string, testId: string, onWaiting?: () => void, timeoutMs = 25_000, silent = false) => {
  onWaiting?.();
  if (!silent) toast.info('Test sent. Waiting for this device to receive it…', { duration: timeoutMs });
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await new Promise(resolve => window.setTimeout(resolve, 1000));
    const endpoint = isAdultSession() ? '/v1/adult/push/health-test/status' : '/users/push/health-test/status';
    const response = await fetch(`${API_BASE_URL}${endpoint}?deviceId=${encodeURIComponent(deviceId)}&testId=${encodeURIComponent(testId)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) continue;
    const data = await response.json();
    if (data.status === 'delivered') return true;
    if (data.status === 'failed' || data.status === 'expired') return false;
  }
  return false;
};

export const sendPushTest = async (userId: string, options?: { onWaiting?: () => void; silent?: boolean }): Promise<{ success: boolean; status: PushHealthStatus; deliveredToProvider: boolean; deviceReceived?: boolean; reason?: string }> => {
  const health = await checkPushHealth(userId);
  if (health.status !== 'healthy' && health.status !== 'verification_required') return { success: false, status: health.status, deliveredToProvider: false, reason: health.detail || `Push is not healthy: ${health.status}` };
  const token = getAuthToken();
  if (!token) return { success: false, status: 'error', deliveredToProvider: false, reason: 'Authentication required' };
  try {
    const endpoint = isAdultSession() ? '/v1/adult/push/health-test' : '/users/push/health-test';
    const response = await fetch(`${API_BASE_URL}${endpoint}`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ deviceId: health.deviceId }) });
    const data = await response.json();
    if (!response.ok || !data?.deliveredToProvider || !data?.testId) return { success: false, status: data?.status || 'error', deliveredToProvider: false, reason: data?.reason || 'Push provider rejected the notification' };
    const deviceReceived = await waitForPushTestReceipt(token, health.deviceId, data.testId, options?.onWaiting, 25_000, options?.silent);
    if (!deviceReceived) return { success: false, status: 'unhealthy', deliveredToProvider: true, deviceReceived: false, reason: 'The push provider accepted the notification, but this device did not confirm receipt within 25 seconds.' };
    return { success: true, status: 'healthy', deliveredToProvider: true, deviceReceived: true };
  } catch (error: any) {
    return { success: false, status: 'error', deliveredToProvider: false, reason: error?.message || 'Network error while testing push' };
  }
};

export const syncStandardUserPushRegistration = async (): Promise<void> => {
  if (isAdultSession()) return;
  await syncCurrentSessionDevice('standard-user');
};

export const deregisterDevice = async (): Promise<void> => {
  const deviceId = getOrCreateDeviceId();
  const token = getAuthToken();
  if (token) {
    const endpoint = isAdultSession() ? '/v1/adult/devices/current' : '/users/push/subscribe';
    await fetch(`${API_BASE_URL}${endpoint}`, { method: 'DELETE', headers: authHeaders(token), body: JSON.stringify({ deviceId }) }).catch(error => console.error('[Device] Deregister failed:', error));
  }
  clearDeviceId();
};

export const requestAndSubscribe = async (userId: string): Promise<boolean> => {
  const ctx = getInstallContext();
  if (ctx.isIOS && !ctx.isStandalone) {
    window.dispatchEvent(new CustomEvent('zippo:show_install_guide'));
    return false;
  }
  if (!('Notification' in window)) return false;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    await syncCurrentSessionDevice(userId).catch(error => console.error('[Push] Permission sync failed:', error));
    return false;
  }
  try {
    await syncCurrentSessionDevice(userId);
    // Subscription/registration succeeded. Verification is deliberately a
    // separate step so a stale persisted health state cannot block a fresh
    // permission grant from starting its real test.
    return true;
  } catch (error) {
    console.error('[Push] Subscribe/sync failed:', error);
    return false;
  }
};
