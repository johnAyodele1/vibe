import React, { useEffect, useRef, memo } from 'react';
import { ZegoUIKitPrebuilt } from '@zegocloud/zego-uikit-prebuilt';

interface CallRoomProps {
  appId: number;
  token: string;
  roomId: string;
  userId: string;
  userName: string;
  callType: 'video' | 'audio';
  onCallEnd: (durationSeconds: number) => void;
}

const CallRoom: React.FC<CallRoomProps> = ({
  appId,
  token,
  roomId,
  userId,
  userName,
  callType,
  onCallEnd,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const zpRef = useRef<any>(null); // holds the ZegoCloud instance
  const hasJoined = useRef(false); // prevents double-join

  useEffect(() => {
    // GUARD: if already joined or container not ready, do nothing
    if (hasJoined.current) return;
    if (!containerRef.current) return;

    // GUARD: validate all required values before touching ZegoCloud
    if (!appId || !token || !roomId || !userId) {
      console.error('CallRoom: missing required props', {
        appId: !!appId,
        token: !!token,
        roomId: !!roomId,
        userId: !!userId,
      });
      return;
    }

    hasJoined.current = true;

    // Use ZegoCloud production kit token generation
    const kitToken = ZegoUIKitPrebuilt.generateKitTokenForProduction(
      appId,
      token,
      roomId,
      userId,
      userName || 'User'
    );

    const zp = ZegoUIKitPrebuilt.create(kitToken);
    zpRef.current = zp;

    const startTime = Date.now();

    zp.joinRoom({
      container: containerRef.current,
      showPreJoinView: false,
      preJoinViewConfig: {
        title: '',
        isVideoEntryDisabled: true,
      } as any,
      autoLeaveAfterLeft: true,
      scenario: {
        mode: callType === 'video'
          ? ZegoUIKitPrebuilt.OneONoneCall
          : ZegoUIKitPrebuilt.GroupCall,
      },
      // CAMERA: only on for video calls
      turnOnCameraWhenJoining: callType === 'video',
      showMyCameraToggleButton: callType === 'video',
      showCameraToggleButton: callType === 'video',

      turnOnMicrophoneWhenJoining: true,
      showMyMicrophoneToggleButton: true,
      showAudioVideoSettingsButton: false,
      showScreenSharingButton: false,
      showTextChat: false, // we have our own chat
      showUserList: false,
      maxUsers: 2,
      layout: 'Auto',
      onLeaveRoom: () => {
        const durationSeconds = Math.floor((Date.now() - startTime) / 1000);
        onCallEnd(durationSeconds);
      },
      onUserLeave: () => {
        const durationSeconds = Math.floor((Date.now() - startTime) / 1000);
        onCallEnd(durationSeconds);
      },
    } as any);

    return () => {
      if (zpRef.current) {
        try {
          zpRef.current.destroy();
        } catch (e) {
          // Ignore destroy errors
        }
        zpRef.current = null;
        hasJoined.current = false;
      }
    };
  }, []); // Run ONCE on mount and cleanup on unmount

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', minHeight: '400px' }}
      data-testid="zego-call-room"
    />
  );
};

export default memo(CallRoom);
