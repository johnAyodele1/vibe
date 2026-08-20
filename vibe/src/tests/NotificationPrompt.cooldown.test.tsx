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

  it('runs the real device test on entry, then skips it after leaving and returning within three hours', async () => {
    render(<NotificationPrompt userId="user-123" />);

    await waitForCheckingCycle();
    expect(sendPushTest).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
      window.dispatchEvent(new Event('pageshow'));
    });

    await waitForCheckingCycle();

    expect(sendPushTest).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Notifications enabled on this device')).toBeInTheDocument();
  });

  it('does not apply the cooldown to the explicit Settings push test', async () => {
    window.location.hash = '#push-test-section';
    render(<NotificationPrompt userId="user-123" />);

    await waitForCheckingCycle();

    expect(sendPushTest).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Test push notifications')).toBeInTheDocument();

    window.location.hash = '';
  });
});
