import { useState, useEffect } from 'react';
import { getInstallContext } from '../../lib/pwa/context';
import AddToHomeScreenHint from './AddToHomeScreenHint';
import { usePWAPromptStore, NOTIF_KEYS } from '../../store/pwaPromptStore';
import { checkPushHealth, requestAndSubscribe, sendPushTest, type PushHealthResult } from '../../lib/pwa/subscriptionManager';
import { toast } from 'sonner';

const NotificationPrompt = ({ userId }: { userId: string }) => {
  const { showNotifPrompt, setShowNotifPrompt, setShowInstallPrompt } = usePWAPromptStore();
  const [ctx, setCtx] = useState<ReturnType<typeof getInstallContext> | null>(null);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'waiting' | 'sent' | 'failed'>('idle');
  const [health, setHealth] = useState<PushHealthResult | null>(null);
  const isSettingsTest = typeof window !== 'undefined' && window.location.hash === '#push-notifications';

  useEffect(() => setCtx(getInstallContext()), []);
  useEffect(() => setVisible(showNotifPrompt), [showNotifPrompt]);

  useEffect(() => {
    let cancelled = false;
    checkPushHealth(userId).then(currentHealth => {
      if (cancelled) return;
      setHealth(currentHealth);
      if (currentHealth.status === 'permission_required' || currentHealth.status === 'missing_subscription' || currentHealth.status === 'backend_missing' || currentHealth.status === 'unhealthy' || (currentHealth.status === 'healthy' && isSettingsTest)) setShowNotifPrompt(true);
      if (currentHealth.status === 'healthy' && !isSettingsTest) setShowNotifPrompt(false);
    }).catch(error => console.error('[NotifPrompt] Health check failed:', error));
    return () => { cancelled = true; };
  }, [userId, setShowNotifPrompt, isSettingsTest]);

  const handleEnable = async () => {
    if (!ctx) return;
    if (ctx.isIOS && !ctx.isStandalone) {
      setVisible(false);
      setShowNotifPrompt(false);
      setShowInstallPrompt(true);
      toast.info('Add Zippo to your Home Screen first, then enable notifications.', { duration: 5000 });
      return;
    }
    if (ctx.isAndroid && !ctx.isStandalone) toast.info('Install Zippo to your home screen for the best experience', { duration: 3000 });
    setLoading(true);
    try {
      const connected = await requestAndSubscribe(userId);
      const currentHealth = await checkPushHealth(userId);
      setHealth(currentHealth);
      if (connected && currentHealth.status === 'healthy') {
        toast.success('Notifications are enabled and connected on this device.');
        if (!isSettingsTest) setTimeout(() => { setVisible(false); setShowNotifPrompt(false); }, 2000);
      } else if (currentHealth.status === 'permission_denied') {
        toast.error('Notifications are blocked. Enable them in your browser settings.');
      } else {
        toast.error('Notifications need another connection attempt.');
      }
    } catch (error) {
      console.error('[NotifPrompt] Push registration failed:', error);
      toast.error('Notifications could not be connected. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    setTestStatus('sending');
    try {
      const result = await sendPushTest(userId, { onWaiting: () => setTestStatus('waiting') });
      if (result.success && result.deviceReceived) {
        setTestStatus('sent');
        setHealth(prev => prev ? { ...prev, status: 'healthy' } : prev);
        toast.success('This device received the test notification.');
      } else {
        setTestStatus('failed');
        setHealth(prev => prev ? { ...prev, status: 'unhealthy' } : prev);
        toast.error(result.reason || 'Push delivery could not be verified.');
      }
    } catch (error) {
      console.error('[NotifPrompt] Push test failed:', error);
      setTestStatus('failed');
      toast.error('Push delivery could not be verified.');
    } finally {
      setTimeout(() => setTestStatus('idle'), 5000);
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

  const needsPermission = health?.status === 'permission_required';
  const needsRepair = health?.status === 'unhealthy' || health?.status === 'missing_subscription' || health?.status === 'backend_missing';
  const testBusy = testStatus === 'sending' || testStatus === 'waiting';

  return (
    <div className="notif-prompt" data-testid="notification-prompt">
      <div className="notif-prompt__icon" aria-hidden="true">🔔</div>
      <div className="notif-prompt__text">
        <strong>{isSettingsTest && health?.status === 'healthy' ? 'Test push notifications' : needsRepair ? 'Notifications need attention' : 'Stay in the loop'}</strong>
        <p>{isSettingsTest && health?.status === 'healthy' ? 'Send a real notification to this device and wait for the device to confirm receipt.' : needsRepair ? 'Your notification connection on this device is not working. Repair it to receive messages and matches.' : 'Get notified for new messages, matches, and activity.'}</p>
      </div>
      <div className="notif-prompt__actions">
        {isSettingsTest && health?.status === 'healthy' ? (
          <button className="notif-prompt__enable" onClick={handleTest} disabled={testBusy}>{testStatus === 'sending' ? 'Preparing...' : testStatus === 'waiting' ? 'Waiting for this device...' : testStatus === 'sent' ? '✓ Device received it' : testStatus === 'failed' ? 'Try test again' : 'Test notification'}</button>
        ) : (
          <button className="notif-prompt__enable" onClick={handleEnable} disabled={loading}>{loading ? 'Connecting...' : needsPermission ? 'Enable' : 'Repair'}</button>
        )}
        <button className="notif-prompt__dismiss" onClick={handleDismiss}>{isSettingsTest ? 'Done' : 'Not now'}</button>
      </div>
    </div>
  );
};

export default NotificationPrompt;
