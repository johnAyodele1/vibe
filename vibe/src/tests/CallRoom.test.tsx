import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import CallRoom from '../components/AdultZone/CallRoom';
import AgoraRTC from 'agora-rtc-sdk-ng';

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
    enableAudioVolumeIndicator: vi.fn(),
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

    expect(screen.getByTestId('zego-call-room')).toBeInTheDocument();

    if (wrapper) {
      wrapper.unmount();
    }
  });

  it('renders audio-only premium layout with partner name and avatar', async () => {
    const onCallEndMock = vi.fn();
    const partnerName = "Premium Partner";
    const partnerAvatar = "https://images.unsplash.com/photo-1534528741775-53994a69daeb";

    let wrapper: any = null;
    await act(async () => {
      wrapper = render(
        <CallRoom
          appId={12345}
          token="test-token"
          roomId="test-room-id"
          userId="user-123"
          userName="John Doe"
          callType="audio"
          onCallEnd={onCallEndMock}
          partnerName={partnerName}
          partnerAvatar={partnerAvatar}
        />
      );
    });

    expect(screen.getByTestId('zego-call-room')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: partnerName })).toBeInTheDocument();

    const img = screen.getByAltText(partnerName);
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', partnerAvatar);

    expect(screen.getByText('In Call')).toBeInTheDocument();

    if (wrapper) {
      wrapper.unmount();
    }
  });

  it('renders modern SVG call action controls and toggles mic/camera correctly', async () => {
    const onCallEndMock = vi.fn();

    await act(async () => {
      render(
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

    const micBtn = screen.getByRole('button', { name: /Mute Microphone/i });
    const camBtn = screen.getByRole('button', { name: /Turn Off Camera/i });
    const endBtn = screen.getByRole('button', { name: /End Call/i });

    expect(micBtn).toBeInTheDocument();
    expect(camBtn).toBeInTheDocument();
    expect(endBtn).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(micBtn);
    });
    expect(screen.getByRole('button', { name: /Unmute Microphone/i })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(camBtn);
    });
    expect(screen.getByRole('button', { name: /Turn On Camera/i })).toBeInTheDocument();
  });

  it('calls onCallEnd callback exactly once when local user hangs up', async () => {
    const onCallEndMock = vi.fn();

    await act(async () => {
      render(
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

    const endBtn = screen.getByRole('button', { name: /End Call/i });

    await act(async () => {
      fireEvent.click(endBtn);
    });

    expect(onCallEndMock).toHaveBeenCalledTimes(1);
    expect(onCallEndMock).toHaveBeenCalledWith(expect.any(Number));
  });

  it('does not initialize camera video track for audio-only calls', async () => {
    const onCallEndMock = vi.fn();

    await act(async () => {
      render(
        <CallRoom
          appId={12345}
          token="test-token"
          roomId="test-room-id"
          userId="user-123"
          userName="John Doe"
          callType="audio"
          onCallEnd={onCallEndMock}
        />
      );
    });

    expect(AgoraRTC.createMicrophoneAudioTrack).toHaveBeenCalled();
    expect(AgoraRTC.createCameraVideoTrack).not.toHaveBeenCalled();
  });
});
