import { useState, useEffect, useRef } from 'react';
import { getInstallContext } from '../../lib/pwa/context';
import AddToHomeScreenHint from './AddToHomeScreenHint';
import { usePWAPromptStore, NOTIF_KEYS } from '../../store/pwaPromptStore';
import { checkPushHealth, requestAndSubscribe, sendPushTest, type PushHealthResult } from '../../lib/pwa/subscriptionManager';
import { toast } from 'sonner';

const ACTIONABLE_STATUSES = new Set(['permission_required', 'missing_subscription', 'backend_missing', 'unhealthy', 'permission_denied', 'service_worker_unavailable', 'error']);
const CHECKING_MIN_VISIBLE_MS = 1000;
const HEALTHY_MESSAGE_VISIBLE_MS = 2000;
const PUSH_REVERIFICATION_COOLDOWN_MS = 3 * 60 * 60 * 1000;
const PUSH_REVERIFICATION_EXIT_KEY_PREFIX = 'zippo_push_last_site_exit:';
const PUSH_REVERIFICATION_TEST_KEY_PREFIX = 'zippo_push_last_health_test:';
const PUSH_LOGIN_TEST_KEY_PREFIX = 'zippo_push_test_after_login:';
const PUSH_AUTO_TEST_CLAIM_KEY_PREFIX = 'zippo_push_auto_test_claim:';
const SWIPE_DISMISS_DISTANCE_PX = 80;
const SWIPE_ANIMATION_MS = 180;

type InstallContext = ReturnType<typeof getInstallContext>;

// One health request per user at a time. This protects against StrictMode,
// duplicate lifecycle events and multiple prompt instances starting together.
const healthChecksInFlight = new Map<string, Promise<PushHealthResult>>();
// One actual test push per user at a time. This is deliberately separate from
// the health-check lock because two independent component instances can both
// reach the test-send decision after sharing the same health response.
const pushTestsInFlight = new Map<string, Promise<Awaited<ReturnType<typeof sendPushTest>>>>();
const lastLifecycleVerificationAt = new Map<string, number>();

const getSiteExitKey = (userId: string) => `${PUSH_REVERIFICATION_EXIT_KEY_PREFIX}${userId}`;
const getHealthTestKey = (userId: string) => `${PUSH_REVERIFICATION_TEST_KEY_PREFIX}${userId}`;
const getLoginTestKey = (userId: string) => `${PUSH_LOGIN_TEST_KEY_PREFIX}${userId}`;
const getAutoTestClaimKey = (userId: string, exitAt: number) => `${PUSH_AUTO_TEST_CLAIM_KEY_PREFIX}${userId}:${exitAt}`;

const readTimestamp = (key: string): number | null => {
  const value = localStorage.getItem(key);
  if (!value) return null;
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
};

const getLastSiteExitAt = (userId: string) => readTimestamp(getSiteExitKey(userId));
const getLastHealthTestAt = (userId: string) => readTimestamp(getHealthTestKey(userId));
const hasCompletedThreeHourAbsence = (userId: string) => {
  const exitAt = getLastSiteExitAt(userId);
  return exitAt !== null && Date.now() - exitAt >= PUSH_REVERIFICATION_COOLDOWN_MS;
};
const recordSiteExit = (userId: string) => localStorage.setItem(getSiteExitKey(userId), String(Date.now()));
const recordHealthTest = (userId: string) => localStorage.setItem(getHealthTestKey(userId), String(Date.now()));

const consumeLoginTestMarker = (userId: string) => {
  const key = getLoginTestKey(userId);
  if (localStorage.getItem(key) !== '1') return false;
  // localStorage.setItem/removeItem are synchronous, so this claim is atomic
  // within the browser event loop. A second mounted instance cannot consume it.
  localStorage.removeItem(key);
  return true;
};

const claimAutomaticTestForExit = (userId: string, exitAt: number) => {
  const key = getAutoTestClaimKey(userId, exitAt);
  if (localStorage.getItem(key) === '1') return false;
  // Claim before awaiting the push request. This prevents two independently
  // mounted NotificationPrompt instances from both sending for one exit.
  localStorage.setItem(key, '1');
  return true;
};

const getHealth = (userId: string) => {
  const existing = healthChecksInFlight.get(userId);
  if (existing) return existing;
  const promise = checkPushHealth(userId).finally(() => {
    if (healthChecksInFlight.get(userId) === promise) healthChecksInFlight.delete(userId);
  });
  healthChecksInFlight.set(userId, promise);
  return promise;
};

