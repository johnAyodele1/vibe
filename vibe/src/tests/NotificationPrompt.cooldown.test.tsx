import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import NotificationPrompt, { _resetModuleStateForTesting } from '../components/pwa/NotificationPrompt';
import { checkPushHealth, sendPushTest } from '../lib/pwa/subscriptionManager';

const mockCtx = {
  isStandalone: false,
  isIOS: false,
  isAndroid: false,
  isSafari: false,
  iOSVersion: null as number | null,
  supportsPush: true,
  pushSupportedOnThisDevice: true,
  notificationPermission: 'granted' as NotificationPermission,
  canRequestPermission: false,
  alreadyGranted: true,
  denied: false,
};

const mockStore = { setShowNotifPrompt: vi.fn(), setShowInstallPrompt: vi.fn() };

vi.mock('../lib/pwa/context', () => ({ getInstallContext: () => mockCtx }));
vi.mock('../store/pwaPromptStore', () => ({
  usePWAPromptStore: () => mockStore,
  NOTIF_KEYS: { shownThisSession: 'zippo_notif_prompt_shown_session', lastShownAt: 'zippo_notif_prompt_last_shown_at', dismissed: 'zippo_notif_prompt_dismissed' },
}));
vi.mock('../lib/pwa/subscriptionManager', () => ({ checkPushHealth: vi.fn(), requestAndSubscribe: vi.fn(), sendPushTest: vi.fn() }));
vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));

const wait = async (ms = 1100) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });
const loginKey = 'zippo_push_test_after_login:user-123';
const exitKey = 'zippo_push_last_site_exit:user-123';
const testKey = 'zippo_push_last_health_test:user-123';

const healthyResult = {
  status: 'healthy',
  permission: 'granted',
  deviceId: 'device-test',
  hasBrowserSubscription: true,
  backendRegistered: true,
  repaired: false,
  lastSuccessfulPushAt: new Date().toISOString(),
  pushHealthStatus: 'healthy',
};

describe('NotificationPrompt three-hour re-verification and login behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    window.location.hash = '';
    _resetModuleStateForTesting();
    mockCtx.isStandalone = false;
    mockCtx.isIOS = false;
    (window as any).Notification = { permission: 'granted' };
    (checkPushHealth as any).mockResolvedValue(healthyResult);
    (sendPushTest as any).mockResolvedValue({ success: true, status: 'healthy', deliveredToProvider: true, deviceReceived: true });
  });

  it('checks health on startup, shows enabled state, then removes it after about two seconds without sending a test', async () => {
    render(<NotificationPrompt userId="user-123" />);
    await wait();
    expect(checkPushHealth).toHaveBeenCalledTimes(1);
    expect(sendPushTest).toHaveBeenCalledTimes(0);
    expect(screen.getByText('Notifications enabled on this device')).toBeInTheDocument();
    await wait(2100);
    expect(screen.queryByText('Notifications enabled on this device')).not.toBeInTheDocument();
  });

  it('sends a test push on every explicit login, regardless of the three-hour absence clock', async () => {
    localStorage.setItem(loginKey, '1');
    render(<NotificationPrompt userId="user-123" />);
    await wait();
    expect(sendPushTest).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(loginKey)).toBeNull();
  });

  it('sends a login test even when the user has not left the site for three hours', async () => {
    localStorage.setItem(loginKey, '1');
    localStorage.setItem(exitKey, String(Date.now() - 60 * 60 * 1000));
    render(<NotificationPrompt userId="user-123" />);
    await wait();
    expect(sendPushTest).toHaveBeenCalledTimes(1);
  });

  it('does not send an automatic test after less than three hours away', async () => {
    localStorage.setItem(exitKey, String(Date.now() - 60 * 60 * 1000));
    render(<NotificationPrompt userId="user-123" />);
    await wait();
    expect(sendPushTest).toHaveBeenCalledTimes(0);
    expect(screen.getByText('Notifications enabled on this device')).toBeInTheDocument();
  });

  it('sends one automatic test after the user has actually been away for three hours', async () => {
    localStorage.setItem(exitKey, String(Date.now() - (3 * 60 * 60 * 1000 + 1)));
    render(<NotificationPrompt userId="user-123" />);
    await wait();
    expect(sendPushTest).toHaveBeenCalledTimes(1);
    expect(Number(localStorage.getItem(testKey))).toBeGreaterThan(0);
  });

  it('does not send the automatic three-hour test twice for the same site exit', async () => {
    localStorage.setItem(exitKey, String(Date.now() - (3 * 60 * 60 * 1000 + 1)));
    localStorage.setItem(testKey, String(Date.now() - 1000));
    render(<NotificationPrompt userId="user-123" />);
    await wait();
    expect(sendPushTest).toHaveBeenCalledTimes(0);
  });

  it('prevents two independent login-triggered tests when the prompt mounts twice', async () => {
    localStorage.setItem(loginKey, '1');
    render(<><NotificationPrompt userId="user-123" /><NotificationPrompt userId="user-123" /></>);
    await wait();
    expect(sendPushTest).toHaveBeenCalledTimes(1);
  });

  it('prevents two independent automatic tests for the same three-hour exit when the prompt mounts twice', async () => {
    localStorage.setItem(exitKey, String(Date.now() - (3 * 60 * 60 * 1000 + 1)));
    localStorage.setItem(testKey, String(Date.now() - (4 * 60 * 60 * 1000)));
    render(<><NotificationPrompt userId="user-123" /><NotificationPrompt userId="user-123" /></>);
    await wait();
    expect(sendPushTest).toHaveBeenCalledTimes(1);
  });

  it('honors the three-hour rule after an installed iOS PWA is completely closed and reopened', async () => {
    mockCtx.isStandalone = true;
    mockCtx.isIOS = true;
    localStorage.setItem(exitKey, String(Date.now() - 60 * 60 * 1000));
    const firstRender = render(<NotificationPrompt userId="user-123" />);
    await wait();
    firstRender.unmount();
    render(<NotificationPrompt userId="user-123" />);
    await wait();
    expect(sendPushTest).toHaveBeenCalledTimes(0);
    expect(screen.getByText('Notifications enabled on this device')).toBeInTheDocument();
  });

  it('allows the automatic test after three hours on an iOS PWA cold reopen', async () => {
    mockCtx.isStandalone = true;
    mockCtx.isIOS = true;
    localStorage.setItem(exitKey, String(Date.now() - (3 * 60 * 60 * 1000 + 1)));
    render(<NotificationPrompt userId="user-123" />);
    await wait();
    expect(sendPushTest).toHaveBeenCalledTimes(1);
  });

  it('does not apply the automatic absence rule to the explicit Settings push test', async () => {
    window.location.hash = '#push-test-section';
    render(<NotificationPrompt userId="user-123" />);
    await wait();
    expect(sendPushTest).toHaveBeenCalledTimes(0);
    expect(screen.getByText('Test push notifications')).toBeInTheDocument();
    window.location.hash = '';
  });
});
