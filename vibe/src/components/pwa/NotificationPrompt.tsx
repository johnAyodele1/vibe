import { useState, useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { getInstallContext } from '../../lib/pwa/context';
import AddToHomeScreenHint from './AddToHomeScreenHint';
import './NotificationPrompt.css';
import { usePWAPromptStore, NOTIF_KEYS } from '../../store/pwaPromptStore';
import { checkPushHealth, requestAndSubscribe, sendPushTest, type PushHealthResult } from '../../lib/pwa/subscriptionManager';
import { toast } from 'sonner';

const ACTIONABLE_STATUSES = new Set(['permission_required', 'missing_subscription', 'backend_missing', 'unhealthy', 'permission_denied', 'service_worker_unavailable', 'error']);
const CHECKING_MIN_VISIBLE_MS = 1000;
const SWIPE_DISMISS_DISTANCE = 96;

type InstallContext = ReturnType<typeof getInstallContext>;

type SwipeableNotificationProps = {
  children: ReactNode;
  onDismiss: () => void;
  className?: string;
  'data-testid'?: string;
  role?: string;
  'aria-live'?: 'off' | 'assertive' | 'polite';
};

const SwipeableNotification = ({ children, onDismiss, className = '', ...props }: SwipeableNotificationProps) => {
  const [offsetX, setOffsetX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef<number | null>(null);
  const currentXRef = useRef(0);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    startXRef.current = event.clientX;
    currentXRef.current = event.clientX;
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (startXRef.current === null) return;
    currentXRef.current = event.clientX;
    setOffsetX(event.clientX - startXRef.current);
  };

  const resetDrag = () => {
    startXRef.current = null;
    currentXRef.current = 0;
    setDragging(false);
    setOffsetX(0);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (startXRef.current === null) return;
    const distance = event.clientX - startXRef.current;
    startXRef.current = null;
    currentXRef.current = 0;
    setDragging(false);

    if (Math.abs(distance) >= SWIPE_DISMISS_DISTANCE) {
      const direction = distance > 0 ? 1 : -1;
      setOffsetX(direction * Math.max(window.innerWidth, 520));
      window.setTimeout(onDismiss, 180);
      return;
    }

    setOffsetX(0);
  };

  const handlePointerCancel = () => resetDrag();

  return (
    <div
      {...props}
      className={`notif-prompt ${dragging ? 'notif-prompt--dragging' : ''} ${className}`.trim()}
      style={{
        transform: `translateX(calc(-50% + ${offsetX}px))`,
        opacity: Math.max(0, 1 - Math.min(Math.abs(offsetX) / (SWIPE_DISMISS_DISTANCE * 2), 0.85)),
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      {children}
    </div>
  );
};

const CheckingNotifications = ({ waiting = false, onDismiss }: { waiting?: boolean; onDismiss: () => void }) => (
  <SwipeableNotification onDismiss={onDismiss} data-testid="notification-prompt" role="status" aria-live="polite">
    <div className="notif-prompt__icon" aria-hidden="true">🔔</div>
    <div className="notif-prompt__text">
      <strong>Checking notifications</strong>
      <p>{waiting ? 'Waiting for this device to receive the test notification.' : 'Checking that notifications are connected to this device.'}</p>
    </div>
  </SwipeableNotification>
);

const NotificationPrompt = ({ userId }: { userId: string }) => {
  const { setShowNotifPrompt, setShowInstallPrompt } = usePWAPromptStore();
  const [ctx, setCtx] = useState<InstallContext | null>(null);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selfTesting, setSelfTesting] = useState(true);
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'waiting' | 'sent' | 'failed'>('sending');
  const [health, setHealth] = useState<PushHealthResult | null>(null);
  const [showHealthy, setShowHealthy] = useState(false);
  const entryTestUserRef = useRef<string | null>(null);
  const selfTestInFlight = useRef(false);
  const isSettingsTest = typeof window !== 'undefined' && (window.location.hash === '#push-test-section' || window.location.hash === '#push-notifications');

  useEffect(() => {
    const refreshContext = () => setCtx(getInstallContext());
    refreshContext();
    const handleVisibility = () => { if (document.visibilityState === 'visible') refreshContext(); };
    window.addEventListener('pageshow', refreshContext);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => { window.removeEventListener('pageshow', refreshContext); document.removeEventListener('visibilitychange', handleVisibility); };
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(NOTIF_KEYS.dismissed, '1');
    sessionStorage.setItem(NOTIF_KEYS.shownThisSession, '1');
    setShowNotifPrompt(false);
    setVisible(false);
  };

  useEffect(() => {
    if (!ctx) return;
    let cancelled = false;

    const runVerification = async (forceDeviceTest: boolean) => {
      if (selfTestInFlight.current) return;
      const checkingStartedAt = Date.now();
      setSelfTesting(true);
      setTestStatus('sending');
      setShowNotifPrompt(false);

      const keepCheckingVisible = async () => {
        const remaining = CHECKING_MIN_VISIBLE_MS - (Date.now() - checkingStartedAt);
        if (remaining > 0) await new Promise(resolve => window.setTimeout(resolve, remaining));
      };

      try {
        const currentHealth = await checkPushHealth(userId);
        await keepCheckingVisible();
        if (cancelled) return;
        setHealth(currentHealth);

        if (ACTIONABLE_STATUSES.has(currentHealth.status)) {
          setSelfTesting(false);
          setTestStatus('idle');
          setShowNotifPrompt(true);
          setVisible(true);
          return;
        }

        if (currentHealth.status === 'unsupported') {
          setSelfTesting(false);
          setTestStatus('idle');
          setShowNotifPrompt(false);
          setVisible(false);
          return;
        }

        const shouldTest = forceDeviceTest || currentHealth.status === 'verification_required';
        if (!shouldTest) {
          setSelfTesting(false);
          setTestStatus('idle');
          const show = isSettingsTest && currentHealth.status === 'healthy';
          setShowNotifPrompt(show);
          setVisible(show);
          return;
        }

        selfTestInFlight.current = true;
        setTestStatus('sending');
        const result = await sendPushTest(userId, { silent: true, onWaiting: () => setTestStatus('waiting') });
        if (cancelled) return;
        if (result.success && result.deviceReceived) {
          entryTestUserRef.current = userId;
          setHealth(prev => prev ? { ...prev, status: 'healthy', pushHealthStatus: 'healthy' } : prev);
          setTestStatus('sent');
          setShowNotifPrompt(false);
          setVisible(false);
          if (!isSettingsTest) {
            setShowHealthy(true);
            window.setTimeout(() => setShowHealthy(false), 4000);
          }
        } else {
          setHealth(prev => prev ? { ...prev, status: 'unhealthy', pushHealthStatus: 'unhealthy' } : prev);
          setShowNotifPrompt(true);
          setVisible(true);
        }
      } catch (error) {
        await keepCheckingVisible();
        if (!cancelled) {
          console.error('[NotifPrompt] Entry health check failed:', error);
          setHealth(prev => prev ? { ...prev, status: 'error', detail: error instanceof Error ? error.message : 'Unknown push error' } : prev);
          setShowNotifPrompt(true);
          setVisible(true);
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
    const handleVisibilityChange = () => { if (document.visibilityState === 'visible') void runVerification(false); };
    const handlePageShow = () => void runVerification(false);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);
    return () => { cancelled = true; document.removeEventListener('visibilitychange', handleVisibilityChange); window.removeEventListener('pageshow', handlePageShow); };
  }, [ctx, userId, isSettingsTest, setShowNotifPrompt]);

  const handleEnable = async () => {
    if (!ctx) return;
    if (ctx.isIOS && !ctx.isStandalone) {
      setVisible(false); setShowNotifPrompt(false); setShowInstallPrompt(true);
      toast.info('Add Zippo to your Home Screen first, then enable notifications.', { duration: 5000 });
      return;
    }
    if (ctx.isAndroid && !ctx.isStandalone) toast.info('Install Zippo to your home screen for the best experience', { duration: 3000 });
    setLoading(true);
    setSelfTesting(true);
    setTestStatus('sending');
    setShowNotifPrompt(false);
    try {
      const connected = await requestAndSubscribe(userId);
      if (!connected) {
        setSelfTesting(false); setTestStatus('idle'); setShowNotifPrompt(true); setVisible(true);
        if (Notification.permission === 'denied') toast.error('Notifications are blocked. Enable them in your browser settings.');
        else toast.error('Notifications could not be connected on this device.');
        return;
      }

      const currentHealth = await checkPushHealth(userId);
      setHealth(currentHealth);
      if (currentHealth.status !== 'healthy' && currentHealth.status !== 'verification_required') {
        throw new Error(currentHealth.detail || `Push registration is incomplete: ${currentHealth.status}`);
      }

      const result = await sendPushTest(userId, { onWaiting: () => setTestStatus('waiting') });
      if (result.success && result.deviceReceived) {
        entryTestUserRef.current = userId;
        setHealth(prev => prev ? { ...prev, status: 'healthy', pushHealthStatus: 'healthy' } : prev);
        setTestStatus('sent');
        toast.success('Notifications are enabled and working on this device.');
        window.setTimeout(() => { setSelfTesting(false); setTestStatus('idle'); setVisible(false); setShowNotifPrompt(false); }, 2000);
      } else {
        setHealth(prev => prev ? { ...prev, status: 'unhealthy', pushHealthStatus: 'unhealthy' } : prev);
        setSelfTesting(false); setTestStatus('idle'); setShowNotifPrompt(true); setVisible(true);
        toast.error(result.reason || 'Notifications could not be verified on this device.');
      }
    } catch (error) {
      console.error('[NotifPrompt] Push registration failed:', error);
      setSelfTesting(false); setTestStatus('idle'); setShowNotifPrompt(true); setVisible(true);
      toast.error(error instanceof Error ? error.message : 'Notifications could not be connected on this device.');
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    setTestStatus('sending');
    try {
      const result = await sendPushTest(userId, { onWaiting: () => setTestStatus('waiting') });
      if (result.success && result.deviceReceived) {
        setTestStatus('sent'); entryTestUserRef.current = userId;
        setHealth(prev => prev ? { ...prev, status: 'healthy', pushHealthStatus: 'healthy' } : prev);
        toast.success('This device received the test notification.');
      } else {
        setTestStatus('failed'); setHealth(prev => prev ? { ...prev, status: 'unhealthy', pushHealthStatus: 'unhealthy' } : prev);
        toast.error(result.reason || 'Push delivery could not be verified.');
      }
    } catch (error) {
      console.error('[NotifPrompt] Push test failed:', error);
      setTestStatus('failed'); setHealth(prev => prev ? { ...prev, status: 'unhealthy', pushHealthStatus: 'unhealthy' } : prev);
      toast.error('Push delivery could not be verified.');
    } finally { window.setTimeout(() => setTestStatus('idle'), 5000); }
  };

  // Never hide the health UI while the install context is being detected.
  // This is important on iOS Home Screen launches, where the first render can
  // happen before display-mode/standalone detection has settled.
  if (!ctx) return <CheckingNotifications onDismiss={handleDismiss} />;

  // A normal iOS Safari tab gets the install guidance, never the push health UI.
  if (ctx.isIOS && !ctx.isStandalone) return <AddToHomeScreenHint onDismiss={handleDismiss} />;

  // Do not gate the UI on parsed iOS version. The actual health check performs
  // feature detection; a major-version-only parser cannot reliably represent 16.4.
  const needsPermission = health?.status === 'permission_required';
  const needsRepair = health?.status === 'unhealthy' || health?.status === 'missing_subscription' || health?.status === 'backend_missing' || health?.status === 'verification_required' || health?.status === 'error' || health?.status === 'permission_denied' || health?.status === 'service_worker_unavailable';
  const testBusy = testStatus === 'sending' || testStatus === 'waiting';

  if (selfTesting) return <CheckingNotifications waiting={testStatus === 'waiting'} onDismiss={handleDismiss} />;

  if (showHealthy && health?.status === 'healthy' && !isSettingsTest) return (
    <SwipeableNotification onDismiss={handleDismiss} data-testid="notification-prompt" role="status" aria-live="polite">
      <div className="notif-prompt__icon" aria-hidden="true">🔔</div>
      <div className="notif-prompt__text"><strong>Notifications are working</strong><p>Push notifications are connected and working on this device.</p></div>
    </SwipeableNotification>
  );

  if (!visible && !(isSettingsTest && health?.status === 'healthy')) return null;

  return (
    <SwipeableNotification onDismiss={handleDismiss} data-testid="notification-prompt">
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
    </SwipeableNotification>
  );
};

export default NotificationPrompt;
