import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import NotificationPrompt from '../components/pwa/NotificationPrompt';

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

// Mock pushSubscription functions
vi.mock('../lib/push/pushSubscription', () => ({
  registerServiceWorker: vi.fn().mockResolvedValue({}),
  subscribeToPush: vi.fn().mockResolvedValue(true),
}));

describe('NotificationPrompt Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.useFakeTimers();

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

    // Mock window.matchMedia
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(), // deprecated
        removeListener: vi.fn(), // deprecated
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    // Mock window.Notification object
    (window as any).Notification = {
      permission: 'default',
      requestPermission: vi.fn().mockResolvedValue('granted'),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not render initially (before the 5 seconds delay)', () => {
    render(<NotificationPrompt userId="user-123" />);
    expect(screen.queryByTestId('notification-prompt')).not.toBeInTheDocument();
  });

  it('renders correctly after the 5 seconds delay when eligible', () => {
    render(<NotificationPrompt userId="user-123" />);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByTestId('notification-prompt')).toBeInTheDocument();
    expect(screen.getByText('Stay in the loop')).toBeInTheDocument();
    expect(screen.getByText('Enable')).toBeInTheDocument();
  });

  it('does not render if already dismissed in session storage', () => {
    sessionStorage.setItem('zippo_notif_prompt_dismissed', '1');
    render(<NotificationPrompt userId="user-123" />);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.queryByTestId('notification-prompt')).not.toBeInTheDocument();
  });

  it('shows the iOS Add to Home Screen hint on iOS when NOT in standalone mode', () => {
    mockCtx.isIOS = true;
    mockCtx.isStandalone = false;
    mockCtx.pushSupportedOnThisDevice = false;

    render(<NotificationPrompt userId="user-123" />);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByTestId('aths-hint')).toBeInTheDocument();
    expect(screen.getByText('Add Zippo to your Home Screen')).toBeInTheDocument();
  });

  it('requests notification permission synchronously when the user clicks Enable', async () => {
    render(<NotificationPrompt userId="user-123" />);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    const enableBtn = screen.getByText('Enable');
    await act(async () => {
      fireEvent.click(enableBtn);
    });

    expect((window as any).Notification.requestPermission).toHaveBeenCalled();
  });
});
