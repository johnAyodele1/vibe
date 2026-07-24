import React, { useEffect, useRef } from 'react';
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

  useEffect(() => {
    if (!containerRef.current) return;

    // Use ZegoCloud production kit token generation
    const kitToken = ZegoUIKitPrebuilt.generateKitTokenForProduction(
      appId,
      token,
      roomId,
      userId,
      userName
    );

    const zp = ZegoUIKitPrebuilt.create(kitToken);
    const startTime = Date.now();

    zp.joinRoom({
      container: containerRef.current,
      showPreJoinView: false,
      preJoinViewConfig: {
        title: '',
        isVideoEntryDisabled: true,
      },
      autoLeaveAfterLeft: true,
      scenario: {
        mode: ZegoUIKitPrebuilt.OneONoneCall,
      },
      turnOnCameraWhenJoining: callType === 'video',
      turnOnMicrophoneWhenJoining: true,
      showMyCameraToggleButton: callType === 'video',
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
    });

    return () => {
      zp.destroy();
    };
  }, [appId, token, roomId, userId, userName, callType, onCallEnd]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', minHeight: '400px' }}
      data-testid="zego-call-room"
    />
  );
};

export default CallRoom;
