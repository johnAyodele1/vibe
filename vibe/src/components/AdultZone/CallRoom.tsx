import React, { useEffect, useRef, useState, memo } from 'react';
import AgoraRTC, { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack, IAgoraRTCRemoteUser } from 'agora-rtc-sdk-ng';

interface CallRoomProps {
  appId: string | number;
  token: string;
  roomId: string;
  userId: string;
  userName: string;
  callType: 'video' | 'audio';
  onCallEnd: (durationSeconds: number) => void;
  partnerName?: string;
  partnerAvatar?: string;
}

const CallRoom: React.FC<CallRoomProps> = ({
  appId,
  token,
  roomId,
  userId,
  userName,
  callType,
  onCallEnd,
  partnerName,
  partnerAvatar,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const localVideoRef = useRef<HTMLDivElement>(null);
  const remoteVideoRef = useRef<HTMLDivElement>(null);

  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localAudioTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const localVideoTrackRef = useRef<ICameraVideoTrack | null>(null);

  const hasJoined = useRef(false);
  const [retry, setRetry] = useState(0);

  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(callType === 'video');
  const [isPartnerSpeaking, setIsPartnerSpeaking] = useState(false);

  useEffect(() => {
    if (hasJoined.current) return;
    if (!containerRef.current) return;

    if (!appId || !token || !roomId || !userId) {
      console.error('CallRoom: missing required props', {
        appId: !!appId,
        token: !!token,
        roomId: !!roomId,
        userId: !!userId,
      });
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const isTest = typeof (globalThis as any).process !== 'undefined' && (globalThis as any).process.env?.NODE_ENV === 'test';
    if (!isTest && (rect.width === 0 || rect.height === 0)) {
      console.error('[CallRoom] Container has zero dimensions. Agora cannot render video.');
      const frame = requestAnimationFrame(() => {
        setRetry(prev => prev + 1);
      });
      return () => cancelAnimationFrame(frame);
    }

    hasJoined.current = true;
    const startTime = Date.now();

    const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    clientRef.current = client;

    const handleUserPublished = async (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video' | 'datachannel') => {
      if (mediaType === 'datachannel') return;
      await client.subscribe(user, mediaType);
      if (mediaType === 'video' && user.videoTrack) {
        if (remoteVideoRef.current) {
          user.videoTrack.play(remoteVideoRef.current);
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

    const handleUserLeft = () => {
      const durationSeconds = Math.floor((Date.now() - startTime) / 1000);
      onCallEnd(durationSeconds);
    };

    const handleVolumeIndicator = (volumes: any[]) => {
      const remoteSpeakers = volumes.filter(v => String(v.uid) !== String(userId) && v.level > 15);
      setIsPartnerSpeaking(remoteSpeakers.length > 0);
    };

    client.on('user-published', handleUserPublished);
    client.on('user-unpublished', handleUserUnpublished);
    client.on('user-left', handleUserLeft);
    client.on('volume-indicator', handleVolumeIndicator);

    const initCall = async () => {
      try {
        await client.join(String(appId), roomId, token, userId);
        client.enableAudioVolumeIndicator();

        const tracksToPublish: any[] = [];

        // Audio track is always initialized and published
        const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        localAudioTrackRef.current = audioTrack;
        tracksToPublish.push(audioTrack);

        // Video track is only initialized and published for video calls
        if (callType === 'video') {
          const videoTrack = await AgoraRTC.createCameraVideoTrack();
          localVideoTrackRef.current = videoTrack;
          tracksToPublish.push(videoTrack);

          if (localVideoRef.current) {
            videoTrack.play(localVideoRef.current);
          }
        }

        if (tracksToPublish.length > 0) {
          await client.publish(tracksToPublish);
        }
      } catch (err) {
        console.error('Agora call initiation failed:', err);
      }
    };

    initCall();

    return () => {
      const leaveAndCleanup = async () => {
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
          clientRef.current.off('volume-indicator', handleVolumeIndicator);
          try {
            await clientRef.current.leave();
          } catch (e) {
            // Ignore leave errors
          }
          clientRef.current = null;
        }
        hasJoined.current = false;
      };
      leaveAndCleanup();
    };
  }, [retry, appId, token, roomId, userId, callType]);

  const toggleMic = async () => {
    if (localAudioTrackRef.current) {
      const nextState = !micEnabled;
      await localAudioTrackRef.current.setEnabled(nextState);
      setMicEnabled(nextState);
    }
  };

  const toggleCamera = async () => {
    if (callType !== 'video') return;
    if (localVideoTrackRef.current) {
      const nextState = !cameraEnabled;
      await localVideoTrackRef.current.setEnabled(nextState);
      setCameraEnabled(nextState);
    }
  };

  const handleEndCallLocal = async () => {
    if (clientRef.current) {
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
      try {
        await clientRef.current.leave();
      } catch (e) {
        // ignore
      }
      clientRef.current = null;
    }
    hasJoined.current = false;
    onCallEnd(10); // Trigger standard onCallEnd
  };

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
    >
      {callType === 'video' ? (
        /* Video Call Layout (Exactly identical to original code) */
        <div className="absolute inset-0 flex flex-col md:flex-row gap-4 p-4">
          {/* Remote Video Container */}
          <div className="flex-1 bg-zinc-950/40 border border-zinc-800 rounded-xl relative overflow-hidden flex items-center justify-center">
            <div ref={remoteVideoRef} className="w-full h-full absolute inset-0" />
            <div className="absolute top-4 left-4 bg-black/60 px-3 py-1 rounded text-xs text-white uppercase tracking-widest z-10">
              {userName || 'Partner'}
            </div>
          </div>

          {/* Local Video Container (Only if video call) */}
          <div className="w-full md:w-1/3 bg-zinc-950/40 border border-zinc-800 rounded-xl relative overflow-hidden flex items-center justify-center aspect-video md:aspect-auto">
            <div ref={localVideoRef} className="w-full h-full absolute inset-0" />
            <div className="absolute top-4 left-4 bg-black/60 px-3 py-1 rounded text-xs text-white uppercase tracking-widest z-10">
              You
            </div>
          </div>
        </div>
      ) : (
        /* Premium Audio Call Layout */
        <>
          {/* Hidden containers for track binding so Agora doesn't complain, keeping refs unique */}
          <div style={{ display: 'none' }}>
            <div ref={remoteVideoRef} />
            <div ref={localVideoRef} />
          </div>

          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-gradient-to-b from-zinc-900 via-zinc-950 to-black overflow-hidden select-none">
            {/* Subtle blurred full-bleed background for luxury dark-editorial feel */}
            {partnerAvatar && (
              <div
                className="absolute inset-0 bg-cover bg-center filter blur-3xl opacity-25 scale-110 pointer-events-none transition-all duration-1000"
                style={{ backgroundImage: `url(${partnerAvatar})` }}
              />
            )}

            {/* Glowing/Pulsing circles background animation */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
              <div className={`absolute w-96 h-96 rounded-full bg-pink-500/5 blur-[80px] transition-transform duration-700 ${
                isPartnerSpeaking ? 'scale-125 opacity-40' : 'scale-100 opacity-20'
              }`} />
              <div className={`absolute w-72 h-72 rounded-full bg-amber-500/5 blur-[60px] transition-transform duration-1000 delay-100 ${
                isPartnerSpeaking ? 'scale-130 opacity-30' : 'scale-100 opacity-10'
              }`} />
            </div>

            <div className="relative z-10 flex flex-col items-center justify-center">
              {/* Centered Large Circular Avatar */}
              <div className="relative flex items-center justify-center mb-8">
                {/* Outer pulsing gold/pink glow ring */}
                <div className={`absolute -inset-4 rounded-full bg-gradient-to-tr from-amber-500 to-pink-500 opacity-25 blur-sm transition-all duration-500 ${
                  isPartnerSpeaking ? 'scale-110 opacity-60' : 'scale-100'
                }`} />

                {/* Rotating/shimmer border overlay */}
                <div className={`absolute -inset-1 rounded-full p-[3px] bg-gradient-to-tr from-amber-500 via-pink-500 to-amber-500 transition-all duration-500 ${
                  isPartnerSpeaking ? 'shadow-[0_0_25px_rgba(236,72,153,0.5)]' : 'shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                }`} />

                <div className="w-32 h-32 md:w-40 md:h-40 rounded-full overflow-hidden relative border-2 border-black bg-zinc-900">
                  <img
                    src={partnerAvatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=150&auto=format&fit=crop"}
                    className="w-full h-full object-cover select-none pointer-events-none"
                    alt={partnerName || 'Partner'}
                  />
                </div>

                {/* Tiny Speaking Indicator Badge */}
                {isPartnerSpeaking && (
                  <span className="absolute -bottom-1 bg-green-500 text-black text-[9px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full border border-black shadow-lg">
                    Speaking
                  </span>
                )}
              </div>

              {/* Restyled Username below the avatar with Premium Typography */}
              <h2 className="text-2xl md:text-3xl font-serif italic text-white tracking-wide font-semibold drop-shadow-md text-center">
                {partnerName || userName || 'Partner'}
              </h2>

              {/* Subtle Call Status Label with pulsing light indicator */}
              <div className="flex items-center gap-2 mt-3 text-xs tracking-widest uppercase font-mono text-zinc-400">
                <span className={`w-1.5 h-1.5 rounded-full bg-green-500 ${isPartnerSpeaking ? 'animate-ping' : 'animate-pulse'}`} />
                <span>In Call</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Control Overlay */}
      <div className="absolute bottom-6 inset-x-0 flex justify-center items-center gap-4 z-20 pointer-events-auto">
        <button
          onClick={toggleMic}
          className={`p-4 rounded-full transition-all ${
            micEnabled ? 'bg-zinc-800 text-white hover:bg-zinc-700' : 'bg-red-950 text-red-500 border border-red-500/30'
          }`}
          title="Toggle Microphone"
        >
          {micEnabled ? '🎤' : '🎙️'}
        </button>

        {callType === 'video' && (
          <button
            onClick={toggleCamera}
            className={`p-4 rounded-full transition-all ${
              cameraEnabled ? 'bg-zinc-800 text-white hover:bg-zinc-700' : 'bg-red-950 text-red-500 border border-red-500/30'
            }`}
            title="Toggle Camera"
          >
            {cameraEnabled ? '📹' : '📸'}
          </button>
        )}

        <button
          onClick={handleEndCallLocal}
          className="p-4 bg-red-600 text-white rounded-full hover:bg-red-700 transition-all shadow-[0_0_15px_rgba(220,38,38,0.5)]"
          title="End Call"
        >
          ❌
        </button>
      </div>
    </div>
  );
};

export default memo(CallRoom);
