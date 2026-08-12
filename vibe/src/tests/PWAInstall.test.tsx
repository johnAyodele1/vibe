import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { InstallPrompt } from '../components/pwa/InstallPrompt/InstallPrompt';

// Mock the PWA Context
const mockPwaState = {
  isInstallable: false,
  isStandalone: false,
  isIOS: false,
  installApp: vi.fn().mockResolvedValue(undefined),
  notificationPermission: 'default',
  requestNotificationPermission: vi.fn(),
};

vi.mock('../contexts/PWAContext', () => ({
  usePWA: () => mockPwaState,
}));

// Mock usePWAPromptStore
const mockStore = {
  showInstallPrompt: true, // Allow CTA to show in tests
  setShowInstallPrompt: vi.fn(),
  dismissInstallPrompt: vi.fn().mockImplementation(() => {
    mockStore.showInstallPrompt = false;
  }),
};

vi.mock('../store/pwaPromptStore', () => ({
  usePWAPromptStore: () => mockStore,
}));

describe('PWA Installation Flow', () => {
  const originalUserAgent = navigator.userAgent;

  const mockUserAgent = (ua: string) => {
    Object.defineProperty(navigator, 'userAgent', {
      value: ua,
      configurable: true,
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Default to clean state
    mockPwaState.isInstallable = false;
    mockPwaState.isStandalone = false;
    mockPwaState.isIOS = false;
    mockStore.showInstallPrompt = true;

    // Fast-forward timers
    vi.useFakeTimers();

    // Default to mobile width
    Object.defineProperty(window, 'innerWidth', {
      value: 375,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUserAgent,
      configurable: true,
    });
    Object.defineProperty(window, 'innerWidth', {
      value: 1024,
      configurable: true,
    });
  });

  it('does not show the PWA CTA initially before the load delay (2 seconds)', () => {
    mockUserAgent('Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Mobile Safari/537.36');
    mockPwaState.isInstallable = true;

    render(<InstallPrompt />);

    // Before timer, should not be in document
    expect(screen.queryByTestId('pwa-install-cta')).not.toBeInTheDocument();

    // Fast-forward delay (2000ms)
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByTestId('pwa-install-cta')).toBeInTheDocument();
  });

  it('does not show the CTA on desktop screen widths', () => {
    mockUserAgent('Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Mobile Safari/537.36');
    mockPwaState.isInstallable = true;

    // Set screen width to desktop
    Object.defineProperty(window, 'innerWidth', {
      value: 1024,
      configurable: true,
    });

    render(<InstallPrompt />);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.queryByTestId('pwa-install-cta')).not.toBeInTheDocument();
  });

  it('does not show the CTA if already running standalone', () => {
    mockUserAgent('Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Mobile Safari/537.36');
    mockPwaState.isInstallable = true;
    mockPwaState.isStandalone = true;

    render(<InstallPrompt />);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.queryByTestId('pwa-install-cta')).not.toBeInTheDocument();
  });

  it('handles the Android Chrome native install flow upon clicking Install', async () => {
    mockUserAgent('Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Mobile Safari/537.36');
    mockPwaState.isInstallable = true;

    render(<InstallPrompt />);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    const installBtn = screen.getByText('Install');
    await act(async () => {
      fireEvent.click(installBtn);
    });

    // Should have invoked the standard installApp context function
    expect(mockPwaState.installApp).toHaveBeenCalled();
  });

  it('shows manual Chrome installation instructions on Android if isInstallable is false', async () => {
    mockUserAgent('Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Mobile Safari/537.36');
    mockPwaState.isInstallable = false;

    render(<InstallPrompt />);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // Floating banner shows up
    expect(screen.getByTestId('pwa-install-cta')).toBeInTheDocument();

    // Click Install
    const installBtn = screen.getByText('Install');
    await act(async () => {
      fireEvent.click(installBtn);
    });

    // Floating banner is hidden or instructions are displayed
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Add Zippo to your Home Screen')).toBeInTheDocument();
    expect(screen.getByText(/Tap the menu icon/)).toBeInTheDocument();

    // Click 'Got it' to dismiss
    const gotItBtn = screen.getByText('Got it');
    fireEvent.click(gotItBtn);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows detailed Safari Add to Home Screen instructions on iOS/Safari platform', async () => {
    mockUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1');
    mockPwaState.isIOS = true;

    render(<InstallPrompt />);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // Floating banner shows up
    expect(screen.getByTestId('pwa-install-cta')).toBeInTheDocument();

    // Click Install
    const installBtn = screen.getByText('Install');
    await act(async () => {
      fireEvent.click(installBtn);
    });

    // Floating banner is hidden or instructions are displayed
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Add Zippo to your Home Screen')).toBeInTheDocument();
    expect(screen.getByText(/Tap the Share icon/)).toBeInTheDocument();

    // Click 'Got it' to dismiss
    const gotItBtn = screen.getByText('Got it');
    fireEvent.click(gotItBtn);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('persists a 3-day cooldown on close/temporary dismissal', () => {
    mockUserAgent('Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Mobile Safari/537.36');
    mockPwaState.isInstallable = true;

    const { unmount } = render(<InstallPrompt />);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    const closeBtn = screen.getByLabelText('Close installation prompt');
    fireEvent.click(closeBtn);

    // Prompt is now removed from view
    expect(screen.queryByTestId('pwa-install-cta')).not.toBeInTheDocument();

    // Cooldown is set in localStorage
    const until = localStorage.getItem('zippo_pwa_dismiss_until');
    expect(until).toBeTruthy();
    expect(Date.now() < parseInt(until!, 10)).toBe(true);

    // Unmount and re-render to check persistence behavior
    unmount();
    render(<InstallPrompt />);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // Should NOT show CTA because cooldown is active
    expect(screen.queryByTestId('pwa-install-cta')).not.toBeInTheDocument();
  });

  it('persists permanent dismissal upon selecting Don\'t show again', () => {
    mockUserAgent('Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Mobile Safari/537.36');
    mockPwaState.isInstallable = true;

    const { unmount } = render(<InstallPrompt />);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    const permanentBtn = screen.getByText("Don't show again");
    fireEvent.click(permanentBtn);

    // Check localStorage
    expect(localStorage.getItem('zippo_pwa_dismiss_permanent')).toBe('true');

    // Re-render
    unmount();
    render(<InstallPrompt />);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.queryByTestId('pwa-install-cta')).not.toBeInTheDocument();
  });
});
