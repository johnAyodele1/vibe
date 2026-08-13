import { getInstallContext } from './context';
import { API_BASE_URL } from '../../config';
import { toast } from 'sonner';

const WELCOME_KEYS = {
  lastWelcomeAt: 'zippo_last_welcome_at',
};
const WELCOME_INTERVAL_MS = 8 * 60 * 60 * 1000;  // 8 hours between welcomes

let lastTestCallTime = 0;
const MIN_TEST_INTERVAL_MS = 5000; // 5 seconds debounce

export const tryWelcomeBack = async (_userId: string): Promise<void> => {
  const ctx = getInstallContext();

  // Debounce check — 5s minimum between actual test calls to prevent spamming
  const now = Date.now();
  if (now - lastTestCallTime < MIN_TEST_INTERVAL_MS) {
    console.log('[Welcome] Debounced — less than 5 seconds since last call');
    return;
  }
  lastTestCallTime = now;

  // Only in standalone PWA
  if (!ctx.isStandalone) return;

  // Only when permission granted
  if (Notification.permission !== 'granted') return;

  // Check interval — don't send too often
  const lastAt = parseInt(localStorage.getItem(WELCOME_KEYS.lastWelcomeAt) || '0', 10);
  if (lastAt && (Date.now() - lastAt) < WELCOME_INTERVAL_MS) {
    console.log('[Welcome] Too soon — skipping welcome back');
    return;
  }

  console.log('[Welcome] Sending welcome back notification...');

  try {
    const token = localStorage.getItem('adultAccessToken') || localStorage.getItem('accessToken');
    const response = await fetch(`${API_BASE_URL}/v1/adult/push/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ isReopen: true })
    });

    const data = await response.json();
    const anySuccess = data.results?.some((r: any) => r.success);

    if (anySuccess) {
      localStorage.setItem(WELCOME_KEYS.lastWelcomeAt, String(Date.now()));
      console.log('[Welcome] Welcome back notification sent successfully');
      // Reset self-test fail count since we know push is working
      localStorage.removeItem('zippo_push_test_fail_count');
    } else {
      console.warn('[Welcome] Welcome back failed:', data.results);
      // Increment fail count
      const failCount = parseInt(localStorage.getItem('zippo_push_test_fail_count') || '0', 10) + 1;
      localStorage.setItem('zippo_push_test_fail_count', String(failCount));

      if (failCount >= 3) {
        toast.warning('Notifications may not be working. Check your device settings.');
      }
    }
  } catch (err: any) {
    console.error('[Welcome] Request failed:', err.message);
  }
};
