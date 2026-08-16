import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import React from 'react';
import VideoFallbackOverlay from '../components/AdultZone/VideoFallbackOverlay';
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
    on: vi.fn(),
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

describe('VideoReadiness and Fallback Overlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders VideoFallbackOverlay with provider avatar and display name', () => {
    const avatar = 'https://example.com/provider-avatar.jpg';
    const name = 'Vip Provider';

    render(
      <VideoFallbackOverlay
        avatarUrl={avatar}
        displayName={name}
        statusText="Connecting video..."
      />
    );

    expect(screen.getByTestId('video-fallback-overlay')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name })).toBeInTheDocument();

    const img = screen.getByAltText(name);
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', avatar);
    expect(screen.getByText('Connecting video...')).toBeInTheDocument();
  });

  it('renders fallback overlay initially in CallRoom video call before video frames render', async () => {
    const onCallEndMock = vi.fn();
    const providerAvatar = 'https://example.com/provider-avatar.jpg';
    const providerName = 'Vip Provider';

    await act(async () => {
      render(
        <CallRoom
          appId={12345}
          token="test-token"
          roomId="test-room-id"
          userId="user-123"
          userName="John Member"
          callType="video"
          onCallEnd={onCallEndMock}
          partnerName={providerName}
          partnerAvatar={providerAvatar}
          providerAvatar={providerAvatar}
          providerName={providerName}
        />
      );
    });

    expect(screen.getByTestId('zego-call-room')).toBeInTheDocument();

    // Verify video fallback overlays are displayed for provider
    const overlays = screen.getAllByTestId('video-fallback-overlay');
    expect(overlays.length).toBeGreaterThan(0);

    // Verify provider image is present in the fallback overlay
    const avatarImgs = screen.getAllByAltText(providerName);
    expect(avatarImgs.length).toBeGreaterThan(0);
    expect(avatarImgs[0]).toHaveAttribute('src', providerAvatar);
  });
});
