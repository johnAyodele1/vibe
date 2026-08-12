import { getInstallContext } from './context';
import { API_BASE_URL } from '../../config';
import { toast } from 'sonner';

const SELF_TEST_KEYS = {
  lastTestAt:    'zippo_push_test_last_at',
  failCount:     'zippo_push_test_fail_count',
  userRejected:  'zippo_push_user_rejected',
};

const TEST_INTERVAL_MS = 24 * 60 * 60 * 1000;  // test once per day max
const MAX_FAIL_COUNT   = 3;

export const runPushSelfTest = async (_userId: string): Promise<'success' | 'failed' | 'skipped'> => {
  const ctx = getInstallContext();

  // Only run in standalone PWA
  if (!ctx.isStandalone) {
    console.log('[PushTest] Not standalone — skipping self-test');
    return 'skipped';
  }

  // Not granted — no point testing
  if (Notification.permission !== 'granted') {
    console.log('[PushTest] Permission not granted — skipping');
    return 'skipped';
  }

  // User explicitly rejected — stop trying
  if (localStorage.getItem(SELF_TEST_KEYS.userRejected)) {
    console.log('[PushTest] User rejected — skipping');
    return 'skipped';
  }

  // Fail count exceeded
  const failCount = parseInt(localStorage.getItem(SELF_TEST_KEYS.failCount) || '0', 10);
  if (failCount >= MAX_FAIL_COUNT) {
    console.log('[PushTest] Max fail count reached — skipping:', { failCount });
    return 'skipped';
  }

  // Check interval
  const lastTestAt = parseInt(localStorage.getItem(SELF_TEST_KEYS.lastTestAt) || '0', 10);
  if (lastTestAt && (Date.now() - lastTestAt) < TEST_INTERVAL_MS) {
    console.log('[PushTest] Tested recently — skipping');
    return 'skipped';
  }

  console.log('[PushTest] Running push self-test...');
  localStorage.setItem(SELF_TEST_KEYS.lastTestAt, String(Date.now()));

  try {
    const response = await fetch(`${API_BASE_URL}/v1/adult/push/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
      },
      body: JSON.stringify({ isReopen: true })
    });

    const data = await response.json();
    console.log('[PushTest] Backend response:', data);

    const anySuccess = data.results?.some((r: any) => r.success);

    if (anySuccess) {
      console.log('[PushTest] SUCCESS — push is working');
      // Reset fail count
      localStorage.removeItem(SELF_TEST_KEYS.failCount);
      return 'success';
    } else {
      console.warn('[PushTest] FAILED — no successful sends:', data.results);
      const newCount = failCount + 1;
      localStorage.setItem(SELF_TEST_KEYS.failCount, String(newCount));

      if (newCount >= MAX_FAIL_COUNT) {
        // 3 fails — show toast and give up
        toast.error('Could not enable notifications. Check your device settings.', { duration: 6000 });
        console.log('[PushTest] Max fails reached — showing toast and stopping');
      } else {
        // Show OS settings dialog to help them fix it
        showPushSettingsDialog();
      }

      return 'failed';
    }
  } catch (err: any) {
    console.error('[PushTest] Self-test request failed:', err.message);
    return 'failed';
  }
};

// OS Settings guidance dialog — shown after push test fails
export const showPushSettingsDialog = () => {
  // Dispatch a custom event that a global component listens to
  window.dispatchEvent(new CustomEvent('zippo:show_notif_settings'));
};
