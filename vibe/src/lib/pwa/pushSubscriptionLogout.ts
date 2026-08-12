import { getOrCreateDeviceId, clearDeviceId } from './deviceId';
import { API_BASE_URL } from '../../config';

export const removePushSubscriptionOnLogout = async (): Promise<void> => {
  const deviceId = getOrCreateDeviceId();  // get before clearing
  console.log('[Push][Logout] Removing subscription for device:', deviceId);

  try {
    const token = localStorage.getItem('adultAccessToken') || localStorage.getItem('accessToken');
    // Tell backend to remove this device's subscription
    await fetch(`${API_BASE_URL}/v1/adult/push/subscribe`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ deviceId }),
    });
    console.log('[Push][Logout] Subscription removed from backend');
  } catch (err: any) {
    console.error('[Push][Logout] Failed to remove subscription:', err.message);
  }

  // Clear deviceId so next user on this device gets a fresh one
  clearDeviceId();
};
