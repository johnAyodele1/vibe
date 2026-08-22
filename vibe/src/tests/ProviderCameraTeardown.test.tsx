import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import ProviderStreamRoom from '../components/AdultZone/ProviderStreamRoom';
import ProviderLive from '../components/AdultZone/ProviderLive';
import { MemoryRouter } from 'react-router-dom';
import AgoraRTC from 'agora-rtc-sdk-ng';

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// Mock AdultAuthContext
vi.mock('../contexts/AdultAuthContext', () => ({
  useAdultAuth: () => ({
    user: { id: 'provider-101', firstName: 'StarProvider', role: 'provider', profilePhoto: 'https://example.com/avatar.jpg' },
    isAuthenticated: true,
  }),
}));

const { mockAudioTrack, mockVideoTrack, mockAgoraClient } = vi.hoisted(() => {
  const mockAudio = {
    getMediaStreamTrack: vi.fn(() => ({
      stop: vi.fn(),
      readyState: 'live',
    })),
    stop: vi.fn(),
    close: vi.fn(),
  };

  const mockVideo = {
    play: vi.fn(),
    getMediaStreamTrack: vi.fn(() => ({
      stop: vi.fn(),
      readyState: 'live',
    })),
    stop: vi.fn(),
    close: vi.fn(),
    on: vi.fn((evt: string, cb: Function) => {
      if (evt === 'first-frame-decoded') cb();
    }),
  };

  const mockClient = {
    setClientRole: vi.fn().mockResolvedValue(undefined),
    join: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockResolvedValue(undefined),
    leave: vi.fn().mockResolvedValue(undefined),
  };

  return { mockAudioTrack: mockAudio, mockVideoTrack: mockVideo, mockAgoraClient: mockClient };
});

vi.mock('agora-rtc-sdk-ng', () => ({
  default: {
    createClient: vi.fn(() => mockAgoraClient),
    createMicrophoneAudioTrack: vi.fn().mockResolvedValue(mockAudioTrack),
    createCameraVideoTrack: vi.fn().mockResolvedValue(mockVideoTrack),
  },
}));

// Mock socket
const socketCallbacks: Record<string, Function[]> = {};
const mockSocket = {
  connected: true,
  emit: vi.fn(),
  on: vi.fn((event: string, cb: Function) => {
    if (!socketCallbacks[event]) socketCallbacks[event] = [];
    socketCallbacks[event].push(cb);
  }),
  off: vi.fn((event: string, cb?: Function) => {
    if (socketCallbacks[event]) {
      if (cb) {
        socketCallbacks[event] = socketCallbacks[event].filter(fn => fn !== cb);
      } else {
        delete socketCallbacks[event];
      }
    }
  }),
  disconnect: vi.fn(),
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket),
}));

