import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import NotificationPrompt from '../components/pwa/NotificationPrompt';
import { toast } from 'sonner';

// Mock getInstallContext
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

// Mock usePWAPromptStore
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
    lastShownAt:      'zippo_notif_prompt_last_shown_at',
    dismissed:        'zippo_notif_prompt_dismissed',
  },
}));

// Mock pushSubscription functions
vi.mock('../lib/push/pushSubscription', () => ({
  registerServiceWorker: vi.fn().mockResolvedValue({}),
  subscribeToPush: vi.fn().mockResolvedValue(true),
}));

// Mock pushSelfTest
vi.mock('../lib/pwa/pushSelfTest', () => ({
  runPushSelfTest: vi.fn().mockResolvedValue('success'),
}));

// Mock sonner toast
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

    // Default clean state
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

    // Mock window.Notification object
    (window as any).Notification = {
      permission: 'default',
      requestPermission: vi.fn().mockResolvedValue('granted'),
    };
  });

  it('does not render when showNotifPrompt is false', () => {
    render(<NotificationPrompt userId="user-123" />);
    expect(screen.queryByTestId('notification-prompt')).not.toBeInTheDocument();
  });

  it('renders correctly when showNotifPrompt is true', () => {
    mockStore.showNotifPrompt = true;
    render(<NotificationPrompt userId="user-123" />);

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
    expect(screen.getByText('Add Zippo to your Home Screen')).toBeInTheDocument();
  });

  it('requests notification permission when the user clicks Enable in standalone', async () => {
    mockStore.showNotifPrompt = true;
    mockCtx.isStandalone = true;

    render(<NotificationPrompt userId="user-123" />);

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

    render(<NotificationPrompt userId="user-123" />);

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
