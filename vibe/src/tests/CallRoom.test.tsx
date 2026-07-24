import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import CallRoom from '../components/AdultZone/CallRoom';
import { ZegoUIKitPrebuilt } from '@zegocloud/zego-uikit-prebuilt';

// Mock ZegoUIKitPrebuilt
vi.mock('@zegocloud/zego-uikit-prebuilt', () => {
  const mockDestroy = vi.fn();
  const mockJoinRoom = vi.fn();
  const mockCreate = vi.fn(() => ({
    joinRoom: mockJoinRoom,
    destroy: mockDestroy,
  }));
  const mockGenerateKitTokenForProduction = vi.fn(() => 'mock-kit-token');

  return {
    ZegoUIKitPrebuilt: {
      generateKitTokenForProduction: mockGenerateKitTokenForProduction,
      create: mockCreate,
      OneONoneCall: 'OneONoneCall',
      GroupCall: 'GroupCall',
    },
  };
});

describe('CallRoom component stability and settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders container element and initialises ZegoCloud exactly once', () => {
    const onCallEndMock = vi.fn();

    const { unmount } = render(
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

    // Verify container renders
    expect(screen.getByTestId('zego-call-room')).toBeInTheDocument();

    // Verify token generation is called
    expect(ZegoUIKitPrebuilt.generateKitTokenForProduction).toHaveBeenCalledTimes(1);
    expect(ZegoUIKitPrebuilt.generateKitTokenForProduction).toHaveBeenCalledWith(
      12345,
      'test-token',
      'test-room-id',
      'user-123',
      'John Doe'
    );

    // Verify Zego instance is created once
    expect(ZegoUIKitPrebuilt.create).toHaveBeenCalledTimes(1);
    expect(ZegoUIKitPrebuilt.create).toHaveBeenCalledWith('mock-kit-token');

    const zpMock = (ZegoUIKitPrebuilt.create as any).mock.results[0].value;

    // Verify joinRoom was called exactly once
    expect(zpMock.joinRoom).toHaveBeenCalledTimes(1);

    // Verify options on joinRoom for video call
    const joinRoomArgs = zpMock.joinRoom.mock.calls[0][0];
    expect(joinRoomArgs.scenario.mode).toBe('OneONoneCall');
    expect(joinRoomArgs.turnOnCameraWhenJoining).toBe(true);
    expect(joinRoomArgs.showMyCameraToggleButton).toBe(true);

    // Unmount and check cleanup
    unmount();
    expect(zpMock.destroy).toHaveBeenCalledTimes(1);
  });

  it('configures GroupCall (no camera) scenario for audio-only calls', () => {
    const onCallEndMock = vi.fn();

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

    const zpMock = (ZegoUIKitPrebuilt.create as any).mock.results[0].value;
    const joinRoomArgs = zpMock.joinRoom.mock.calls[0][0];

    // Verify audio scenario is GroupCall
    expect(joinRoomArgs.scenario.mode).toBe('GroupCall');
    expect(joinRoomArgs.turnOnCameraWhenJoining).toBe(false);
    expect(joinRoomArgs.showMyCameraToggleButton).toBe(false);
    expect(joinRoomArgs.showCameraToggleButton).toBe(false);
  });
});
