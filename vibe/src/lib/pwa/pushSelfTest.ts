import { getInstallContext } from './context';
import { checkPushHealth, sendPushTest } from './subscriptionManager';

export type PushSelfTestResult = 'success' | 'failed' | 'skipped';

let activeSelfTest: Promise<PushSelfTestResult> | null = null;

export const runPushSelfTest = async (userId: string, options?: { silent?: boolean }): Promise<PushSelfTestResult> => {
  if (activeSelfTest) return activeSelfTest;

  activeSelfTest = (async () => {
    const ctx = getInstallContext();
    if (ctx.isIOS && !ctx.isStandalone) return 'skipped';
    if (!('Notification' in window) || Notification.permission !== 'granted') return 'skipped';

    try {
      const health = await checkPushHealth(userId);

      if (health.status === 'healthy') return 'success';

      if (health.status === 'verification_required') {
        const result = await sendPushTest(userId, { silent: options?.silent ?? true });
        return result.success && result.deviceReceived ? 'success' : 'failed';
      }

      return 'failed';
    } catch (error) {
      console.error('[PushHealth] Self-test failed:', error);
      return 'failed';
    }
  })();

  try {
    return await activeSelfTest;
  } finally {
    activeSelfTest = null;
  }
};

export const showPushSettingsDialog = () => {
  window.dispatchEvent(new CustomEvent('zippo:show_notif_settings'));
};
