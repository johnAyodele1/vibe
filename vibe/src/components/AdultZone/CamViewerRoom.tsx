import React, { useEffect, useRef } from 'react';
import AgoraRTC, { IAgoraRTCClient, IAgoraRTCRemoteUser } from 'agora-rtc-sdk-ng';
import { useVideoReadiness } from '../../hooks/useVideoReadiness';
import VideoFallbackOverlay from './VideoFallbackOverlay';

interface CamViewerRoomProps {
  appId: string | number;
  token: string;
  roomId: string;
  userId: string;
  userName: string;
  providerAvatar?: string;
  providerName?: string;
  onUserCountUpdate?: (count: number) => void;
}

const CamViewerRoom: React.FC<CamViewerRoomProps> = ({
  appId,
  token,
  roomId,
  userId,
  userName,
  providerAvatar,
  providerName,
  onUserCountUpdate,
}) => {
  const videoState = useVideoReadiness();
  const { containerRef, isVideoReady, markReady, resetReadiness } = videoState;
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
        const vTrack = user.videoTrack as unknown as { on?: (evt: string, cb: () => void) => void };
        if (typeof vTrack.on === 'function') {
          vTrack.on('first-frame-decoded', () => {
            markReady();
          });
        }
      }
      if (mediaType === 'audio' && user.audioTrack) {
        user.audioTrack.play();
      }
    };

    const handleUserUnpublished = (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video' | 'datachannel') => {
      if (mediaType === 'video') {
        resetReadiness();
        if (user.videoTrack) {
          user.videoTrack.stop();
        }
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
      resetReadiness();
      if (clientRef.current) {
        clientRef.current.off('user-published', handleUserPublished);
        clientRef.current.off('user-unpublished', handleUserUnpublished);
        clientRef.current.leave().catch(() => {});
        clientRef.current = null;
      }
    };
  }, [appId, token, roomId, userId, userName, onUserCountUpdate, containerRef, markReady, resetReadiness]);

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: '400px', background: '#0a0608' }}
      data-testid="zego-cam-viewer-room"
    >
      {!isVideoReady && (
        <VideoFallbackOverlay
          avatarUrl={providerAvatar}
          displayName={providerName}
          statusText="Connecting stream..."
        />
      )}
      <div
        ref={containerRef}
        className={`w-full h-full absolute inset-0 transition-opacity duration-300 ${
          isVideoReady ? 'opacity-100 z-0' : 'opacity-0 pointer-events-none'
        }`}
      />
    </div>
  );
};

export default CamViewerRoom;
