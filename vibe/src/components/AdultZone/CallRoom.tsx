import React, { useEffect, useRef, useState, memo } from 'react';
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
  const [retry, setRetry] = useState(0);

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

    // Check the container actually has dimensions before proceeding
    const rect = containerRef.current.getBoundingClientRect();
    const isTest = typeof process !== 'undefined' && process.env.NODE_ENV === 'test';
    if (!isTest && (rect.width === 0 || rect.height === 0)) {
      console.error('[CallRoom] Container has zero dimensions. ZegoCloud cannot render video.');
      // Retry after next paint
      const frame = requestAnimationFrame(() => {
        setRetry(prev => prev + 1);
      });
      return () => cancelAnimationFrame(frame);
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
      showLeaveButton: true,
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
  }, [retry]); // Retry triggers re-evaluation if dimensions are zero

  return (
    <div
      ref={containerRef}
      data-testid="zego-call-room"
      style={{
        width: '100%',
        height: '100%',
        minWidth: '320px',
        minHeight: '400px',
        position: 'relative',
        background: '#0a0608',
      }}
    />
  );
};

export default memo(CallRoom);