const shouldRunLifecycleVerification = (userId: string) => {
  const now = Date.now();
  const last = lastLifecycleVerificationAt.get(userId) ?? 0;
  if (now - last < 500) return false;
  lastLifecycleVerificationAt.set(userId, now);
  return true;
};

const CheckingNotifications = ({ waiting = false }: { waiting?: boolean }) => (
  <div className="notif-prompt" data-testid="notification-prompt" role="status" aria-live="polite">
    <div className="notif-prompt__icon" aria-hidden="true">🔔</div>
    <div className="notif-prompt__text">
      <strong>Checking notifications</strong>
      <p>{waiting ? 'Waiting for this device to receive the test notification.' : 'Checking that notifications are connected to this device.'}</p>
    </div>
  </div>
);

const NotificationPrompt = ({ userId }: { userId: string }) => {
  const { setShowNotifPrompt, setShowInstallPrompt } = usePWAPromptStore();
  const [ctx, setCtx] = useState<InstallContext | null>(null);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selfTesting, setSelfTesting] = useState(true);
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'waiting' | 'sent' | 'failed'>('idle');
  const [health, setHealth] = useState<PushHealthResult | null>(null);
  const [showHealthy, setShowHealthy] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swipeExiting, setSwipeExiting] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchCurrentX = useRef<number | null>(null);
  const swipeExitTimer = useRef<number | null>(null);
  const healthyHideTimer = useRef<number | null>(null);
  const isSettingsTest = typeof window !== 'undefined' && (window.location.hash === '#push-test-section' || window.location.hash === '#push-notifications');

  useEffect(() => {
    const refreshContext = () => setCtx(getInstallContext());
    refreshContext();
    const handleVisibility = () => { if (document.visibilityState === 'visible') refreshContext(); };
    window.addEventListener('pageshow', refreshContext);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => { window.removeEventListener('pageshow', refreshContext); document.removeEventListener('visibilitychange', handleVisibility); };
  }, []);

  useEffect(() => {
    if (!showHealthy || isSettingsTest) return;
    if (healthyHideTimer.current) window.clearTimeout(healthyHideTimer.current);
    healthyHideTimer.current = window.setTimeout(() => {
      setShowHealthy(false);
      setVisible(false);
      setShowNotifPrompt(false);
    }, HEALTHY_MESSAGE_VISIBLE_MS);
    return () => {
      if (healthyHideTimer.current) window.clearTimeout(healthyHideTimer.current);
    };
  }, [showHealthy, isSettingsTest, setShowNotifPrompt]);

  useEffect(() => () => {
    if (swipeExitTimer.current) window.clearTimeout(swipeExitTimer.current);
    if (healthyHideTimer.current) window.clearTimeout(healthyHideTimer.current);
  }, []);

  useEffect(() => {
    if (!ctx) return;
    let cancelled = false;

    const runHealthCheck = async (showChecking: boolean) => {
      if (showChecking) {
        setSelfTesting(true);
        setTestStatus('idle');
        setShowNotifPrompt(false);
      }
      const startedAt = Date.now();
      const currentHealth = await getHealth(userId);
      const remaining = CHECKING_MIN_VISIBLE_MS - (Date.now() - startedAt);
      if (remaining > 0) await new Promise(resolve => window.setTimeout(resolve, remaining));
      if (cancelled) return null;
      setHealth(currentHealth);
      return currentHealth;
    };

    const sendTest = async (currentHealth: PushHealthResult) => {
      if (currentHealth.status !== 'healthy' && currentHealth.status !== 'verification_required') return false;
      const existing = pushTestsInFlight.get(userId);
      if (existing) {
        await existing;
        return true;
      }

      const sendPromise = sendPushTest(userId, { silent: true, onWaiting: () => setTestStatus('waiting') });
      pushTestsInFlight.set(userId, sendPromise);
      try {
        setTestStatus('sending');
        const result = await sendPromise;
        if (cancelled) return true;
        if (result.success && result.deviceReceived) {
          recordHealthTest(userId);
          setHealth(prev => prev ? { ...prev, status: 'healthy', pushHealthStatus: 'healthy' } : prev);
          setTestStatus('sent');
          setShowHealthy(true);
          setVisible(true);
          setShowNotifPrompt(false);
        } else {
          setHealth(prev => prev ? { ...prev, status: 'unhealthy', pushHealthStatus: 'unhealthy' } : prev);
          setShowNotifPrompt(true);
          setVisible(true);
        }
        return true;
      } finally {
        if (pushTestsInFlight.get(userId) === sendPromise) pushTestsInFlight.delete(userId);
      }
    };

    const runVerification = async () => {
      const showChecking = shouldRunLifecycleVerification(userId);
      try {
        const currentHealth = await runHealthCheck(showChecking);
        if (!currentHealth || cancelled) return;

        if (ACTIONABLE_STATUSES.has(currentHealth.status)) {
          setSelfTesting(false);
          setShowNotifPrompt(true);
          setVisible(true);
          return;
        }
        if (currentHealth.status === 'unsupported') {
          setSelfTesting(false);
          setShowNotifPrompt(false);
          setVisible(false);
          return;
        }

        if (!isSettingsTest) {
          // A successful real login always gets one test. Startup/auth restoration
          // does not create this marker, so reopening the app cannot look like login.
          const loginTriggered = consumeLoginTestMarker(userId);
          if (loginTriggered) {
            await sendTest(currentHealth);
            if (!cancelled) setSelfTesting(false);
            return;
          }

          // Outside login, only a real three-hour site absence can trigger the
          // automatic test. Claim synchronously before awaiting the push request.
          const lastTestAt = getLastHealthTestAt(userId);
          const lastExitAt = getLastSiteExitAt(userId);
          const alreadyTestedForThisExit = lastTestAt !== null && lastExitAt !== null && lastTestAt >= lastExitAt;
          if (lastExitAt !== null && Date.now() - lastExitAt >= PUSH_REVERIFICATION_COOLDOWN_MS && !alreadyTestedForThisExit && claimAutomaticTestForExit(userId, lastExitAt)) {
            await sendTest(currentHealth);
            if (!cancelled) setSelfTesting(false);
            return;
          }
        }

        if (!cancelled) {
          setSelfTesting(false);
          setTestStatus('idle');
          if (currentHealth.status === 'healthy') {
            setShowHealthy(true);
            setVisible(true);
            setShowNotifPrompt(false);
          } else {
            setShowHealthy(false);
            setShowNotifPrompt(true);
            setVisible(true);
          }
        }
      } catch (error) {
        if (!cancelled) {
          console.error('[NotifPrompt] Entry health check failed:', error);
          setHealth(prev => prev ? { ...prev, status: 'error', detail: error instanceof Error ? error.message : 'Unknown push error' } : prev);
          setSelfTesting(false);
          setTestStatus('idle');
          setShowNotifPrompt(true);
          setVisible(true);
        }
      }
    };

    void runVerification();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void runVerification();
    };
    const handlePageShow = () => void runVerification();
    const handlePageHide = () => recordSiteExit(userId);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [ctx, userId, isSettingsTest, setShowNotifPrompt]);

  const dismissPrompt = () => {
    setSwipeExiting(false);
    setSwipeOffset(0);
    setShowHealthy(false);
    setShowNotifPrompt(false);
    setVisible(false);
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
    touchCurrentX.current = touchStartX.current;
    setSwipeExiting(false);
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartX.current === null) return;
    const currentX = event.touches[0]?.clientX ?? touchStartX.current;
    touchCurrentX.current = currentX;
    const delta = currentX - touchStartX.current;
    setSwipeOffset(delta);
  };

  const handleTouchEnd = () => {
    if (touchStartX.current === null || touchCurrentX.current === null) return;
    const delta = touchCurrentX.current - touchStartX.current;
    touchStartX.current = null;
    touchCurrentX.current = null;
    if (Math.abs(delta) >= SWIPE_DISMISS_DISTANCE_PX) {
      setSwipeExiting(true);
      setSwipeOffset(delta > 0 ? window.innerWidth : -window.innerWidth);
      if (swipeExitTimer.current) window.clearTimeout(swipeExitTimer.current);
      swipeExitTimer.current = window.setTimeout(dismissPrompt, SWIPE_ANIMATION_MS);
    } else {
      setSwipeOffset(0);
    }
  };

  const promptInteractionProps = {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    onTouchCancel: handleTouchEnd,
    style: {
      transform: `translate3d(${swipeOffset}px, 0, 0)`,
      transition: swipeExiting || swipeOffset === 0 ? `transform ${SWIPE_ANIMATION_MS}ms ease-out` : 'none',
      touchAction: 'pan-y' as const,
      willChange: 'transform',
    },
  };

  const handleEnable = async () => {
    if (!ctx) return;
    if (ctx.isIOS && !ctx.isStandalone) {
      setVisible(false); setShowNotifPrompt(false); setShowInstallPrompt(true);
      toast.info('Add Zippo to your Home Screen first, then enable notifications.', { duration: 5000 });
      return;
    }
    if (ctx.isAndroid && !ctx.isStandalone) toast.info('Install Zippo to your home screen for the best experience', { duration: 3000 });
    setLoading(true); setSelfTesting(true); setTestStatus('sending'); setShowNotifPrompt(false);
    try {
      const connected = await requestAndSubscribe(userId);
      if (!connected) {
        setSelfTesting(false); setTestStatus('idle'); setShowNotifPrompt(true); setVisible(true);
        if (Notification.permission === 'denied') toast.error('Notifications are blocked. Enable them in your browser settings.');
        else toast.error('Notifications could not be connected on this device.');
        return;
      }
      const currentHealth = await getHealth(userId);
      setHealth(currentHealth);
      if (currentHealth.status !== 'healthy' && currentHealth.status !== 'verification_required') throw new Error(currentHealth.detail || `Push registration is incomplete: ${currentHealth.status}`);
      const existing = pushTestsInFlight.get(userId);
      const result = existing ? await existing : await sendPushTest(userId, { onWaiting: () => setTestStatus('waiting') });
      if (result.success && result.deviceReceived) {
        recordHealthTest(userId);
        setHealth(prev => prev ? { ...prev, status: 'healthy', pushHealthStatus: 'healthy' } : prev);
        setTestStatus('sent');
        toast.success('Notifications are enabled and working on this device.');
        window.setTimeout(() => { setSelfTesting(false); setTestStatus('idle'); setShowHealthy(true); setVisible(true); setShowNotifPrompt(false); }, 2000);
      } else {
        setHealth(prev => prev ? { ...prev, status: 'unhealthy', pushHealthStatus: 'unhealthy' } : prev);
        setSelfTesting(false); setTestStatus('idle'); setShowNotifPrompt(true); setVisible(true);
        toast.error(result.reason || 'Notifications could not be verified on this device.');
      }
    } catch (error) {
      console.error('[NotifPrompt] Push registration failed:', error);
      setSelfTesting(false); setTestStatus('idle'); setShowNotifPrompt(true); setVisible(true);
      toast.error(error instanceof Error ? error.message : 'Notifications could not be connected on this device.');
    } finally { setLoading(false); }
  };

  const handleTest = async () => {
    setTestStatus('sending');
    try {
      const existing = pushTestsInFlight.get(userId);
      const result = existing ? await existing : await sendPushTest(userId, { onWaiting: () => setTestStatus('waiting') });
      if (result.success && result.deviceReceived) {
        setTestStatus('sent'); recordHealthTest(userId);
        setHealth(prev => prev ? { ...prev, status: 'healthy', pushHealthStatus: 'healthy' } : prev);
        setShowHealthy(true); setVisible(true);
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
    } finally { window.setTimeout(() => setTestStatus('idle'), 5000); }
  };

  const handleDismiss = () => {
    localStorage.setItem(NOTIF_KEYS.dismissed, '1');
    sessionStorage.setItem(NOTIF_KEYS.shownThisSession, '1');
    dismissPrompt();
  };

  if (!ctx) return <CheckingNotifications />;
  if (ctx.isIOS && !ctx.isStandalone) return <AddToHomeScreenHint onDismiss={handleDismiss} />;

  const needsPermission = health?.status === 'permission_required';
  const needsRepair = ACTIONABLE_STATUSES.has(health?.status ?? '') || health?.status === 'verification_required';
  const testBusy = testStatus === 'sending' || testStatus === 'waiting';
  if (selfTesting) return <div {...promptInteractionProps}><CheckingNotifications waiting={testStatus === 'waiting'} /></div>;
  if (showHealthy && health?.status === 'healthy') return (
    <div {...promptInteractionProps} className="notif-prompt" data-testid="notification-prompt" role="status" aria-live="polite">
      <div className="notif-prompt__icon" aria-hidden="true">🔔</div>
      <div className="notif-prompt__text"><strong>Notifications enabled on this device</strong><p>Push notifications are connected on this device.</p></div>
    </div>
  );
  if (!visible && !(isSettingsTest && health?.status === 'healthy')) return null;

  return (
    <div {...promptInteractionProps} className="notif-prompt" data-testid="notification-prompt">
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
