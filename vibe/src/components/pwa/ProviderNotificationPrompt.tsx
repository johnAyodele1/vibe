import { useEffect, useState } from 'react';
import { getInstallContext } from '../../lib/pwa/context';
import { usePWAPromptStore, NOTIF_KEYS } from '../../store/pwaPromptStore';
import { checkPushHealth, requestAndSubscribe, sendPushTest, type PushHealthResult } from '../../lib/pwa/subscriptionManager';
import AddToHomeScreenHint from './AddToHomeScreenHint';
import { toast } from 'sonner';

const ProviderNotificationPrompt = ({ userId }: { userId: string }) => {
  const { showNotifPrompt, setShowNotifPrompt, setShowInstallPrompt } = usePWAPromptStore();
  const [ctx, setCtx] = useState<ReturnType<typeof getInstallContext> | null>(null);
  const [health, setHealth] = useState<PushHealthResult | null>(null);
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'waiting' | 'sent' | 'failed'>('idle');

  useEffect(() => setCtx(getInstallContext()), []);

  useEffect(() => {
    let cancelled = false;
    checkPushHealth(userId).then(result => {
      if (!cancelled) setHealth(result);
    }).catch(error => console.error('[ProviderNotifPrompt] Health check failed:', error));
    return () => { cancelled = true; };
  }, [userId]);

  if (!showNotifPrompt || !ctx) return null;
  if (ctx.isIOS && !ctx.isStandalone) {
    return <AddToHomeScreenHint onDismiss={() => setShowNotifPrompt(false)} />;
  }
  if (ctx.isIOS && ctx.iOSVersion && ctx.iOSVersion < 16.4) return null;

  const needsPermission = health?.status === 'permission_required';
  const needsRepair = health?.status === 'unhealthy' || health?.status === 'missing_subscription' || health?.status === 'backend_missing';
  const canTest = health?.status === 'healthy';
  const busy = testStatus === 'sending' || testStatus === 'waiting';

  const handleEnable = async () => {
    try {
      const connected = await requestAndSubscribe(userId);
      const result = await checkPushHealth(userId);
      setHealth(result);
      if (connected && result.status === 'healthy') {
        toast.success('Notifications are enabled and connected on this device.');
        setShowNotifPrompt(false);
      } else if (result.status === 'permission_denied') {
        toast.error('Notifications are blocked. Enable them in your browser settings.');
      } else {
        toast.error('Notifications need another connection attempt.');
      }
    } catch (error) {
      console.error('[ProviderNotifPrompt] Enable failed:', error);
      toast.error('Notifications could not be connected. Try again.');
    }
  };

  const handleTest = async () => {
    setTestStatus('sending');
    try {
      const result = await sendPushTest(userId, { onWaiting: () => setTestStatus('waiting') });
      if (result.success && result.deviceReceived) {
        setTestStatus('sent');
        setHealth(previous => previous ? { ...previous, status: 'healthy' } : previous);
        toast.success('This device received the test notification.');
      } else {
        setTestStatus('failed');
        setHealth(previous => previous ? { ...previous, status: 'unhealthy' } : previous);
        toast.error(result.reason || 'Push delivery could not be verified.');
      }
    } catch (error) {
      console.error('[ProviderNotifPrompt] Test failed:', error);
      setTestStatus('failed');
      toast.error('Push delivery could not be verified.');
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(NOTIF_KEYS.dismissed, '1');
    sessionStorage.setItem(NOTIF_KEYS.shownThisSession, '1');
    setShowNotifPrompt(false);
  };

  return (
    <div className="notif-prompt" data-testid="provider-notification-prompt">
      <div className="notif-prompt__icon" aria-hidden="true">🔔</div>
      <div className="notif-prompt__text">
        <strong>{canTest ? 'Test push notifications' : needsRepair ? 'Notifications need attention' : 'Stay in the loop'}</strong>
        <p>{canTest ? 'Send a real notification to this device and confirm that it is received.' : needsRepair ? 'Your notification connection on this device is not working. Repair it to receive messages and matches.' : 'Get notified for new messages, matches, and activity.'}</p>
      </div>
      <div className="notif-prompt__actions">
        {canTest ? (
          <button className="notif-prompt__enable" onClick={handleTest} disabled={busy}>
            {testStatus === 'sending' ? 'Preparing...' : testStatus === 'waiting' ? 'Waiting for this device...' : testStatus === 'sent' ? '✓ Device received it' : testStatus === 'failed' ? 'Try test again' : 'Test notification'}
          </button>
        ) : (
          <button className="notif-prompt__enable" onClick={handleEnable}>{needsPermission ? 'Enable' : needsRepair ? 'Repair' : 'Enable'}</button>
        )}
        <button className="notif-prompt__dismiss" onClick={handleDismiss}>{canTest ? 'Done' : 'Not now'}</button>
      </div>
    </div>
  );
};

export default ProviderNotificationPrompt;
