import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { AdultCallProvider, useAdultCall } from '../components/AdultZone/AdultCallContext';
import { MemoryRouter } from 'react-router-dom';

// Mock dependencies
vi.mock('../contexts/AdultAuthContext', () => ({
  useAdultAuth: () => ({
    isAuthenticated: true,
    user: { id: 'user-123', firstName: 'User', role: 'user', credits: 100 },
  }),
}));

vi.mock('socket.io-client', () => {
  const listeners: Record<string, Function[]> = {};
  const mockSocket = {
    on: vi.fn((event: string, cb: Function) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
    }),
    emit: vi.fn(),
    disconnect: vi.fn(),
    __trigger: (event: string, payload: any) => {
      if (listeners[event]) {
        listeners[event].forEach(cb => cb(payload));
      }
    },
  };

  return {
    io: vi.fn(() => mockSocket),
    Socket: vi.fn(),
  };
});

vi.mock('../components/AdultZone/CallRoom', () => ({
  default: (props: any) => (
    <div data-testid="mock-call-room">
      <span data-testid="partner-name">{props.partnerName}</span>
      <span data-testid="partner-avatar">{props.partnerAvatar}</span>
      <button data-testid="mock-end-call-btn" onClick={() => props.onCallEnd(120)}>
        End Call
      </button>
    </div>
  ),
}));

const TestComponent: React.FC = () => {
  const { initiateCall, callState, activeCall } = useAdultCall();
  return (
    <div>
      <span data-testid="call-state">{callState}</span>
      <span data-testid="active-call-id">{activeCall?.callId || 'none'}</span>
      <button
        data-testid="trigger-initiate-btn"
        onClick={() => initiateCall('provider-456', 'video', 10, 'conv-789', { displayName: 'Real Provider', avatarUrl: 'https://example.com/real-provider.jpg' })}
      >
        Start Call
      </button>
    </div>
  );
};

