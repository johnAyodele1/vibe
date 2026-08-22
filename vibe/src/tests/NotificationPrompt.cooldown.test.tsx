import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import NotificationPrompt from '../components/pwa/NotificationPrompt';
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

const mockStore = {
  setShowNotifPrompt: vi.fn(),
  setShowInstallPrompt: vi.fn(),
};

vi.mock('../lib/pwa/context', () => ({
  getInstallContext: () => mockCtx,
}));

vi.mock('../store/pwaPromptStore', () => ({
  usePWAPromptStore: () => mockStore,
  NOTIF_KEYS: {
    shownThisSession: 'zippo_notif_prompt_shown_session',
    lastShownAt: 'zippo_notif_prompt_last_shown_at',
    dismissed: 'zippo_notif_prompt_dismissed',
  },
}));

vi.mock('../lib/pwa/subscriptionManager', () => ({
  checkPushHealth: vi.fn(),
  requestAndSubscribe: vi.fn(),
  sendPushTest: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const waitForCheckingCycle = async () => {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 1100));
  });
};

describe('NotificationPrompt three-hour re-verification cooldown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    window.location.hash = '';
    mockCtx.isStandalone = false;
    mockCtx.isIOS = false;
    (window as any).Notification = { permission: 'granted' };

    (checkPushHealth as any).mockResolvedValue({
      status: 'verification_required',
      permission: 'granted',
      deviceId: 'device-test',
      hasBrowserSubscription: true,
      backendRegistered: true,
      repaired: false,
      lastSuccessfulPushAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      pushHealthStatus: 'healthy',
    });

    (sendPushTest as any).mockResolvedValue({
      success: true,
      status: 'healthy',
      deliveredToProvider: true,
      deviceReceived: true,
    });
  });

  it('persists the cooldown when the health test succeeds', async () => {
    render(<NotificationPrompt userId="user-123" />);

    await waitForCheckingCycle();

    expect(sendPushTest).toHaveBeenCalledTimes(1);
    expect(Number(localStorage.getItem('zippo_push_last_health_test:user-123'))).toBeGreaterThan(0);
  });

  it('honors the cooldown after a Chrome page is destroyed and recreated', async () => {
    const firstRender = render(<NotificationPrompt userId="user-123" />);

    await waitForCheckingCycle();
    expect(sendPushTest).toHaveBeenCalledTimes(1);

    firstRender.unmount();

    render(<NotificationPrompt userId="user-123" />);
    await waitForCheckingCycle();

    expect(sendPushTest).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Notifications enabled on this device')).toBeInTheDocument();
  });

  it('honors the cooldown after an installed iOS PWA is completely closed and reopened', async () => {
    mockCtx.isStandalone = true;
    mockCtx.isIOS = true;
    localStorage.setItem('zippo_push_last_health_test:user-123', String(Date.now() - 60 * 60 * 1000));

    const firstRender = render(<NotificationPrompt userId="user-123" />);
    await waitForCheckingCycle();
    expect(sendPushTest).toHaveBeenCalledTimes(0);
    expect(screen.getByText('Notifications enabled on this device')).toBeInTheDocument();

    firstRender.unmount();
    render(<NotificationPrompt userId="user-123" />);
    await waitForCheckingCycle();

    expect(sendPushTest).toHaveBeenCalledTimes(0);
    expect(screen.getByText('Notifications enabled on this device')).toBeInTheDocument();
  });

  it('also honors the legacy site-exit cooldown on installed iOS PWA cold start', async () => {
    mockCtx.isStandalone = true;
    mockCtx.isIOS = true;
    localStorage.setItem('zippo_push_last_site_exit:user-123', String(Date.now() - 60 * 60 * 1000));

    render(<NotificationPrompt userId="user-123" />);
    await waitForCheckingCycle();

    expect(sendPushTest).toHaveBeenCalledTimes(0);
    expect(screen.getByText('Notifications enabled on this device')).toBeInTheDocument();
  });

  it('allows verification again after three hours', async () => {
    localStorage.setItem('zippo_push_last_health_test:user-123', String(Date.now() - (3 * 60 * 60 * 1000 + 1)));

    render(<NotificationPrompt userId="user-123" />);
    await waitForCheckingCycle();

    expect(sendPushTest).toHaveBeenCalledTimes(1);
  });

  it('does not apply the cooldown to the explicit Settings push test', async () => {
    window.location.hash = '#push-test-section';
    localStorage.setItem('zippo_push_last_health_test:user-123', String(Date.now() - 60 * 60 * 1000));
    render(<NotificationPrompt userId="user-123" />);

    await waitForCheckingCycle();

    expect(sendPushTest).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Test push notifications')).toBeInTheDocument();
  });
});
