import React, { useEffect, useRef } from 'react';
import { ZegoUIKitPrebuilt } from '@zegocloud/zego-uikit-prebuilt';

interface CamViewerRoomProps {
  appId: number;
  token: string;
  roomId: string;
  userId: string;
  userName: string;
  onUserCountUpdate?: (count: number) => void;
}

const CamViewerRoom: React.FC<CamViewerRoomProps> = ({
  appId,
  token,
  roomId,
  userId,
  userName,
  onUserCountUpdate,
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
        config: { role: ZegoUIKitPrebuilt.Audience },
      },
      showTextChat: false, // app's own tip/chat panel sits alongside
      showUserList: false,
      showLeaveRoomConfirmDialog: false,
      onUserCountOrAudienceCountUpdate: (userCount: number) => {
        if (onUserCountUpdate) {
          onUserCountUpdate(userCount);
        }
      },
    } as any);

    return () => {
      zp.destroy();
    };
  }, [appId, token, roomId, userId, userName, onUserCountUpdate]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', minHeight: '400px' }}
      data-testid="zego-cam-viewer-room"
    />
  );
};

export default CamViewerRoom;
