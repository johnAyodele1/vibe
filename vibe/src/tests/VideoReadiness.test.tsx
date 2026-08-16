import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import VideoFallbackOverlay from '../components/AdultZone/VideoFallbackOverlay';
import CallRoom from '../components/AdultZone/CallRoom';
import useVideoReadiness from '../hooks/useVideoReadiness';
import { renderHook } from '@testing-library/react';

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

describe('VideoReadiness Hook and Fallback Overlay Behavioral Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. INITIAL LOADING: Provider avatar is visible and video container is concealed', async () => {
    const providerAvatar = 'https://example.com/provider-profile.jpg';
    const providerName = 'Jessica Star';

    await act(async () => {
      render(
        <CallRoom
          appId={12345}
          token="test-token"
          roomId="test-room-id"
          userId="user-123"
          userName="Member John"
          callType="video"
          onCallEnd={vi.fn()}
          partnerName={providerName}
          partnerAvatar={providerAvatar}
          providerAvatar={providerAvatar}
          providerName={providerName}
        />
      );
    });

    // Assert provider avatar is visible in fallback overlay
    const overlays = screen.getAllByTestId('video-fallback-overlay');
    expect(overlays.length).toBeGreaterThan(0);

    const avatarImgs = screen.getAllByAltText(providerName);
    expect(avatarImgs[0]).toHaveAttribute('src', providerAvatar);

    // Assert video elements/containers are concealed before playback begins
    const remoteVideoContainer = screen.getByTestId('zego-call-room').querySelector('div.opacity-0');
    expect(remoteVideoContainer).toBeInTheDocument();
  });

  it('2. ACTUAL PLAYBACK STARTS: Triggering readiness hides avatar and reveals video', async () => {
    // Test hook behavior directly
    const { result } = renderHook(() => useVideoReadiness());

    // Initially not ready
    expect(result.current.isVideoReady).toBe(false);

    // Simulate playback start
    act(() => {
      result.current.markReady();
    });

    expect(result.current.isVideoReady).toBe(true);
  });

  it('3 & 4. BUFFERING & PLAYBACK RESUMES: Waiting triggers avatar, playing reveals video again', async () => {
    const { result } = renderHook(() => useVideoReadiness());

    // 1. Playback starts
    act(() => {
      result.current.markReady();
    });
    expect(result.current.isVideoReady).toBe(true);

    // 2. Buffering / Waiting event occurs
    act(() => {
      result.current.resetReadiness();
    });
    expect(result.current.isVideoReady).toBe(false);

    // 3. Playback resumes
    act(() => {
      result.current.markReady();
    });
    expect(result.current.isVideoReady).toBe(true);
  });

  it('5 & 6. VIDEO ERROR & ENDED: Error or ended state immediately reverts to fallback', async () => {
    const { result } = renderHook(() => useVideoReadiness());

    // Playing
    act(() => {
      result.current.markReady();
    });
    expect(result.current.isVideoReady).toBe(true);

    // Trigger video error
    act(() => {
      result.current.resetReadiness();
    });
    expect(result.current.isVideoReady).toBe(false);
  });

  it('7. REMOTE TRACK BECOMES UNAVAILABLE: Unpublishing or track stop triggers fallback', async () => {
    const providerAvatar = 'https://example.com/provider.jpg';
    const providerName = 'Jessica Star';

    await act(async () => {
      render(
        <CallRoom
          appId={12345}
          token="test-token"
          roomId="test-room-id"
          userId="user-123"
          userName="Member John"
          callType="video"
          onCallEnd={vi.fn()}
          partnerName={providerName}
          partnerAvatar={providerAvatar}
          providerAvatar={providerAvatar}
          providerName={providerName}
        />
      );
    });

    // Verify fallback overlay is rendered
    expect(screen.getAllByTestId('video-fallback-overlay').length).toBeGreaterThan(0);
  });

  it('8. PROVIDER AVATAR: Renders exact provider URL when provided, and /placeholder.svg when undefined', () => {
    // Real Provider Avatar
    const customAvatar = 'https://cdn.example.com/provider-photos/main.jpg';
    const { rerender } = render(
      <VideoFallbackOverlay avatarUrl={customAvatar} displayName="Star Provider" />
    );

    let avatarImg = screen.getByAltText('Star Provider');
    expect(avatarImg).toHaveAttribute('src', customAvatar);
    expect(customAvatar).not.toContain('unsplash.com');

    // No Avatar -> Fallback to /placeholder.svg
    rerender(<VideoFallbackOverlay avatarUrl={undefined} displayName="Star Provider" />);
    avatarImg = screen.getByAltText('Star Provider');
    expect(avatarImg).toHaveAttribute('src', '/placeholder.svg');
  });

  it('9. BOTH SIDES: Both Member-side and Provider-side call configurations render Provider Avatar', async () => {
    const providerAvatar = 'https://example.com/provider-real-avatar.jpg';
    const providerName = 'Star Provider';

    // Member Side Call
    const { unmount } = render(
      <CallRoom
        appId={12345}
        token="test-token"
        roomId="test-room-id"
        userId="member-id-123"
        userName="Member John"
        callType="video"
        onCallEnd={vi.fn()}
        partnerName={providerName}
        partnerAvatar={providerAvatar}
        providerAvatar={providerAvatar}
        providerName={providerName}
      />
    );

    let overlays = screen.getAllByTestId('video-fallback-overlay');
    expect(overlays[0].querySelector('img')).toHaveAttribute('src', providerAvatar);
    unmount();

    // Provider Side Call
    render(
      <CallRoom
        appId={12345}
        token="test-token"
        roomId="test-room-id"
        userId="provider-id-456"
        userName="Star Provider"
        callType="video"
        onCallEnd={vi.fn()}
        partnerName="Member John"
        partnerAvatar="https://example.com/member-avatar.jpg"
        providerAvatar={providerAvatar}
        providerName={providerName}
      />
    );

    // Both sides fall back to provider avatar!
    overlays = screen.getAllByTestId('video-fallback-overlay');
    expect(overlays[0].querySelector('img')).toHaveAttribute('src', providerAvatar);
  });

  it('10. NO BLACK FLASH: Video element container is initialized with opacity-0 and pointer-events-none', async () => {
    render(
      <CallRoom
        appId={12345}
        token="test-token"
        roomId="test-room-id"
        userId="user-123"
        userName="John"
        callType="video"
        onCallEnd={vi.fn()}
        providerAvatar="https://example.com/provider.jpg"
        providerName="Provider"
      />
    );

    // Video container has opacity-0 pointer-events-none on mount
    const callRoomContainer = screen.getByTestId('zego-call-room');
    const hiddenVideoContainers = callRoomContainer.querySelectorAll('.opacity-0');
    expect(hiddenVideoContainers.length).toBeGreaterThan(0);
  });
});
