import { syncDeviceRegistration, syncStandardUserPushRegistration } from './subscriptionManager';

export const syncPushSubscription = async (userId: string): Promise<void> => {
  if (localStorage.getItem('adultAccessToken')) {
    await syncDeviceRegistration(userId);
    return;
  }

  await syncStandardUserPushRegistration();
};
