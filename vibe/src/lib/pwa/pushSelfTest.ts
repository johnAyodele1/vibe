import { getInstallContext } from './context';
import { checkPushHealth } from './subscriptionManager';

export const runPushSelfTest = async (userId: string): Promise<'success' | 'failed' | 'skipped'> => {
  const ctx = getInstallContext();
  if (!ctx.isStandalone) return 'skipped';
  if (!('Notification' in window) || Notification.permission !== 'granted') return 'skipped';

  try {
    const health = await checkPushHealth(userId);
    return health.status === 'healthy' ? 'success' : 'failed';
  } catch (error) {
    console.error('[PushHealth] Background health check failed:', error);
    return 'failed';
  }
};

export const showPushSettingsDialog = () => {
  window.dispatchEvent(new CustomEvent('zippo:show_notif_settings'));
};
