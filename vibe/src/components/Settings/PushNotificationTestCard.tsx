import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useAdultAuth } from '../../contexts/AdultAuthContext';
import { checkPushHealth, requestAndSubscribe, sendPushTest, type PushHealthResult } from '../../lib/pwa/subscriptionManager';

const getAdultUserId = () => {
  const token = localStorage.getItem('adultAccessToken');
  if (!token) return null;
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) { return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2); }).join(''));
    return JSON.parse(jsonPayload).sub;
  } catch { return null; }
};

export const PushNotificationTestCard: React.FC = () => {
  const { user } = useAdultAuth();
  const userId = user?.id || getAdultUserId();
  const [pushHealth, setPushHealth] = useState<PushHealthResult | null>(null);
  const [checkingPush, setCheckingPush] = useState(true);
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'waiting' | 'sent' | 'failed'>('idle');

  const refreshPushHealth = async (showRepairToast = false) => {
    if (!userId) { setCheckingPush(false); return null; }
    setCheckingPush(true);
    try {
      const result = await checkPushHealth(userId);
      setPushHealth(result);
      if (showRepairToast && result.status === 'healthy' && result.repaired) {
        toast.success('Push notifications were repaired on this device.');
      }
      return result;
    } finally { setCheckingPush(false); }
  };

  useEffect(() => {
    void refreshPushHealth();
  }, [userId]);

  const handleEnableNotifications = async () => {
    if (!userId) { toast.error('Unable to identify your account. Please sign in again.'); return; }
    setTestStatus('sending');
    try {
      const healthy = await requestAndSubscribe(userId);
      const result = await refreshPushHealth();
      if (healthy && result?.status === 'healthy') {
        setTestStatus('sent');
        toast.success('Notifications are enabled and connected on this device.');
      } else if (result?.status === 'permission_denied') {
        setTestStatus('failed');
        toast.error('Notifications are blocked. Allow them in your browser settings, then try again.');
      } else {
        setTestStatus('failed');
        toast.error('Notification setup could not be completed on this device.');
      }
    } catch (err) {
      console.error('[Settings] Notification setup failed:', err);
      setTestStatus('failed');
      toast.error('Could not repair push notifications. Please try again.');
    } finally {
      setTimeout(() => setTestStatus('idle'), 5000);
    }
  };

  const handleTestPush = async () => {
    if (!userId) { toast.error('Unable to identify your account. Please sign in again.'); return; }
    setTestStatus('sending');
    try {
      const permission = 'Notification' in window ? Notification.permission : 'unsupported';
      if (permission === 'unsupported') { setTestStatus('failed'); toast.error('This browser does not support push notifications.'); return; }
      if (permission !== 'granted') {
        const enabled = await requestAndSubscribe(userId);
        if (!enabled) {
          const result = await refreshPushHealth();
          setTestStatus('failed');
          toast.error(result?.status === 'permission_denied' ? 'Notifications are blocked in browser settings.' : 'Please allow notifications and try again.');
          return;
        }
      } else {
        const health = await checkPushHealth(userId);
        setPushHealth(health);
        if (health.status !== 'healthy') {
          const repaired = await refreshPushHealth(true);
          if (repaired?.status !== 'healthy') { setTestStatus('failed'); toast.error('Your device push subscription could not be repaired.'); return; }
        }
      }

      const result = await sendPushTest(userId, { onWaiting: () => setTestStatus('waiting') });
      if (result.success && result.deviceReceived) {
        setTestStatus('sent');
        setPushHealth(prev => prev ? { ...prev, status: 'healthy' } : prev);
        toast.success('Device received the test notification. Push is working.');
      } else {
        setTestStatus('failed');
        await refreshPushHealth();
        toast.error(result.reason || 'Push delivery could not be verified.');
      }
    } catch (err) {
      console.error('[Settings] Push test failed:', err);
      setTestStatus('failed');
      toast.error('Network or subscription error while testing push.');
    } finally {
      setTimeout(() => setTestStatus('idle'), 5000);
    }
  };

  const pushStatus = pushHealth?.status;
  const needsPermission = pushStatus === 'permission_required';
  const pushBlocked = pushStatus === 'permission_denied';
  const pushHealthy = pushStatus === 'healthy';
  const testBusy = testStatus === 'sending' || testStatus === 'waiting';

  return (
    <div className="mt-6 pt-6 border-t border-[var(--az-border)]/30">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h4 className="text-xs font-bold text-white uppercase tracking-wider">Push notifications</h4>
          <p className="text-[10px] text-[var(--az-text-secondary)] mt-1">
            {checkingPush
              ? 'Checking this device...'
              : pushHealthy
                ? 'This device is connected and ready to receive push notifications.'
                : needsPermission
                  ? 'Notifications are not enabled yet.'
                  : pushBlocked
                    ? 'Notifications are blocked in browser settings.'
                    : 'This device needs its push connection repaired.'}
          </p>
        </div>
        <div className="text-[10px] font-bold uppercase tracking-wider">
          {checkingPush ? 'Checking' : pushHealthy ? 'Connected' : 'Needs attention'}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        {!pushHealthy && !pushBlocked && (
          <button
            onClick={handleEnableNotifications}
            disabled={testBusy}
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl bg-[var(--az-accent-primary)] hover:bg-red-700 text-white disabled:opacity-50"
          >
            {needsPermission ? 'Enable Notifications' : 'Repair Notifications'}
          </button>
        )}
        {pushBlocked && (
          <button
            onClick={handleEnableNotifications}
            disabled={testBusy}
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl bg-[var(--az-accent-primary)] hover:bg-red-700 text-white disabled:opacity-50"
          >
            Try Again
          </button>
        )}
        <button
          onClick={handleTestPush}
          disabled={testBusy || checkingPush}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
            testStatus === 'idle'
              ? 'bg-[var(--az-accent-primary)] hover:bg-red-700 text-white'
              : testStatus === 'sent'
                ? 'bg-green-600 text-white'
                : testStatus === 'failed'
                  ? 'bg-red-900/50 text-red-200'
                  : 'bg-[var(--az-bg-tertiary)] text-[var(--az-text-secondary)] cursor-not-allowed'
          }`}
        >
          {testStatus === 'idle' && 'Send Test'}
          {testStatus === 'sending' && 'Preparing test...'}
          {testStatus === 'waiting' && 'Waiting for this device...'}
          {testStatus === 'sent' && '✓ Device received it'}
          {testStatus === 'failed' && '✕ Failed'}
        </button>
      </div>
    </div>
  );
};
export default PushNotificationTestCard;
