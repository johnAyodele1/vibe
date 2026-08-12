const DEVICE_ID_KEY = 'zippo_device_id';

export const getOrCreateDeviceId = (): string => {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    // Generate once per browser install — persists in localStorage
    deviceId = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
    console.log('[Device] New deviceId created:', deviceId);
  }
  return deviceId;
};

export const clearDeviceId = (): void => {
  // Call on logout to ensure next user gets fresh deviceId
  localStorage.removeItem(DEVICE_ID_KEY);
  console.log('[Device] DeviceId cleared (logout)');
};
