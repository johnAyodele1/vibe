const DEVICE_ID_KEY = 'zippo_device_id';

export const cacheDeviceIdForSW = async (deviceId: string): Promise<void> => {
  try {
    if (typeof caches === 'undefined') return;
    const cache = await caches.open('zippo-device-v1');
    await cache.put('deviceId', new Response(deviceId));

    const token = localStorage.getItem('adultAccessToken') || localStorage.getItem('accessToken');
    if (token) await cache.put('token', new Response(token));
  } catch (err) {
    console.warn('[Cache] Failed to cache device details for SW:', err);
  }
};

export const getOrCreateDeviceId = (): string => {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(DEVICE_ID_KEY, id);
    console.log('[Device] New deviceId created:', id);
  }
  cacheDeviceIdForSW(id).catch(() => {});
  return id;
};

export const clearDeviceId = (): void => {
  localStorage.removeItem(DEVICE_ID_KEY);
  console.log('[Device] DeviceId cleared (logout)');
};
