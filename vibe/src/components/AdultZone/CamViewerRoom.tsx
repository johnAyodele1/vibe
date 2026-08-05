import React, { useEffect, useRef } from 'react';
import AgoraRTC, { IAgoraRTCClient, IAgoraRTCRemoteUser } from 'agora-rtc-sdk-ng';

interface CamViewerRoomProps {
  appId: string | number;
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
  const clientRef = useRef<IAgoraRTCClient | null>(null);

  useEffect(() => {
    const client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
    clientRef.current = client;

    const handleUserPublished = async (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video' | 'datachannel') => {
      if (mediaType === 'datachannel') return;
      await client.subscribe(user, mediaType);
      if (mediaType === 'video' && user.videoTrack) {
        if (containerRef.current) {
          user.videoTrack.play(containerRef.current);
        }
      }
      if (mediaType === 'audio' && user.audioTrack) {
        user.audioTrack.play();
      }
    };

    const handleUserUnpublished = (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video' | 'datachannel') => {
      if (mediaType === 'video' && user.videoTrack) {
        user.videoTrack.stop();
      }
      if (mediaType === 'audio' && user.audioTrack) {
        user.audioTrack.stop();
      }
    };

    client.on('user-published', handleUserPublished);
    client.on('user-unpublished', handleUserUnpublished);

    const initViewer = async () => {
      try {
        await client.setClientRole('audience');
        await client.join(String(appId), roomId, token, userId);

        if (onUserCountUpdate) {
          onUserCountUpdate(client.remoteUsers.length + 1);
        }
      } catch (err) {
        console.error('Agora CamViewer failed to join:', err);
      }
    };

    initViewer();

    return () => {
      if (clientRef.current) {
        clientRef.current.off('user-published', handleUserPublished);
        clientRef.current.off('user-unpublished', handleUserUnpublished);
        clientRef.current.leave().catch(() => {});
        clientRef.current = null;
      }
    };
  }, [appId, token, roomId, userId, userName, onUserCountUpdate]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', minHeight: '400px', background: '#0a0608' }}
      data-testid="zego-cam-viewer-room"
    />
  );
};

export default CamViewerRoom;
