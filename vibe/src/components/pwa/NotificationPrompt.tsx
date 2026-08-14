import { useState, useEffect, useRef } from 'react';
import { getInstallContext } from '../../lib/pwa/context';
import AddToHomeScreenHint from './AddToHomeScreenHint';
import { usePWAPromptStore, NOTIF_KEYS } from '../../store/pwaPromptStore';
import { checkPushHealth, requestAndSubscribe, sendPushTest, type PushHealthResult } from '../../lib/pwa/subscriptionManager';
import { toast } from 'sonner';

const ACTIONABLE_STATUSES = new Set([
  'permission_required',
  'missing_subscription',
  'backend_missing',
  'unhealthy',
  'permission_denied',
  'service_worker_unavailable',
]);

const NotificationPrompt = ({ userId }: { userId: string }) => {
  const { showNotifPrompt, setShowNotifPrompt, setShowInstallPrompt } = usePWAPromptStore();
  const [ctx, setCtx] = useState<ReturnType<typeof getInstallContext> | null>(null);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selfTesting, setSelfTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'waiting' | 'sent' | 'failed'>('idle');
  const [health, setHealth] = useState<PushHealthResult | null>(null);
  const [showHealthy, setShowHealthy] = useState(false);
  const entryTestUserRef = useRef<string | null>(null);
  const selfTestInFlight = useRef(false);
  const isSettingsTest = typeof window !== 'undefined' && (window.location.hash === '#push-test-section' || window.location.hash === '#push-notifications');

  const refreshContext = () => setCtx(getInstallContext());

  useEffect(() => {
    refreshContext();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshContext();
    };
    window.addEventListener('pageshow', refreshContext);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('pageshow', refreshContext);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  useEffect(() => setVisible(showNotifPrompt), [showNotifPrompt]);

  useEffect(() => {
    if (!ctx) return;

    let cancelled = false;

    const runVerification = async (forceDeviceTest: boolean) => {
      if (selfTestInFlight.current) return;

      // A fresh app entry must visibly enter the checking state before any
      // network/service-worker work starts. This is especially important on
      // iOS, where subscription discovery can take noticeably longer than
      // Android. Do not make the UI wait for checkPushHealth() to finish.
      if (forceDeviceTest) {
        setSelfTesting(true);
        setTestStatus('sending');
        setShowNotifPrompt(false);
      }

      try {
        const currentHealth = await checkPushHealth(userId);
        if (cancelled) return;
        setHealth(currentHealth);

        if (ACTIONABLE_STATUSES.has(currentHealth.status)) {
          setSelfTesting(false);
          setTestStatus('idle');
          setShowNotifPrompt(true);
          return;
        }

        if (currentHealth.status === 'unsupported' || currentHealth.status === 'error') {
          setSelfTesting(false);
          setTestStatus('idle');
          setShowNotifPrompt(false);
          return;
        }

        const shouldTest = forceDeviceTest || currentHealth.status === 'verification_required';
        if (!shouldTest) {
          setSelfTesting(false);
          setTestStatus('idle');
          setShowNotifPrompt(isSettingsTest && currentHealth.status === 'healthy');
          return;
        }

        selfTestInFlight.current = true;
        setSelfTesting(true);
        setTestStatus('sending');
        setShowNotifPrompt(false);

        const result = await sendPushTest(userId, {
          silent: true,
          onWaiting: () => setTestStatus('waiting'),
        });

        if (cancelled) return;

        if (result.success && result.deviceReceived) {
          entryTestUserRef.current = userId;
          setHealth(prev => prev ? { ...prev, status: 'healthy', pushHealthStatus: 'healthy' } : prev);
          setTestStatus('sent');
          setShowNotifPrompt(false);

          if (!isSettingsTest) {
            setShowHealthy(true);
            window.setTimeout(() => setShowHealthy(false), 4000);
          }
        } else {
          setHealth(prev => prev ? { ...prev, status: 'unhealthy', pushHealthStatus: 'unhealthy' } : prev);
          setShowNotifPrompt(true);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('[NotifPrompt] Entry health check failed:', error);
          setHealth(prev => prev ? { ...prev, status: 'error' } : prev);
          setShowNotifPrompt(true);
        }
      } finally {
        selfTestInFlight.current = false;
        if (!cancelled) {
          setSelfTesting(false);
          setTestStatus('idle');
        }
      }
    };

    const isNewAuthenticatedUser = entryTestUserRef.current !== userId;
    void runVerification(isNewAuthenticatedUser);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void runVerification(false);
    };
    const handlePageShow = () => void runVerification(false);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [ctx, userId, isSettingsTest, setShowNotifPrompt]);

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

      if (connected && (currentHealth.status === 'healthy' || currentHealth.status === 'verification_required')) {
        const result = await sendPushTest(userId, { onWaiting: () => setTestStatus('waiting') });
        if (result.success && result.deviceReceived) {
          entryTestUserRef.current = userId;
          setHealth(prev => prev ? { ...prev, status: 'healthy', pushHealthStatus: 'healthy' } : prev);
          toast.success('Notifications are enabled and working on this device.');
          setTimeout(() => { setVisible(false); setShowNotifPrompt(false); }, 2000);
        } else {
          setHealth(prev => prev ? { ...prev, status: 'unhealthy', pushHealthStatus: 'unhealthy' } : prev);
          setShowNotifPrompt(true);
          toast.error(result.reason || 'Notifications could not be verified.');
        }
      } else if (currentHealth.status === 'permission_denied') {
        toast.error('Notifications are blocked. Enable them in your browser settings.');
      } else {
        setShowNotifPrompt(true);
        toast.error('Notifications need another connection attempt.');
      }
    } catch (error) {
      console.error('[NotifPrompt] Push registration failed:', error);
      setShowNotifPrompt(true);
      toast.error('Notifications could not be connected. Try again.');
    } finally {
      setLoading(false);
      setTestStatus('idle');
    }
  };

  const handleTest = async () => {
    setTestStatus('sending');
    try {
      const result = await sendPushTest(userId, { onWaiting: () => setTestStatus('waiting') });
      if (result.success && result.deviceReceived) {
        setTestStatus('sent');
        entryTestUserRef.current = userId;
        setHealth(prev => prev ? { ...prev, status: 'healthy', pushHealthStatus: 'healthy' } : prev);
        toast.success('This device received the test notification.');
      } else {
        setTestStatus('failed');
        setHealth(prev => prev ? { ...prev, status: 'unhealthy', pushHealthStatus: 'unhealthy' } : prev);
        toast.error(result.reason || 'Push delivery could not be verified.');
      }
    } catch (error) {
      console.error('[NotifPrompt] Push test failed:', error);
      setTestStatus('failed');
      setHealth(prev => prev ? { ...prev, status: 'unhealthy', pushHealthStatus: 'unhealthy' } : prev);
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

  if (!ctx) return null;
  if (ctx.isIOS && !ctx.isStandalone) return <AddToHomeScreenHint onDismiss={handleDismiss} />;
  if (ctx.isIOS && ctx.iOSVersion && ctx.iOSVersion < 16.4) return null;

  const needsPermission = health?.status === 'permission_required';
  const needsRepair = health?.status === 'unhealthy' || health?.status === 'missing_subscription' || health?.status === 'backend_missing' || health?.status === 'verification_required';
  const testBusy = testStatus === 'sending' || testStatus === 'waiting';

  if (selfTesting) {
    return (
      <div className="notif-prompt" data-testid="notification-prompt" role="status" aria-live="polite">
        <div className="notif-prompt__icon" aria-hidden="true">🔔</div>
        <div className="notif-prompt__text">
          <strong>Checking notifications</strong>
          <p>{testStatus === 'waiting' ? 'Waiting for this device to receive the test notification.' : 'Checking that notifications are connected to this device.'}</p>
        </div>
      </div>
    );
  }

  if (showHealthy && health?.status === 'healthy' && !isSettingsTest) {
    return (
      <div className="notif-prompt" data-testid="notification-prompt" role="status" aria-live="polite">
        <div className="notif-prompt__icon" aria-hidden="true">🔔</div>
        <div className="notif-prompt__text">
          <strong>Notifications are working</strong>
          <p>Push notifications are connected and working on this device.</p>
        </div>
      </div>
    );
  }

  if (!visible && !(isSettingsTest && health?.status === 'healthy')) return null;

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
