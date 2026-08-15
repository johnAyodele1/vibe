import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import NotificationPrompt from '../components/pwa/NotificationPrompt';
import { checkPushHealth } from '../lib/pwa/subscriptionManager';
import { toast } from 'sonner';

const mockCtx = {
  isStandalone: false,
  isIOS: false,
  isAndroid: false,
  isSafari: false,
  iOSVersion: null as number | null,
  supportsPush: true,
  pushSupportedOnThisDevice: true,
  notificationPermission: 'default' as NotificationPermission | null,
  canRequestPermission: true,
  alreadyGranted: false,
  denied: false,
};

vi.mock('../lib/pwa/context', () => ({
  getInstallContext: () => mockCtx,
}));

const mockStore = {
  showNotifPrompt: false,
  showInstallPrompt: false,
  setShowNotifPrompt: vi.fn(),
  setShowInstallPrompt: vi.fn(),
  shouldShowInstallPrompt: vi.fn().mockReturnValue(true),
  shouldShowNotifPrompt: vi.fn().mockReturnValue(true),
  recordInstallPromptShown: vi.fn(),
};

vi.mock('../store/pwaPromptStore', () => ({
  usePWAPromptStore: () => mockStore,
  NOTIF_KEYS: {
    shownThisSession: 'zippo_notif_prompt_shown_session',
    lastShownAt: 'zippo_notif_prompt_last_shown_at',
    dismissed: 'zippo_notif_prompt_dismissed',
  },
}));

vi.mock('../lib/pwa/subscriptionManager', () => ({
  checkPushHealth: vi.fn().mockResolvedValue({
    status: 'permission_required',
    permission: 'default',
    deviceId: 'device-test',
    hasBrowserSubscription: false,
    backendRegistered: false,
    repaired: false,
  }),
  requestAndSubscribe: vi.fn().mockImplementation(async () => {
    if (typeof window !== 'undefined' && (window as any).Notification) {
      await (window as any).Notification.requestPermission();
    }
    return true;
  }),
  sendPushTest: vi.fn().mockResolvedValue({
    success: true,
    status: 'healthy',
    deliveredToProvider: true,
    deviceReceived: true,
  }),
}));

vi.mock('../lib/pwa/pushSelfTest', () => ({
  runPushSelfTest: vi.fn().mockResolvedValue('success'),
}));

vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('NotificationPrompt Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();

    mockCtx.isStandalone = false;
    mockCtx.isIOS = false;
    mockCtx.isAndroid = false;
    mockCtx.isSafari = false;
    mockCtx.iOSVersion = null;
    mockCtx.supportsPush = true;
    mockCtx.pushSupportedOnThisDevice = true;
    mockCtx.notificationPermission = 'default';
    mockCtx.canRequestPermission = true;
    mockCtx.alreadyGranted = false;
    mockCtx.denied = false;

    mockStore.showNotifPrompt = false;
    mockStore.showInstallPrompt = false;

    (window as any).Notification = {
      permission: 'default',
      requestPermission: vi.fn().mockResolvedValue('granted'),
    };
  });

  it('does not render when health check determines unsupported', async () => {
    (checkPushHealth as any).mockResolvedValueOnce({
      status: 'unsupported',
    });
    render(<NotificationPrompt userId="user-123" />);

    await act(async () => {
      await new Promise(r => setTimeout(r, 1100));
    });

    expect(screen.queryByTestId('notification-prompt')).not.toBeInTheDocument();
  });

  it('renders correctly when showNotifPrompt is true after health check', async () => {
    mockStore.showNotifPrompt = true;
    render(<NotificationPrompt userId="user-123" />);

    await act(async () => {
      await new Promise(r => setTimeout(r, 1100));
    });

    expect(screen.getByTestId('notification-prompt')).toBeInTheDocument();
    expect(screen.getByText('Stay in the loop')).toBeInTheDocument();
    expect(screen.getByText('Enable')).toBeInTheDocument();
  });

  it('shows the iOS Add to Home Screen hint on iOS when NOT in standalone mode', () => {
    mockStore.showNotifPrompt = true;
    mockCtx.isIOS = true;
    mockCtx.isStandalone = false;
    mockCtx.pushSupportedOnThisDevice = false;

    render(<NotificationPrompt userId="user-123" />);

    expect(screen.getByTestId('aths-hint')).toBeInTheDocument();
    expect(screen.getByText('Get the full Zippo experience')).toBeInTheDocument();
  });

  it('requests notification permission when the user clicks Enable in standalone', async () => {
    mockStore.showNotifPrompt = true;
    mockCtx.isStandalone = true;

    (checkPushHealth as any)
      .mockResolvedValueOnce({
        status: 'permission_required',
        permission: 'default',
        deviceId: 'device-test',
      })
      .mockResolvedValueOnce({
        status: 'healthy',
        permission: 'granted',
        deviceId: 'device-test',
      });

    render(<NotificationPrompt userId="user-123" />);

    await act(async () => {
      await new Promise(r => setTimeout(r, 1100));
    });

    const enableBtn = screen.getByText('Enable');
    await act(async () => {
      fireEvent.click(enableBtn);
    });

    expect((window as any).Notification.requestPermission).toHaveBeenCalled();
  });

  it('dismisses correctly when close is clicked on iOS Add to Home Screen hint', async () => {
    mockStore.showNotifPrompt = true;
    mockCtx.isIOS = true;
    mockCtx.isStandalone = false;

    render(<NotificationPrompt userId="user-123" />);

    const closeBtn = screen.getByLabelText('Close add to home screen hint');
    fireEvent.click(closeBtn);

    expect(mockStore.setShowNotifPrompt).toHaveBeenCalledWith(false);
  });

  it('handles non-standalone Android users with toast suggestion on Enable click', async () => {
    mockStore.showNotifPrompt = true;
    mockCtx.isAndroid = true;
    mockCtx.isStandalone = false;

    (checkPushHealth as any)
      .mockResolvedValueOnce({
        status: 'permission_required',
        permission: 'default',
        deviceId: 'device-test',
      })
      .mockResolvedValueOnce({
        status: 'healthy',
        permission: 'granted',
        deviceId: 'device-test',
      });

    render(<NotificationPrompt userId="user-123" />);

    await act(async () => {
      await new Promise(r => setTimeout(r, 1100));
    });

    const enableBtn = screen.getByText('Enable');
    await act(async () => {
      fireEvent.click(enableBtn);
    });

    expect((window as any).Notification.requestPermission).toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith(
      'Install Zippo to your home screen for the best experience',
      { duration: 3000 }
    );
  });
});
