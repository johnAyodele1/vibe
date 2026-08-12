// vibe/src/components/pwa/NotificationPrompt.tsx
// Show this card inside the installed PWA, after the user is settled

import { useState, useEffect } from 'react';
import { getInstallContext } from '../../lib/pwa/context';
import { registerServiceWorker } from '../../lib/push/pushSubscription';
import AddToHomeScreenHint from './AddToHomeScreenHint';
import { usePWAPromptStore, NOTIF_KEYS } from '../../store/pwaPromptStore';
import { runPushSelfTest } from '../../lib/pwa/pushSelfTest';
import { syncPushSubscription } from '../../lib/pwa/subscriptionSync';
import { toast } from 'sonner';

const NotificationPrompt = ({ userId }: { userId: string }) => {
  const { showNotifPrompt, setShowNotifPrompt, setShowInstallPrompt } = usePWAPromptStore();
  const [ctx,       setCtx]       = useState<ReturnType<typeof getInstallContext> | null>(null);
  const [visible,   setVisible]   = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [result,    setResult]    = useState<'granted' | 'denied' | null>(null);

  useEffect(() => {
    const context = getInstallContext();
    setCtx(context);

    if (Notification.permission === 'granted') {
      const failCount = parseInt(localStorage.getItem('zippo_push_test_fail_count') || '0', 10);
      if (failCount >= 3) {
        window.dispatchEvent(new CustomEvent('zippo:show_notif_settings'));
      }
    }
  }, []);

  useEffect(() => {
    if (showNotifPrompt) {
      setVisible(true);
    } else {
      setVisible(false);
    }
  }, [showNotifPrompt]);

  const handleEnable = async () => {
    if (!ctx) return;
    console.log('[NotifPrompt] Enable tapped:', {
      isStandalone: ctx.isStandalone,
      isIOS:        ctx.isIOS,
      isAndroid:    ctx.isAndroid,
    });

    // ── iOS Safari NON-STANDALONE ────────────────────────────────────
    if (ctx.isIOS && !ctx.isStandalone) {
      console.log('[NotifPrompt] iOS non-standalone — redirecting to install flow');

      // Close notification prompt
      setVisible(false);
      setShowNotifPrompt(false);

      // Show install prompt immediately
      setShowInstallPrompt(true);

      // Show an explanatory toast
      toast.info(
        'Add Zippo to your Home Screen first, then you can enable notifications.',
        { duration: 5000 }
      );
      return;
    }

    // ── ANDROID WEB (NON-STANDALONE) ────────────────────────────────
    if (ctx.isAndroid && !ctx.isStandalone) {
      console.log('[NotifPrompt] Android web — proceeding with permission request');
      // Android Chrome supports push even without PWA install
      // Fall through to permission request below
      // But also suggest installing
      toast.info('Install Zippo to your home screen for the best experience', { duration: 3000 });
    }

    // ── REQUEST PERMISSION (works for standalone + Android web) ─────
    setLoading(true);
    try {
      // Step 1: register service worker
      const reg = await registerServiceWorker();
      if (!reg) {
        console.error('[NotifPrompt] SW registration failed');
        setLoading(false);
        return;
      }

      // Step 2: request permission
      console.log('[NotifPrompt] Requesting notification permission...');
      const permission = await Notification.requestPermission();
      console.log('[NotifPrompt] Permission result:', permission);

      if (permission === 'granted') {
        // Sync subscription silently using complete lifecycle flow
        await syncPushSubscription(userId);
        setResult('granted');

        // Immediately run auto-test (Fix 4)
        await runPushSelfTest(userId);
        setTimeout(() => {
          setVisible(false);
          setShowNotifPrompt(false);
        }, 2000);
      } else {
        console.warn('[NotifPrompt] Permission denied by user');
        setResult('denied');
        setTimeout(() => {
          setVisible(false);
          setShowNotifPrompt(false);
        }, 3000);
      }
    } catch (err: any) {
      console.error('[NotifPrompt] Permission request error:', err.message || err);
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(NOTIF_KEYS.dismissed, '1');
    sessionStorage.setItem(NOTIF_KEYS.shownThisSession, '1');
    setShowNotifPrompt(false);
    setVisible(false);
  };

  if (!visible || !ctx) return null;

  // If user is on iOS but NOT in standalone mode → show "add to home screen" hint instead
  if (ctx.isIOS && !ctx.isStandalone) {
    return <AddToHomeScreenHint onDismiss={handleDismiss} />;
  }

  // If iOS < 16.4 → push not supported, don't show anything
  if (ctx.isIOS && ctx.iOSVersion && ctx.iOSVersion < 16.4) {
    return null;
  }

  return (
    <div className="notif-prompt" data-testid="notification-prompt">
      {result === 'granted' ? (
        <div className="notif-prompt__success">
          <span className="notif-prompt__success-icon">✅</span>
          <p>Notifications enabled! You'll get alerts for messages and activity.</p>
        </div>
      ) : result === 'denied' ? (
        <div className="notif-prompt__denied">
          <span>🔕</span>
          <p>Notifications blocked. You can enable them in your device Settings → Notifications.</p>
          <button className="notif-prompt__dismiss" onClick={handleDismiss}>OK</button>
        </div>
      ) : (
        <>
          <div className="notif-prompt__icon">🔔</div>
          <div className="notif-prompt__text">
            <strong>Stay in the loop</strong>
            <p>Get notified for new messages, tips, and activity.</p>
          </div>
          <div className="notif-prompt__actions">
            <button
              className="notif-prompt__enable"
              onClick={handleEnable}
              disabled={loading}
            >
              {loading ? 'Enabling...' : 'Enable'}
            </button>
            <button
              className="notif-prompt__dismiss"
              onClick={handleDismiss}
            >
              Not now
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default NotificationPrompt;
