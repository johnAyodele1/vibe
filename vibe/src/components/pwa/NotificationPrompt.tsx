// vibe/src/components/pwa/NotificationPrompt.tsx
// Show this card ONCE, inside the installed PWA, after the user is settled

import { useState, useEffect } from 'react';
import { getInstallContext } from '../../lib/pwa/context';
import { registerServiceWorker, subscribeToPush } from '../../lib/push/pushSubscription';
import AddToHomeScreenHint from './AddToHomeScreenHint';

const DISMISSED_KEY = 'zippo_notif_prompt_dismissed';

const NotificationPrompt = ({ userId }: { userId: string }) => {
  const [ctx,       setCtx]       = useState<ReturnType<typeof getInstallContext> | null>(null);
  const [visible,   setVisible]   = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [result,    setResult]    = useState<'granted' | 'denied' | null>(null);

  useEffect(() => {
    const context = getInstallContext();
    setCtx(context);

    console.log('[NotifPrompt] Evaluating whether to show prompt:', context);

    // Only show if:
    // 1. Push is supported on this device OR it's iOS (so we can show the "Add to Home Screen" hint if not standalone)
    // 2. Permission not yet granted
    // 3. Not already dismissed this session
    const dismissed = sessionStorage.getItem(DISMISSED_KEY);

    const isIOSNonStandalone = context.isIOS && !context.isStandalone;
    const isEligibleForPrompt = context.pushSupportedOnThisDevice && context.notificationPermission === 'default';

    if (
      (isEligibleForPrompt || isIOSNonStandalone) &&
      !dismissed
    ) {
      // Show prompt after 5 seconds (let user settle in)
      const t = setTimeout(() => setVisible(true), 5000);
      return () => clearTimeout(t);
    }

    if (context.alreadyGranted) {
      // Already have permission — just (re)register subscription silently
      reRegisterSubscription();
    }
  }, []);

  const reRegisterSubscription = async () => {
    try {
      const reg = await registerServiceWorker();
      if (reg) await subscribeToPush(reg, userId);
    } catch (err) {
      console.error('[NotifPrompt] Re-registration failed:', err);
    }
  };

  // ── THIS IS THE KEY: called directly from a button tap ──────────────
  const handleEnable = async () => {
    console.log('[NotifPrompt] User tapped Enable Notifications button');
    setLoading(true);

    try {
      // Step 1: register service worker
      const reg = await registerServiceWorker();
      if (!reg) {
        console.error('[NotifPrompt] SW registration failed');
        setLoading(false);
        return;
      }

      // Step 2: request permission — MUST be in this synchronous click handler
      console.log('[NotifPrompt] Requesting notification permission...');
      const permission = await Notification.requestPermission();
      console.log('[NotifPrompt] Permission result:', permission);

      if (permission === 'granted') {
        // Step 3: subscribe to push
        const success = await subscribeToPush(reg, userId);
        console.log('[NotifPrompt] Push subscription:', success ? 'SUCCESS' : 'FAILED');
        setResult('granted');
        setTimeout(() => setVisible(false), 2000);
      } else {
        console.warn('[NotifPrompt] Permission denied by user');
        setResult('denied');
        setTimeout(() => setVisible(false), 3000);
      }
    } catch (err) {
      console.error('[NotifPrompt] Error during permission request:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISSED_KEY, '1');
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
