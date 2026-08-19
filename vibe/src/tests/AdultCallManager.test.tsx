import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import React from 'react';
import { AdultCallProvider, useAdultCall } from '../components/AdultZone/AdultCallContext';
import { MemoryRouter } from 'react-router-dom';

// Mock dependencies
vi.mock('../contexts/AdultAuthContext', () => ({
  useAdultAuth: () => ({
    isAuthenticated: true,
    user: { id: 'provider-123', firstName: 'Provider', role: 'provider' },
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
    // Helper for tests to trigger socket events
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
  default: () => <div data-testid="mock-call-room">CallRoom Active</div>,
}));

const TestComponent: React.FC = () => {
  const { initiateCall, callState, activeCall } = useAdultCall();
  return (
    <div>
      <span data-testid="call-state">{callState}</span>
      <span data-testid="active-call-id">{activeCall?.callId || 'none'}</span>
      <button
        data-testid="trigger-initiate-btn"
        onClick={() => initiateCall('user-456', 'video', 10, 'conv-789')}
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
    global.fetch = vi.fn();
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

    // Trigger socket incoming call event while provider is on Home route
    await act(async () => {
      mockSocket.__trigger('call:incoming', {
        callId: 'call-999',
        callerId: 'caller-111',
        callerName: 'Jane Caller',
        callerAvatar: 'https://example.com/avatar.jpg',
        type: 'video',
        webrtcRoomId: 'room_999',
        rate: 15,
      });
    });

    expect(screen.getByTestId('global-incoming-call-modal')).toBeInTheDocument();
    expect(screen.getByText('Jane Caller')).toBeInTheDocument();
    expect(screen.getByText('Rate: 💎 15 credits / min')).toBeInTheDocument();
  });

  it('accepts incoming call, fetches connection token with exact webrtcRoomId, and transitions to active CallRoom', async () => {
    const { io } = await import('socket.io-client');

    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/calls/call-999/accept')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ webrtcRoomId: 'room_999', perMinuteRate: 15 }),
        });
      }
      if (url.includes('/zego/token')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ token: 'zego-test-token', appId: 12345 }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

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
        callerId: 'caller-111',
        callerName: 'Jane Caller',
        type: 'video',
        webrtcRoomId: 'room_999',
        rate: 15,
      });
    });

    const acceptBtn = screen.getByTestId('accept-call-btn');
    await act(async () => {
      fireEvent.click(acceptBtn);
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/calls/call-999/accept'),
      expect.any(Object)
    );
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/zego/token?roomId=room_999&type=call'),
      expect.any(Object)
    );

    expect(screen.getByTestId('global-active-call-room')).toBeInTheDocument();
    expect(screen.getByTestId('mock-call-room')).toBeInTheDocument();
  });

  it('cleans up call on backend if connection token fetch fails during acceptance', async () => {
    const { io } = await import('socket.io-client');

    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/calls/call-999/accept')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ webrtcRoomId: 'room_999', perMinuteRate: 15 }),
        });
      }
      if (url.includes('/zego/token')) {
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: 'Token service unavailable' }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

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
        callerId: 'caller-111',
        callerName: 'Jane Caller',
        type: 'video',
        webrtcRoomId: 'room_999',
        rate: 15,
      });
    });

    const acceptBtn = screen.getByTestId('accept-call-btn');
    await act(async () => {
      fireEvent.click(acceptBtn);
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/calls/call-999/end'),
      expect.objectContaining({
        body: JSON.stringify({ reason: 'connection_failed' }),
      })
    );

    expect(screen.getByTestId('call-state')).toHaveTextContent('idle');
  });

  it('cancels outgoing call and notifies backend with reason cancelled_by_caller', async () => {
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/calls/initiate')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ callId: 'call-888', webrtcRoomId: 'room_888', perMinuteRate: 10 }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

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

    expect(screen.getByTestId('global-outgoing-call-modal')).toBeInTheDocument();

    const cancelBtn = screen.getByTestId('cancel-call-btn');
    await act(async () => {
      fireEvent.click(cancelBtn);
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/calls/call-888/end'),
      expect.objectContaining({
        body: JSON.stringify({ reason: 'cancelled_by_caller' }),
      })
    );

    expect(screen.getByTestId('call-state')).toHaveTextContent('idle');
  });
});