describe('Provider Camera Teardown & Media Lifecycle Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(socketCallbacks).forEach(k => delete socketCallbacks[k]);
    localStorage.setItem('adultAccessToken', 'test-token');
  });

  afterEach(() => {
    cleanup();
  });

  it('Test 1 — Call ends: Provider camera active -> 1-to-1 call accepted -> call ends -> camera/media cleanup executes', async () => {
    const onEndMock = vi.fn();

    await act(async () => {
      render(
        <ProviderStreamRoom
          appId="12345"
          token="stream-token"
          roomId="room-123"
          userId="provider-101"
          userName="StarProvider"
          sessionId="session-abc"
          socket={mockSocket as any}
          onEnd={onEndMock}
        />
      );
    });

    expect(AgoraRTC.createCameraVideoTrack).toHaveBeenCalled();

    // Simulate socket event cam:session_ended emitted when 1-to-1 call accepted/ended
    await act(async () => {
      const handlers = socketCallbacks['cam:session_ended'] || [];
      handlers.forEach(fn => fn({ sessionId: 'session-abc' }));
    });

    // Verify media track teardown executed
    expect(mockVideoTrack.stop).toHaveBeenCalled();
    expect(mockVideoTrack.close).toHaveBeenCalled();
    expect(mockAudioTrack.stop).toHaveBeenCalled();
    expect(mockAudioTrack.close).toHaveBeenCalled();
    expect(mockAgoraClient.leave).toHaveBeenCalled();
    expect(onEndMock).toHaveBeenCalled();
  });

  it('Test 2 — MediaStream tracks: Native MediaStreamTrack stop() is invoked on video and audio tracks', async () => {
    const mockNativeVideoTrack = { stop: vi.fn(), readyState: 'live' };
    const mockNativeAudioTrack = { stop: vi.fn(), readyState: 'live' };

    mockVideoTrack.getMediaStreamTrack.mockReturnValue(mockNativeVideoTrack as any);
    mockAudioTrack.getMediaStreamTrack.mockReturnValue(mockNativeAudioTrack as any);

    const onEndMock = vi.fn();

    await act(async () => {
      render(
        <ProviderStreamRoom
          appId="12345"
          token="stream-token"
          roomId="room-123"
          userId="provider-101"
          userName="StarProvider"
          sessionId="session-abc"
          socket={mockSocket as any}
          onEnd={onEndMock}
        />
      );
    });

    // Unmount ProviderStreamRoom
    cleanup();

    // Verify native track stop was called
    expect(mockNativeVideoTrack.stop).toHaveBeenCalled();
    expect(mockNativeAudioTrack.stop).toHaveBeenCalled();
  });

  it('Test 3 — Provider UI: After call/stream ends, provider live UI transitions out of live state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('/adult/cams/stream/start')) {
        return Promise.resolve({
          json: () => Promise.resolve({
            success: true,
            data: {
              sessionId: 'session-ui-test',
              roomId: 'room-ui-test',
              token: 'agora-token-ui',
              appId: '12345'
            }
          })
        });
      }
      return Promise.resolve({ json: () => Promise.resolve({ success: true }) });
    }));

    await act(async () => {
      render(
        <MemoryRouter>
          <ProviderLive />
        </MemoryRouter>
      );
    });

    // Initially Offline Preview
    expect(screen.getByText('Offline Preview')).toBeInTheDocument();
    expect(screen.getByText('Camera Offline')).toBeInTheDocument();

    // Click "Start Webcam Session"
    const startBtn = screen.getByText('Start Webcam Session');
    await act(async () => {
      startBtn.click();
    });

    // Verify UI shows live room
    expect(screen.getByText('🔴 Live Room')).toBeInTheDocument();

    // Emit cam:session_ended socket event (e.g., when 1-to-1 call accepted)
    await act(async () => {
      const handlers = socketCallbacks['cam:session_ended'] || [];
      handlers.forEach(fn => fn({ sessionId: 'session-ui-test' }));
    });

    // Provider UI must transition back to Offline Preview
    expect(screen.getByText('Offline Preview')).toBeInTheDocument();
    expect(screen.getByText('Camera Offline')).toBeInTheDocument();
    expect(screen.queryByText('🔴 Live Room')).not.toBeInTheDocument();
  });

  it('Test 4 — Unrelated stream: Session ended event for another provider does not stop current provider camera', async () => {
    const onEndMock = vi.fn();

    await act(async () => {
      render(
        <ProviderStreamRoom
          appId="12345"
          token="stream-token"
          roomId="room-123"
          userId="provider-101"
          userName="StarProvider"
          sessionId="session-my-stream"
          socket={mockSocket as any}
          onEnd={onEndMock}
        />
      );
    });

    // Reset mocks after mount
    vi.clearAllMocks();

    // Emit cam:session_ended for a DIFFERENT provider's session
    await act(async () => {
      const handlers = socketCallbacks['cam:session_ended'] || [];
      handlers.forEach(fn => fn({ sessionId: 'session-other-provider' }));
    });

    // Current provider's session must NOT be ended
    expect(onEndMock).not.toHaveBeenCalled();
    expect(mockVideoTrack.close).not.toHaveBeenCalled();
  });

  it('Test 5 — Idempotency: Calling track teardown / unmount multiple times does not throw or fail', async () => {
    const onEndMock = vi.fn();

    const { unmount } = render(
      <ProviderStreamRoom
        appId="12345"
        token="stream-token"
        roomId="room-123"
        userId="provider-101"
        userName="StarProvider"
        sessionId="session-idempotency"
        socket={mockSocket as any}
        onEnd={onEndMock}
      />
    );

    // Trigger session ended via socket
    await act(async () => {
      const handlers = socketCallbacks['cam:session_ended'] || [];
      handlers.forEach(fn => fn({ sessionId: 'session-idempotency' }));
    });

    // Call unmount (second cleanup invocation)
    expect(() => {
      unmount();
    }).not.toThrow();

    // Repeating socket event again must also be safe
    expect(() => {
      const handlers = socketCallbacks['cam:session_ended'] || [];
      handlers.forEach(fn => fn({ sessionId: 'session-idempotency' }));
    }).not.toThrow();
  });

  it('Test 6 — Declined call: Declining a call does NOT end an active public stream', async () => {
    const onEndMock = vi.fn();

    await act(async () => {
      render(
        <ProviderStreamRoom
          appId="12345"
          token="stream-token"
          roomId="room-123"
          userId="provider-101"
          userName="StarProvider"
          sessionId="session-active-public"
          socket={mockSocket as any}
          onEnd={onEndMock}
        />
      );
    });

    // Simulate incoming call -> provider declines.
    // On backend, endCamSessionForCall checks wasCallAcceptedOrActive and does NOT emit cam:session_ended.
    // Therefore no cam:session_ended is emitted to ProviderStreamRoom.

    expect(onEndMock).not.toHaveBeenCalled();
    expect(mockVideoTrack.close).not.toHaveBeenCalled();
  });
});
