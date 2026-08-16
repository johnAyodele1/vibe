import React, { useEffect, useRef } from 'react';
import AgoraRTC, { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack, IAgoraRTCRemoteUser } from 'agora-rtc-sdk-ng';
import { useVideoReadiness } from '../../hooks/useVideoReadiness';
import VideoFallbackOverlay from './VideoFallbackOverlay';

interface RandomMatchRoomProps {
  appId: string | number;
  token: string;
  roomId: string;
  matchId: string;
  userId: string;
  partnerAvatar?: string;
  partnerName?: string;
  onNext: () => void;
  onEnd: () => void;
}

const RandomMatchRoom: React.FC<RandomMatchRoomProps> = ({
  appId,
  token,
  roomId,
  userId,
  partnerAvatar,
  partnerName,
  onNext,
  onEnd,
}) => {
  const remoteVideoState = useVideoReadiness();
  const localVideoState = useVideoReadiness();

  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localAudioTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const localVideoTrackRef = useRef<ICameraVideoTrack | null>(null);

  const {
    containerRef: remoteContainerRef,
    markReady: remoteMarkReady,
    resetReadiness: remoteResetReadiness,
  } = remoteVideoState;

  const {
    containerRef: localContainerRef,
    markReady: localMarkReady,
    resetReadiness: localResetReadiness,
  } = localVideoState;

  useEffect(() => {
    const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    clientRef.current = client;

    const handleUserPublished = async (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video' | 'datachannel') => {
      if (mediaType === 'datachannel') return;
      await client.subscribe(user, mediaType);
      if (mediaType === 'video' && user.videoTrack) {
        if (remoteContainerRef.current) {
          user.videoTrack.play(remoteContainerRef.current);
        }
        if (typeof (user.videoTrack as any).on === 'function') {
          (user.videoTrack as any).on('first-frame-decoded', () => {
            remoteMarkReady();
          });
        }
      }
      if (mediaType === 'audio' && user.audioTrack) {
        user.audioTrack.play();
      }
    };

    const handleUserUnpublished = (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video' | 'datachannel') => {
      if (mediaType === 'video') {
        remoteResetReadiness();
        if (user.videoTrack) {
          user.videoTrack.stop();
        }
      }
      if (mediaType === 'audio' && user.audioTrack) {
        user.audioTrack.stop();
      }
    };

    const handleUserLeft = () => {
      remoteResetReadiness();
      onNext();
    };

    client.on('user-published', handleUserPublished);
    client.on('user-unpublished', handleUserUnpublished);
    client.on('user-left', handleUserLeft);

    const initCall = async () => {
      try {
        await client.join(String(appId), roomId, token, userId);

        const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        localAudioTrackRef.current = audioTrack;

        const videoTrack = await AgoraRTC.createCameraVideoTrack();
        localVideoTrackRef.current = videoTrack;

        if (localContainerRef.current) {
          videoTrack.play(localContainerRef.current);
        }
        if (typeof (videoTrack as any).on === 'function') {
          (videoTrack as any).on('first-frame-decoded', () => {
            localMarkReady();
          });
        }

        await client.publish([audioTrack, videoTrack]);
      } catch (err) {
        console.error('Agora Random Match initialization failed:', err);
      }
    };

    initCall();

    return () => {
      remoteResetReadiness();
      localResetReadiness();
      if (localAudioTrackRef.current) {
        localAudioTrackRef.current.stop();
        localAudioTrackRef.current.close();
        localAudioTrackRef.current = null;
      }
      if (localVideoTrackRef.current) {
        localVideoTrackRef.current.stop();
        localVideoTrackRef.current.close();
        localVideoTrackRef.current = null;
      }
      if (clientRef.current) {
        clientRef.current.off('user-published', handleUserPublished);
        clientRef.current.off('user-unpublished', handleUserUnpublished);
        clientRef.current.off('user-left', handleUserLeft);
        clientRef.current.leave().catch(() => {});
        clientRef.current = null;
      }
    };
  }, [roomId, appId, token, userId, onNext, remoteContainerRef, localContainerRef, remoteMarkReady, remoteResetReadiness, localMarkReady, localResetReadiness]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '500px', background: '#0a0608' }}>
      <div className="absolute inset-0 flex flex-col md:flex-row gap-4 p-4 pb-24">
        {/* Remote Partner */}
        <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl relative overflow-hidden flex items-center justify-center">
          {!remoteVideoState.isVideoReady && (
            <VideoFallbackOverlay
              avatarUrl={partnerAvatar}
              displayName={partnerName || 'Stranger'}
              statusText="Connecting video..."
            />
          )}
          <div
            ref={remoteVideoState.containerRef}
            className={`w-full h-full absolute inset-0 transition-opacity duration-300 ${
              remoteVideoState.isVideoReady ? 'opacity-100 z-0' : 'opacity-0 pointer-events-none'
            }`}
          />
          <div className="absolute top-4 left-4 bg-black/60 px-3 py-1 rounded text-xs text-white uppercase tracking-widest z-20">
            {partnerName || 'Stranger'}
          </div>
        </div>

        {/* Local Video */}
        <div className="w-full md:w-1/3 bg-zinc-950 border border-zinc-800 rounded-xl relative overflow-hidden flex items-center justify-center aspect-video md:aspect-auto">
          {!localVideoState.isVideoReady && (
            <VideoFallbackOverlay
              avatarUrl={partnerAvatar}
              displayName="You"
              statusText="Starting camera..."
            />
          )}
          <div
            ref={localVideoState.containerRef}
            className={`w-full h-full absolute inset-0 transition-opacity duration-300 ${
              localVideoState.isVideoReady ? 'opacity-100 z-0' : 'opacity-0 pointer-events-none'
            }`}
          />
          <div className="absolute top-4 left-4 bg-black/60 px-3 py-1 rounded text-xs text-white uppercase tracking-widest z-20">
            You
          </div>
        </div>
      </div>

      {/* Overlay controls */}
      <div className="absolute bottom-6 inset-x-0 flex justify-center gap-4 z-20">
        <button
          onClick={onNext}
          className="px-6 py-3 bg-[var(--az-accent-primary)] hover:bg-red-700 text-white font-bold text-xs uppercase tracking-widest rounded-full shadow-[0_0_15px_var(--az-glow)] transition-all"
        >
          Next Stranger 🎲
        </button>
        <button
          onClick={onEnd}
          className="px-6 py-3 bg-red-950 hover:bg-red-900 text-red-400 border border-red-500/30 font-bold text-xs uppercase tracking-widest rounded-full transition-all"
        >
          End Session ✕
        </button>
      </div>
    </div>
  );
};

export default RandomMatchRoom;
