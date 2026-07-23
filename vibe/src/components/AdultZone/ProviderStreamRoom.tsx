import React, { useEffect, useRef } from 'react';
import { ZegoUIKitPrebuilt } from '@zegocloud/zego-uikit-prebuilt';

interface ProviderStreamRoomProps {
  appId: number;
  token: string;
  roomId: string;
  userId: string;
  userName: string;
  sessionId: string;
  onEnd: () => void;
}

const ProviderStreamRoom: React.FC<ProviderStreamRoomProps> = ({
  appId,
  token,
  roomId,
  userId,
  userName,
  sessionId,
  onEnd,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const kitToken = ZegoUIKitPrebuilt.generateKitTokenForProduction(
      appId,
      token,
      roomId,
      userId,
      userName
    );

    const zp = ZegoUIKitPrebuilt.create(kitToken);

    zp.joinRoom({
      container: containerRef.current,
      scenario: {
        mode: ZegoUIKitPrebuilt.LiveStreaming,
        config: { role: ZegoUIKitPrebuilt.Host },
      },
      showTextChat: false, // provider uses app's own chat overlay
      showUserList: false,
      maxUsers: 500,
      showLeaveRoomConfirmDialog: true,
      onLeaveRoom: () => {
        onEnd();
      },
    });

    return () => {
      zp.destroy();
    };
  }, [appId, token, roomId, userId, userName, sessionId, onEnd]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', minHeight: '400px' }}
      data-testid="zego-provider-stream-room"
    />
  );
};

export default ProviderStreamRoom;
