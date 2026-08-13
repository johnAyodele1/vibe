// vibe/src/components/pwa/NotificationPrompt.tsx

import { useState, useEffect } from 'react';
import { getInstallContext } from '../../lib/pwa/context';
import AddToHomeScreenHint from './AddToHomeScreenHint';
import { usePWAPromptStore, NOTIF_KEYS } from '../../store/pwaPromptStore';
import { syncStandardUserPushRegistration } from '../../lib/pwa/subscriptionManager';
import { toast } from 'sonner';

const NotificationPrompt = ({ userId }: { userId: string }) => {
  const { showNotifPrompt, setShowNotifPrompt, setShowInstallPrompt } = usePWAPromptStore();
  const [ctx, setCtx] = useState<ReturnType<typeof getInstallContext> | null>(null);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<'granted' | 'denied' | null>(null);

  useEffect(() => setCtx(getInstallContext()), []);
  useEffect(() => setVisible(showNotifPrompt), [showNotifPrompt]);

  const handleEnable = async () => {
    if (!ctx) return;

    if (ctx.isIOS && !ctx.isStandalone) {
      setVisible(false);
      setShowNotifPrompt(false);
      setShowInstallPrompt(true);
      toast.info('Add Zippo to your Home Screen first, then enable notifications.', { duration: 5000 });
      return;
    }

    if (ctx.isAndroid && !ctx.isStandalone) {
      toast.info('Install Zippo to your home screen for the best experience', { duration: 3000 });
    }

    setLoading(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setResult('denied');
        return;
      }

      await syncStandardUserPushRegistration();
      setResult('granted');
      toast.success('Notifications are enabled and connected on this device.');
      setTimeout(() => {
        setVisible(false);
        setShowNotifPrompt(false);
      }, 2000);
    } catch (error: any) {
      console.error('[NotifPrompt] Push registration failed:', error);
      toast.error('Notifications were allowed, but this device could not be connected. Try again.');
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
  if (ctx.isIOS && !ctx.isStandalone) return <AddToHomeScreenHint onDismiss={handleDismiss} />;
  if (ctx.isIOS && ctx.iOSVersion && ctx.iOSVersion < 16.4) return null;

  return (
    <div className="notif-prompt" data-testid="notification-prompt">
      {result === 'granted' ? (
        <div className="notif-prompt__success"><span>OK</span><p>Notifications enabled. You'll get alerts for messages and activity.</p></div>
      ) : result === 'denied' ? (
        <div className="notif-prompt__denied"><span>Blocked</span><p>Notifications are blocked. Enable them in your browser settings.</p><button className="notif-prompt__dismiss" onClick={handleDismiss}>OK</button></div>
      ) : (
        <>
          <div className="notif-prompt__icon">Bell</div>
          <div className="notif-prompt__text"><strong>Stay in the loop</strong><p>Get notified for new messages, matches, and activity.</p></div>
          <div className="notif-prompt__actions">
            <button className="notif-prompt__enable" onClick={handleEnable} disabled={loading}>{loading ? 'Connecting...' : 'Enable'}</button>
            <button className="notif-prompt__dismiss" onClick={handleDismiss}>Not now</button>
          </div>
        </>
      )}
    </div>
  );
};

export default NotificationPrompt;
