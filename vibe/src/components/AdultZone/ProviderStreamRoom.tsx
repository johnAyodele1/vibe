import React, { useEffect, useRef, useState } from 'react';
import AgoraRTC, { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import { useVideoReadiness } from '../../hooks/useVideoReadiness';
import VideoFallbackOverlay from './VideoFallbackOverlay';
import { Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { API_BASE_URL } from '../../config';

interface ProviderStreamRoomProps {
  appId: string | number;
  token: string;
  roomId: string;
  userId: string;
  userName: string;
  sessionId: string;
  socket?: Socket | null;
  providerAvatar?: string;
  providerName?: string;
  onEnd: () => void;
  onStreamEstablished?: () => void;
}

const ProviderStreamRoom: React.FC<ProviderStreamRoomProps> = ({
  appId,
  token,
  roomId,
  userId,
  userName,
  sessionId,
  socket,
  providerAvatar,
  providerName,
  onEnd,
  onStreamEstablished,
}) => {
  const videoState = useVideoReadiness();
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localAudioTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const localVideoTrackRef = useRef<ICameraVideoTrack | null>(null);
  const callAcceptancePollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppingRef = useRef(false);
  const generationRef = useRef(0);
  const onEndRef = useRef(onEnd);
  const onStreamEstablishedRef = useRef(onStreamEstablished);
  const [sessionEndedExternally, setSessionEndedExternally] = useState(false);

  const { containerRef, markReady, resetReadiness } = videoState;

  useEffect(() => {
    onEndRef.current = onEnd;
  }, [onEnd]);

  useEffect(() => {
    onStreamEstablishedRef.current = onStreamEstablished;
  }, [onStreamEstablished]);

  const stopTrack = React.useCallback((track: { getMediaStreamTrack?: () => MediaStreamTrack | null; stop?: () => void; close?: () => void } | null) => {
    if (!track) return;
    try { track.getMediaStreamTrack?.()?.stop(); } catch {}
    try { track.stop?.(); } catch {}
    try { track.close?.(); } catch {}
  }, []);

  const stopLocalMedia = React.useCallback(async () => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    resetReadiness();

    if (callAcceptancePollRef.current) {
      clearTimeout(callAcceptancePollRef.current);
      callAcceptancePollRef.current = null;
    }

    const videoTrack = localVideoTrackRef.current;
    localVideoTrackRef.current = null;
    stopTrack(videoTrack);

    const audioTrack = localAudioTrackRef.current;
    localAudioTrackRef.current = null;
    stopTrack(audioTrack);

    const activeClient = clientRef.current;
    clientRef.current = null;
    if (activeClient) {
      try { await activeClient.unpublish().catch(() => {}); } catch {}
      try { await activeClient.leave().catch(() => {}); } catch {}
    }
  }, [resetReadiness, stopTrack]);

  useEffect(() => {
    const generation = ++generationRef.current;
    stoppingRef.current = false;
    const client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
    clientRef.current = client;

    const isCurrent = () => generation === generationRef.current && !stoppingRef.current;

    const markPublicStreamEnded = () => {
      if (!isCurrent()) return;
      setSessionEndedExternally(true);
      void stopLocalMedia();
      onEndRef.current();
    };

    const pollCallUntilAccepted = (callId: string) => {
      if (callAcceptancePollRef.current) clearTimeout(callAcceptancePollRef.current);

      let attempts = 0;
      const maxAttempts = 30;

      const check = async () => {
        if (!isCurrent()) return;
        attempts += 1;
        try {
          const accessToken = localStorage.getItem('adultAccessToken') || '';
          if (!accessToken) return;

          const response = await fetch(`${API_BASE_URL}/v1/adult/sext/calls/${callId}`, {
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          });
          if (!isCurrent()) return;
          if (!response.ok) return;
          const data = await response.json();
          if (!isCurrent()) return;
          if (!data?.success) return;

          if (data.status === 'active') {
            markPublicStreamEnded();
            return;
          }

          if (['declined', 'missed', 'ended', 'failed', 'cancelled'].includes(data.status) || attempts >= maxAttempts) {
            callAcceptancePollRef.current = null;
            return;
          }
        } catch {
          if (!isCurrent()) return;
          // Retry sequentially while the incoming call remains pending.
        }

        if (isCurrent() && attempts < maxAttempts) {
          callAcceptancePollRef.current = setTimeout(() => { void check(); }, 1000);
        }
      };

      void check();
    };

    const handleIncomingCall = (data: { callId?: string }) => {
      if (isCurrent() && data?.callId) pollCallUntilAccepted(data.callId);
    };

    const handleSessionEnded = (data: { sessionId?: string }) => {
      if (!data?.sessionId || data.sessionId !== sessionId || !isCurrent()) return;
      toast.info('Public stream session ended');
      markPublicStreamEnded();
    };

    if (socket) {
      socket.on('cam:session_ended', handleSessionEnded);
      socket.on('call:incoming', handleIncomingCall);
    }

    const initHost = async () => {
      let createdAudioTrack: IMicrophoneAudioTrack | null = null;
      let createdVideoTrack: ICameraVideoTrack | null = null;
      try {
        await client.setClientRole('host');
        if (!isCurrent()) return;

        await client.join(String(appId), roomId, token, userId);
        if (!isCurrent()) {
          await client.leave().catch(() => {});
          return;
        }

        createdAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        if (!isCurrent()) {
          stopTrack(createdAudioTrack);
          await client.leave().catch(() => {});
          return;
        }
        localAudioTrackRef.current = createdAudioTrack;

        createdVideoTrack = await AgoraRTC.createCameraVideoTrack();
        if (!isCurrent()) {
          stopTrack(createdVideoTrack);
          localAudioTrackRef.current = null;
          stopTrack(createdAudioTrack);
          await client.leave().catch(() => {});
          return;
        }
        localVideoTrackRef.current = createdVideoTrack;

        if (containerRef.current) createdVideoTrack.play(containerRef.current);
        if (typeof (createdVideoTrack as any).on === 'function') {
          (createdVideoTrack as any).on('first-frame-decoded', () => {
            if (isCurrent()) markReady();
          });
        }

        await client.publish([createdAudioTrack, createdVideoTrack]);
        if (!isCurrent()) {
          stopTrack(createdVideoTrack);
          stopTrack(createdAudioTrack);
          localVideoTrackRef.current = null;
          localAudioTrackRef.current = null;
          await client.leave().catch(() => {});
          return;
        }

        if (socket?.connected && isCurrent()) socket.emit('cam:host_start', { sessionId });
        if (isCurrent()) onStreamEstablishedRef.current?.();
      } catch (err) {
        if (!isCurrent()) {
          stopTrack(createdVideoTrack);
          stopTrack(createdAudioTrack);
          await client.leave().catch(() => {});
          return;
        }
        console.error('Agora Host Stream failed to initialize:', err);
        await stopLocalMedia();
        toast.error('Failed to start camera/microphone broadcast. Session cancelled.');
        onEndRef.current();
      }
    };

    void initHost();

    return () => {
      generationRef.current += 1;
      stoppingRef.current = true;
      if (socket) {
        socket.off('cam:session_ended', handleSessionEnded);
        socket.off('call:incoming', handleIncomingCall);
      }
      if (callAcceptancePollRef.current) {
        clearTimeout(callAcceptancePollRef.current);
        callAcceptancePollRef.current = null;
      }
      void stopLocalMedia();
    };
  }, [appId, token, roomId, userId, sessionId, containerRef, markReady, stopLocalMedia, stopTrack]);

  const handleEndClick = () => {
    if (window.confirm('Are you sure you want to end the broadcast?')) onEndRef.current();
  };

  if (sessionEndedExternally) {
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '400px' }} className="flex items-center justify-center bg-[#0a0608]" data-testid="provider-stream-ended">
        <div className="text-center space-y-2">
          <span className="text-5xl opacity-40">📹</span>
          <p className="text-xs text-[var(--az-text-muted)] font-serif italic">Camera Offline</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '400px' }}>
      {!videoState.isVideoReady && <VideoFallbackOverlay avatarUrl={providerAvatar} displayName={providerName || userName || 'Provider'} statusText="Starting camera stream..." />}
      <div ref={videoState.containerRef} style={{ width: '100%', height: '100%', minHeight: '400px', background: '#0a0608' }} className={`transition-opacity duration-300 ${videoState.isVideoReady ? 'opacity-100 z-0' : 'opacity-0 pointer-events-none'}`} data-testid="zego-provider-stream-room" />
      <div className="absolute bottom-6 inset-x-0 flex justify-center z-20">
        <button onClick={handleEndClick} className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase tracking-widest rounded-full shadow-[0_0_15px_rgba(220,38,38,0.5)] transition-all">End Broadcast ✕</button>
      </div>
    </div>
  );
};

export default ProviderStreamRoom;
