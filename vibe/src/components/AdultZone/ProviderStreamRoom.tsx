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
  const callAcceptancePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [sessionEndedExternally, setSessionEndedExternally] = useState(false);

  const {
    containerRef,
    markReady,
    resetReadiness,
  } = videoState;

  const stopTrack = React.useCallback((track: { getMediaStreamTrack?: () => MediaStreamTrack | null; stop?: () => void; close?: () => void } | null) => {
    if (!track) return;
    try {
      const msTrack = track.getMediaStreamTrack?.();
      if (msTrack) {
        msTrack.stop();
      }
    } catch {}
    try {
      track.stop?.();
      track.close?.();
    } catch {}
  }, []);

  const stopLocalTracks = React.useCallback(() => {
    resetReadiness();
    stopTrack(localAudioTrackRef.current);
    localAudioTrackRef.current = null;
    stopTrack(localVideoTrackRef.current);
    localVideoTrackRef.current = null;
    if (clientRef.current) {
      try {
        clientRef.current.leave().catch(() => {});
      } catch {}
      clientRef.current = null;
    }
  }, [resetReadiness, stopTrack]);

  useEffect(() => {
    const client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
    clientRef.current = client;

    const stopLocalMedia = async () => {
      resetReadiness();

      if (callAcceptancePollRef.current) {
        clearInterval(callAcceptancePollRef.current);
        callAcceptancePollRef.current = null;
      }

      const videoTrack = localVideoTrackRef.current;
      localVideoTrackRef.current = null;
      if (videoTrack) {
        try { videoTrack.stop(); } catch {}
        try { videoTrack.close(); } catch {}
      }

      const audioTrack = localAudioTrackRef.current;
      localAudioTrackRef.current = null;
      if (audioTrack) {
        try { audioTrack.stop(); } catch {}
        try { audioTrack.close(); } catch {}
      }

      const activeClient = clientRef.current;
      clientRef.current = null;
      if (activeClient) {
        try { await activeClient.unpublish().catch(() => {}); } catch {}
        try { await activeClient.leave().catch(() => {}); } catch {}
      }

      if (socket && sessionId) {
        socket.emit('cam:leave', sessionId);
      }
    };

    const markPublicStreamEnded = () => {
      setSessionEndedExternally(true);
      void stopLocalMedia();
    };

    const pollCallUntilAccepted = (callId: string) => {
      if (callAcceptancePollRef.current) {
        clearInterval(callAcceptancePollRef.current);
      }

      let attempts = 0;
      const maxAttempts = 120; // 30 seconds at 250ms while the incoming call is ringing.

      const check = async () => {
        attempts += 1;
        try {
          const accessToken = localStorage.getItem('adultAccessToken') || '';
          if (!accessToken) return;

          const response = await fetch(`${API_BASE_URL}/v1/adult/sext/calls/${callId}`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          });

          if (!response.ok) return;
          const data = await response.json();
          if (!data?.success) return;

          if (data.status === 'active') {
            markPublicStreamEnded();
            return;
          }

          if (['declined', 'missed', 'ended', 'failed', 'cancelled'].includes(data.status) || attempts >= maxAttempts) {
            if (callAcceptancePollRef.current) {
              clearInterval(callAcceptancePollRef.current);
              callAcceptancePollRef.current = null;
            }
          }
        } catch {
          // Keep polling while the incoming call is still pending.
        }
      };

      void check();
      callAcceptancePollRef.current = setInterval(() => {
        void check();
      }, 250);
    };

    const handleIncomingCall = (data: { callId?: string }) => {
      if (!data?.callId) return;
      pollCallUntilAccepted(data.callId);
    };

    const handleSessionEnded = (data: { sessionId?: string }) => {
      if (!data?.sessionId || data.sessionId !== sessionId) return;

      toast.info('Public stream session ended');
      markPublicStreamEnded();
    };

    if (socket) {
      socket.on('cam:session_ended', handleSessionEnded);
      socket.on('call:incoming', handleIncomingCall);
    }

    const initHost = async () => {
      try {
        await client.setClientRole('host');
        await client.join(String(appId), roomId, token, userId);

        const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        localAudioTrackRef.current = audioTrack;

        const videoTrack = await AgoraRTC.createCameraVideoTrack();
        localVideoTrackRef.current = videoTrack;

        if (containerRef.current) {
          videoTrack.play(containerRef.current);
        }
        if (typeof (videoTrack as any).on === 'function') {
          (videoTrack as any).on('first-frame-decoded', () => {
            markReady();
          });
        }

        await client.publish([audioTrack, videoTrack]);

        if (socket && socket.connected) {
          socket.emit('cam:host_start', { sessionId });
        }
        if (onStreamEstablished) {
          onStreamEstablished();
        }
      } catch (err) {
        console.error('Agora Host Stream failed to initialize:', err);
        await stopLocalMedia();
        toast.error('Failed to start camera/microphone broadcast. Session cancelled.');
        stopLocalTracks();
        onEnd();
      }
    };

    void initHost();

    return () => {
      if (socket) {
        socket.off('cam:session_ended', handleSessionEnded);
        socket.off('call:incoming', handleIncomingCall);
      }
      if (callAcceptancePollRef.current) {
        clearInterval(callAcceptancePollRef.current);
        callAcceptancePollRef.current = null;
      }
      void stopLocalMedia();
    };
  }, [appId, token, roomId, userId, sessionId, containerRef, markReady, resetReadiness]);

  const handleEndClick = () => {
    if (window.confirm('Are you sure you want to end the broadcast?')) {
      onEnd();
    }
  };

  if (sessionEndedExternally) {
    return (
      <div
        style={{ position: 'relative', width: '100%', height: '100%', minHeight: '400px' }}
        className="flex items-center justify-center bg-[#0a0608]"
        data-testid="provider-stream-ended"
      >
        <div className="text-center space-y-2">
          <span className="text-5xl opacity-40">📹</span>
          <p className="text-xs text-[var(--az-text-muted)] font-serif italic">Camera Offline</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '400px' }}>
      {!videoState.isVideoReady && (
        <VideoFallbackOverlay
          avatarUrl={providerAvatar}
          displayName={providerName || userName || 'Provider'}
          statusText="Starting camera stream..."
        />
      )}
      <div
        ref={videoState.containerRef}
        style={{ width: '100%', height: '100%', minHeight: '400px', background: '#0a0608' }}
        className={`transition-opacity duration-300 ${
          videoState.isVideoReady ? 'opacity-100 z-0' : 'opacity-0 pointer-events-none'
        }`}
        data-testid="zego-provider-stream-room"
      />
      <div className="absolute bottom-6 inset-x-0 flex justify-center z-20">
        <button
          onClick={handleEndClick}
          className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase tracking-widest rounded-full shadow-[0_0_15px_rgba(220,38,38,0.5)] transition-all"
        >
          End Broadcast ✕
        </button>
      </div>
    </div>
  );
};

export default ProviderStreamRoom;