describe('AdultCallManager and AdultCallProvider Route-Independent Call Signaling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('adultAccessToken', 'mock-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    cleanup();
  });

  it('renders children and manages incoming call state independently of current route', async () => {
    const { io } = await import('socket.io-client');

    render(
      <MemoryRouter>
        <AdultCallProvider>
          <TestComponent />
        </AdultCallProvider>
      </MemoryRouter>
    );

    const mockSocket = (io as any)();

    await act(async () => {
      mockSocket.__trigger('call:incoming', {
        callId: 'call-999',
        callerId: 'provider-111',
        callerName: 'Real Provider',
        callerAvatar: 'https://example.com/real-provider.jpg',
        type: 'video',
        webrtcRoomId: 'room_999',
        rate: 15,
      });
    });

    expect(screen.getByTestId('global-incoming-call-modal')).toBeInTheDocument();
    expect(screen.getByText('Real Provider')).toBeInTheDocument();
    expect(screen.getByText('Rate: 💎 15 credits / min')).toBeInTheDocument();
    const avatarImg = screen.getByAltText('Real Provider') as HTMLImageElement;
    expect(avatarImg.src).toContain('https://example.com/real-provider.jpg');
  });

  it('passes real provider avatar to active CallRoom and presents restored summary UI on end', async () => {
    const { io } = await import('socket.io-client');

    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('/calls/initiate')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            callId: 'call-888',
            webrtcRoomId: 'room_888',
            perMinuteRate: 10,
            receiver: { id: 'provider-456', displayName: 'Real Provider', avatarUrl: 'https://example.com/real-provider.jpg' }
          }),
        });
      }
      if (url.includes('/zego/token')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ token: 'zego-test-token', appId: 12345 }),
        });
      }
      if (url.includes('/calls/call-888/end')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }));

    render(
      <MemoryRouter>
        <AdultCallProvider>
          <TestComponent />
        </AdultCallProvider>
      </MemoryRouter>
    );

    const mockSocket = (io as any)();

    // Start outgoing call
    const startBtn = screen.getByTestId('trigger-initiate-btn');
    await act(async () => {
      fireEvent.click(startBtn);
    });

    expect(screen.getByTestId('global-outgoing-call-modal')).toBeInTheDocument();
    expect(screen.getByText('Real Provider')).toBeInTheDocument();

    // Provider accepts
    await act(async () => {
      mockSocket.__trigger('call:accepted', { callId: 'call-888', webrtcRoomId: 'room_888' });
    });

    expect(screen.getByTestId('global-active-call-room')).toBeInTheDocument();
    expect(screen.getByTestId('partner-name')).toHaveTextContent('Real Provider');
    expect(screen.getByTestId('partner-avatar')).toHaveTextContent('https://example.com/real-provider.jpg');

    // End call from CallRoom
    const endCallBtn = screen.getByTestId('mock-end-call-btn');
    await act(async () => {
      fireEvent.click(endCallBtn);
    });

    // Check restored Call Ending Summary UI
    expect(screen.getByTestId('global-terminal-call-modal')).toBeInTheDocument();
    expect(screen.getByText('Call Ended')).toBeInTheDocument();
    expect(screen.getByText('Duration:')).toBeInTheDocument();
    expect(screen.getByText('02:00')).toBeInTheDocument(); // 120s = 02:00
    expect(screen.getByText('Credits Charged:')).toBeInTheDocument();

    // Dismiss summary
    const closeBtn = screen.getByTestId('dismiss-terminal-call-btn');
    await act(async () => {
      fireEvent.click(closeBtn);
    });

    expect(screen.getByTestId('call-state')).toHaveTextContent('idle');
  });

  it('renders summary no-charge messaging for declined calls', async () => {
    const { io } = await import('socket.io-client');

    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('/calls/initiate')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ callId: 'call-777', webrtcRoomId: 'room_777', perMinuteRate: 10 }),
        });
      }
      if (url.includes('/zego/token')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ token: 'zego-test-token', appId: 12345 }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }));

    render(
      <MemoryRouter>
        <AdultCallProvider>
          <TestComponent />
        </AdultCallProvider>
      </MemoryRouter>
    );

    const mockSocket = (io as any)();

    const startBtn = screen.getByTestId('trigger-initiate-btn');
    await act(async () => {
      fireEvent.click(startBtn);
    });

    // Trigger call:declined
    await act(async () => {
      mockSocket.__trigger('call:declined', { callId: 'call-777' });
    });

    expect(screen.getByTestId('global-terminal-call-modal')).toBeInTheDocument();
    expect(screen.getByText('Call Declined')).toBeInTheDocument();
    expect(screen.getByText('No charge')).toBeInTheDocument();

    // Dismiss modal
    await act(async () => {
      fireEvent.click(screen.getByTestId('dismiss-terminal-call-btn'));
    });
    expect(screen.getByTestId('call-state')).toHaveTextContent('idle');
  });

  it('surfaces backend error message when user has insufficient balance', async () => {
    const { toast } = await import('sonner');
    const toastSpy = vi.spyOn(toast, 'error');

    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('/calls/initiate')) {
        return Promise.resolve({
          ok: false,
          status: 402,
          json: () => Promise.resolve({ success: false, error: 'Insufficient credits to start call' }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, conversationId: 'conv-789' }) });
    }));

    render(
      <MemoryRouter>
        <AdultCallProvider>
          <TestComponent />
        </AdultCallProvider>
      </MemoryRouter>
    );

    const startBtn = screen.getByTestId('trigger-initiate-btn');
    await act(async () => {
      fireEvent.click(startBtn);
    });

    expect(toastSpy).toHaveBeenCalledWith('Insufficient credits to start call');
    expect(screen.getByTestId('call-state')).toHaveTextContent('idle');
  });

  it('surfaces backend error message when provider is busy', async () => {
    const { toast } = await import('sonner');
    const toastSpy = vi.spyOn(toast, 'error');

    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('/calls/initiate')) {
        return Promise.resolve({
          ok: false,
          status: 409,
          json: () => Promise.resolve({ success: false, error: 'This provider is busy. Try again later.' }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, conversationId: 'conv-789' }) });
    }));

    render(
      <MemoryRouter>
        <AdultCallProvider>
          <TestComponent />
        </AdultCallProvider>
      </MemoryRouter>
    );

    const startBtn = screen.getByTestId('trigger-initiate-btn');
    await act(async () => {
      fireEvent.click(startBtn);
    });

    expect(toastSpy).toHaveBeenCalledWith('This provider is busy. Try again later.');
    expect(screen.getByTestId('call-state')).toHaveTextContent('idle');
  });

  it('surfaces backend error message when caller is already active on another device', async () => {
    const { toast } = await import('sonner');
    const toastSpy = vi.spyOn(toast, 'error');

    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('/calls/initiate')) {
        return Promise.resolve({
          ok: false,
          status: 409,
          json: () => Promise.resolve({ success: false, error: 'You are already on a call on another device.' }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, conversationId: 'conv-789' }) });
    }));

    render(
      <MemoryRouter>
        <AdultCallProvider>
          <TestComponent />
        </AdultCallProvider>
      </MemoryRouter>
    );

    const startBtn = screen.getByTestId('trigger-initiate-btn');
    await act(async () => {
      fireEvent.click(startBtn);
    });

    expect(toastSpy).toHaveBeenCalledWith('You are already on a call on another device.');
    expect(screen.getByTestId('call-state')).toHaveTextContent('idle');
  });

  it('surfaces token acquisition error when zego token fetch returns no token', async () => {
    const { toast } = await import('sonner');
    const toastSpy = vi.spyOn(toast, 'error');

    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('/calls/initiate')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ callId: 'call-555', webrtcRoomId: 'room_555', perMinuteRate: 10 }),
        });
      }
      if (url.includes('/zego/token')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ error: 'Token generation failed' }),
        });
      }
      if (url.includes('/calls/call-555/end')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, conversationId: 'conv-789' }) });
    }));

    render(
      <MemoryRouter>
        <AdultCallProvider>
          <TestComponent />
        </AdultCallProvider>
      </MemoryRouter>
    );

    const startBtn = screen.getByTestId('trigger-initiate-btn');
    await act(async () => {
      fireEvent.click(startBtn);
    });

    expect(toastSpy).toHaveBeenCalledWith('Failed to obtain call connection token');
    expect(screen.getByTestId('call-state')).toHaveTextContent('idle');
  });

  it('surfaces generic error message on unexpected network failure', async () => {
    const { toast } = await import('sonner');
    const toastSpy = vi.spyOn(toast, 'error');

    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('/calls/initiate')) {
        return Promise.reject(new Error('Network offline'));
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, conversationId: 'conv-789' }) });
    }));

    render(
      <MemoryRouter>
        <AdultCallProvider>
          <TestComponent />
        </AdultCallProvider>
      </MemoryRouter>
    );

    const startBtn = screen.getByTestId('trigger-initiate-btn');
    await act(async () => {
      fireEvent.click(startBtn);
    });

    expect(toastSpy).toHaveBeenCalledWith('Network offline');
    expect(screen.getByTestId('call-state')).toHaveTextContent('idle');
  });

  it('calculates first-minute charge for ended calls under 10 seconds and omits free text', async () => {
    const { io } = await import('socket.io-client');

    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('/calls/initiate')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ callId: 'call-666', webrtcRoomId: 'room_666', perMinuteRate: 10 }),
        });
      }
      if (url.includes('/zego/token')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ token: 'zego-test-token', appId: 12345 }),
        });
      }
      if (url.includes('/calls/call-666/end')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }));

    render(
      <MemoryRouter>
        <AdultCallProvider>
          <TestComponent />
        </AdultCallProvider>
      </MemoryRouter>
    );

    const mockSocket = (io as any)();

    const startBtn = screen.getByTestId('trigger-initiate-btn');
    await act(async () => {
      fireEvent.click(startBtn);
    });

    await act(async () => {
      mockSocket.__trigger('call:accepted', { callId: 'call-666', webrtcRoomId: 'room_666' });
    });

    // Call ends with 5 seconds duration
    await act(async () => {
      mockSocket.__trigger('call:ended', { callId: 'call-666', reason: 'hung_up', durationSeconds: 5 });
    });

    expect(screen.getByTestId('global-terminal-call-modal')).toBeInTheDocument();
    expect(screen.getByText('Call Ended')).toBeInTheDocument();
    expect(screen.getByText('00:05')).toBeInTheDocument();
    expect(screen.getByText('Credits Charged:')).toBeInTheDocument();
    expect(screen.getByText(/💎 10/)).toBeInTheDocument(); // 1 minute @ rate 10 = 10
    expect(screen.queryByText(/No charge — calls under 10 seconds are free/i)).not.toBeInTheDocument();
  });
});
