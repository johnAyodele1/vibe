import { useState, useEffect, useRef } from 'react';
import { getInstallContext } from '../../lib/pwa/context';
import AddToHomeScreenHint from './AddToHomeScreenHint';
import { usePWAPromptStore, NOTIF_KEYS } from '../../store/pwaPromptStore';
import { checkPushHealth, requestAndSubscribe, sendPushTest, type PushHealthResult } from '../../lib/pwa/subscriptionManager';
import { toast } from 'sonner';

const ACTIONABLE_STATUSES = new Set(['permission_required', 'missing_subscription', 'backend_missing', 'unhealthy', 'permission_denied', 'service_worker_unavailable', 'error']);
const CHECKING_MIN_VISIBLE_MS = 1000;
const PUSH_REVERIFICATION_COOLDOWN_MS = 3 * 60 * 60 * 1000;
const PUSH_REVERIFICATION_EXIT_KEY_PREFIX = 'zippo_push_last_site_exit:';
const PUSH_REVERIFICATION_TEST_KEY_PREFIX = 'zippo_push_last_health_test:';

type InstallContext = ReturnType<typeof getInstallContext>;

const getSiteExitKey = (userId: string) => `${PUSH_REVERIFICATION_EXIT_KEY_PREFIX}${userId}`;
const getHealthTestKey = (userId: string) => `${PUSH_REVERIFICATION_TEST_KEY_PREFIX}${userId}`;

const readTimestamp = (key: string): number | null => {
  const value = localStorage.getItem(key);
  if (!value) return null;
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
};

const getLastSiteExitAt = (userId: string): number | null => readTimestamp(getSiteExitKey(userId));
const getLastHealthTestAt = (userId: string): number | null => readTimestamp(getHealthTestKey(userId));

const isWithinSiteExitCooldown = (userId: string): boolean => {
  const lastHealthTestAt = getLastHealthTestAt(userId);
  const lastSiteExitAt = getLastSiteExitAt(userId);
  const lastActivityAt = Math.max(lastHealthTestAt ?? 0, lastSiteExitAt ?? 0);
  return lastActivityAt > 0 && Date.now() - lastActivityAt < PUSH_REVERIFICATION_COOLDOWN_MS;
};

const recordSiteExit = (userId: string) => {
  localStorage.setItem(getSiteExitKey(userId), String(Date.now()));
};

const recordHealthTest = (userId: string) => {
  localStorage.setItem(getHealthTestKey(userId), String(Date.now()));
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
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'waiting' | 'sent' | 'failed'>('sending');
  const [health, setHealth] = useState<PushHealthResult | null>(null);
  const [showHealthy, setShowHealthy] = useState(false);
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

  useEffect(() => {
    if (!ctx) return;
    let cancelled = false;

    const runVerification = async (forceDeviceTest: boolean) => {
      // pageshow/visibilitychange can fire while the initial verification is
      // still awaiting the health endpoint. Claim the whole verification run
      // before the first await so two startup paths cannot both send a test.
      if (selfTestInFlight.current) return;
      selfTestInFlight.current = true;

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

        // Explicit Settings tests are intentionally exempt from the automatic
        // three-hour health-test cooldown. Automatic verification is not.
        // The cooldown is persisted by the successful test itself, so it
        // survives iOS PWA cold starts and does not depend on pagehide firing.
        const cooldownActive = !isSettingsTest && isWithinSiteExitCooldown(userId);
        const shouldTest = isSettingsTest || forceDeviceTest || (!cooldownActive && currentHealth.status === 'verification_required');

        if (!shouldTest) {
          setSelfTesting(false);
          setTestStatus('idle');

          if (cooldownActive && (currentHealth.status === 'verification_required' || currentHealth.status === 'healthy')) {
            setHealth(prev => prev ? { ...prev, status: 'healthy', pushHealthStatus: 'healthy' } : prev);
            setShowHealthy(true);
            window.setTimeout(() => setShowHealthy(false), 4000);
            setShowNotifPrompt(false);
            setVisible(false);
            return;
          }

          const show = isSettingsTest && currentHealth.status === 'healthy';
          setShowNotifPrompt(show);
          setVisible(show);
          return;
        }

        setTestStatus('sending');
        const result = await sendPushTest(userId, { silent: true, onWaiting: () => setTestStatus('waiting') });
        if (cancelled) return;
        if (result.success && result.deviceReceived) {
          recordHealthTest(userId);
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

    // A new PWA document is NOT a new authenticated notification session.
    // iOS destroys/recreates the document when the user closes and reopens the
    // PWA, so the persisted three-hour cooldown must be authoritative here.
    void runVerification(false);

    const handleVisibilityChange = () => { if (document.visibilityState === 'visible') void runVerification(false); };
    const handlePageShow = () => void runVerification(false);
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
        recordHealthTest(userId);
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
        setTestStatus('sent');
        recordHealthTest(userId);
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

  const handleDismiss = () => {
    localStorage.setItem(NOTIF_KEYS.dismissed, '1');
    sessionStorage.setItem(NOTIF_KEYS.shownThisSession, '1');
    setShowNotifPrompt(false); setVisible(false);
  };

  if (!ctx) return <CheckingNotifications />;
  if (ctx.isIOS && !ctx.isStandalone) return <AddToHomeScreenHint onDismiss={handleDismiss} />;

  const needsPermission = health?.status === 'permission_required';
  const needsRepair = health?.status === 'unhealthy' || health?.status === 'missing_subscription' || health?.status === 'backend_missing' || health?.status === 'verification_required' || health?.status === 'error' || health?.status === 'permission_denied' || health?.status === 'service_worker_unavailable';
  const testBusy = testStatus === 'sending' || testStatus === 'waiting';

  if (selfTesting) return <CheckingNotifications waiting={testStatus === 'waiting'} />;

  if (showHealthy && health?.status === 'healthy' && !isSettingsTest) return (
    <div className="notif-prompt" data-testid="notification-prompt" role="status" aria-live="polite">
      <div className="notif-prompt__icon" aria-hidden="true">🔔</div>
      <div className="notif-prompt__text"><strong>Notifications enabled on this device</strong><p>Push notifications are connected on this device.</p></div>
    </div>
  );

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
