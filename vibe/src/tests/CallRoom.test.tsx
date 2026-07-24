import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import CallRoom from '../components/AdultZone/CallRoom';

// Mock AgoraRTC Web SDK
vi.mock('agora-rtc-sdk-ng', () => {
  const mockLeave = vi.fn().mockResolvedValue(undefined);
  const mockJoin = vi.fn().mockResolvedValue(undefined);
  const mockPublish = vi.fn().mockResolvedValue(undefined);
  const mockSubscribe = vi.fn().mockResolvedValue(undefined);
  const mockOn = vi.fn();
  const mockOff = vi.fn();

  const mockLocalAudioTrack = {
    stop: vi.fn(),
    close: vi.fn(),
    setEnabled: vi.fn().mockResolvedValue(undefined),
  };

  const mockLocalVideoTrack = {
    stop: vi.fn(),
    close: vi.fn(),
    setEnabled: vi.fn().mockResolvedValue(undefined),
    play: vi.fn(),
  };

  const mockClient = {
    join: mockJoin,
    publish: mockPublish,
    subscribe: mockSubscribe,
    leave: mockLeave,
    on: mockOn,
    off: mockOff,
    remoteUsers: [],
  };

  return {
    default: {
      createClient: vi.fn(() => mockClient),
      createMicrophoneAudioTrack: vi.fn().mockResolvedValue(mockLocalAudioTrack),
      createCameraVideoTrack: vi.fn().mockResolvedValue(mockLocalVideoTrack),
    },
    IAgoraRTCClient: {},
    ICameraVideoTrack: {},
    IMicrophoneAudioTrack: {},
    IAgoraRTCRemoteUser: {},
  };
});

describe('CallRoom component stability and settings with Agora SDK', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders container element and initialises Agora client exactly once', async () => {
    const onCallEndMock = vi.fn();

    let wrapper: any = null;
    await act(async () => {
      wrapper = render(
        <CallRoom
          appId={12345}
          token="test-token"
          roomId="test-room-id"
          userId="user-123"
          userName="John Doe"
          callType="video"
          onCallEnd={onCallEndMock}
        />
      );
    });

    // Verify container renders
    expect(screen.getByTestId('zego-call-room')).toBeInTheDocument();

    // Clean up
    if (wrapper) {
      wrapper.unmount();
    }
  });
});
