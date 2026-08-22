import React, { useEffect, useRef, useState, memo } from 'react';
import AgoraRTC, { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack, IAgoraRTCRemoteUser, ILocalTrack } from 'agora-rtc-sdk-ng';
import { useVideoReadiness } from '../../hooks/useVideoReadiness';
import VideoFallbackOverlay from './VideoFallbackOverlay';

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
  providerAvatar?: string;
  providerName?: string;
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
  providerAvatar,
  providerName,
}) => {
  const mainContainerRef = useRef<HTMLDivElement>(null);

  const remoteVideoState = useVideoReadiness();
  const localVideoState = useVideoReadiness();

  const { containerRef: remoteContainerRef, isVideoReady: isRemoteVideoReady, markReady: remoteMarkReady, resetReadiness: remoteResetReadiness } = remoteVideoState;
  const { containerRef: localContainerRef, isVideoReady: isLocalVideoReady, markReady: localMarkReady, resetReadiness: localResetReadiness } = localVideoState;

  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localAudioTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const localVideoTrackRef = useRef<ICameraVideoTrack | null>(null);

  const hasJoined = useRef(false);
  const startTimeRef = useRef<number>(0);
  const hasEndedRef = useRef(false);
  const isMountedRef = useRef(true);
  const effectGenRef = useRef(0);

  const [retry, setRetry] = useState(0);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(callType === 'video');
  const [isPartnerSpeaking, setIsPartnerSpeaking] = useState(false);

  const effectiveProviderAvatar = providerAvatar || partnerAvatar;
  const effectiveProviderName = providerName || partnerName || userName || 'Provider';

  const onCallEndRef = useRef(onCallEnd);
  useEffect(() => {
    onCallEndRef.current = onCallEnd;
  }, [onCallEnd]);

  const triggerCallEndOnce = (durationSeconds: number) => {
    if (!hasEndedRef.current) {
      hasEndedRef.current = true;
      onCallEndRef.current(durationSeconds);
    }
  };

  useEffect(() => {
    const currentGen = ++effectGenRef.current;
    const genRef = effectGenRef;
    isMountedRef.current = true;
    hasEndedRef.current = false;

    if (hasJoined.current) return;
    if (!mainContainerRef.current) return;

    if (!appId || !token || !roomId || !userId) {
      console.error('CallRoom: missing required props', {
        appId: !!appId,
        token: !!token,
        roomId: !!roomId,
        userId: !!userId,
      });
      return;
    }

    const rect = mainContainerRef.current.getBoundingClientRect();
    const globalObj = globalThis as unknown as { process?: { env?: { NODE_ENV?: string } } };
    const isTest = typeof globalObj.process !== 'undefined' && globalObj.process?.env?.NODE_ENV === 'test';
    if (!isTest && (rect.width === 0 || rect.height === 0)) {
      console.error('[CallRoom] Container has zero dimensions. Retrying...');
      const frame = requestAnimationFrame(() => {
        if (isMountedRef.current) {
          setRetry(prev => prev + 1);
        }
      });
      return () => cancelAnimationFrame(frame);
    }

    hasJoined.current = true;
    startTimeRef.current = Date.now();

    const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    clientRef.current = client;

    const handleUserPublished = async (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video' | 'datachannel') => {
      if (currentGen !== genRef.current) return;
      if (mediaType === 'datachannel') return;
      try {
        await client.subscribe(user, mediaType);
        if (currentGen !== genRef.current) return;
        if (mediaType === 'video' && user.videoTrack) {
          if (remoteContainerRef.current) {
            user.videoTrack.play(remoteContainerRef.current);
          }
          const vTrack = user.videoTrack as unknown as { on?: (evt: string, cb: () => void) => void };
          if (typeof vTrack.on === 'function') {
            vTrack.on('first-frame-decoded', () => {
              if (currentGen === genRef.current) remoteMarkReady();
            });
          }
        }
        if (mediaType === 'audio' && user.audioTrack) {
          user.audioTrack.play();
        }
      } catch (err) {
        console.error('Subscribe remote track error:', err);
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
      const elapsed = Math.max(1, Math.floor((Date.now() - startTimeRef.current) / 1000));
      triggerCallEndOnce(elapsed);
    };

    const handleVolumeIndicator = (volumes: Array<{ uid: string | number; level: number }>) => {
      if (!isMountedRef.current) return;
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
        if (currentGen !== genRef.current) {
          await client.leave();
          return;
        }

        client.enableAudioVolumeIndicator();

        const tracksToPublish: ILocalTrack[] = [];

        // Audio track is always initialized and published
        const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        if (currentGen !== genRef.current) {
          audioTrack.stop();
          audioTrack.close();
          await client.leave();
          return;
        }
        localAudioTrackRef.current = audioTrack;
        tracksToPublish.push(audioTrack);

        // Video track is only initialized and published for video calls
        if (callType === 'video') {
          const videoTrack = await AgoraRTC.createCameraVideoTrack();
          if (currentGen !== genRef.current) {
            audioTrack.stop();
            audioTrack.close();
            videoTrack.stop();
            videoTrack.close();
            await client.leave();
            return;
          }
          localVideoTrackRef.current = videoTrack;
          tracksToPublish.push(videoTrack);

          if (localContainerRef.current) {
            videoTrack.play(localContainerRef.current);
          }
          const vTrack = videoTrack as unknown as { on?: (evt: string, cb: () => void) => void };
          if (typeof vTrack.on === 'function') {
            vTrack.on('first-frame-decoded', () => {
              if (currentGen === genRef.current) localMarkReady();
            });
          }
        }

        if (tracksToPublish.length > 0 && currentGen === genRef.current) {
          await client.publish(tracksToPublish);
        }
      } catch (err) {
        console.error('Agora call initiation failed:', err);
      }
    };

    initCall();

    const stopLocalMedia = () => {
      remoteResetReadiness();
      localResetReadiness();
      if (localAudioTrackRef.current) {
        try {
          const msTrack = localAudioTrackRef.current.getMediaStreamTrack();
          if (msTrack) {
            msTrack.stop();
          }
        } catch {}
        try {
          localAudioTrackRef.current.stop();
          localAudioTrackRef.current.close();
        } catch {}
        localAudioTrackRef.current = null;
      }
      if (localVideoTrackRef.current) {
        try {
          const msTrack = localVideoTrackRef.current.getMediaStreamTrack();
          if (msTrack) {
            msTrack.stop();
          }
        } catch {}
        try {
          localVideoTrackRef.current.stop();
          localVideoTrackRef.current.close();
        } catch {}
        localVideoTrackRef.current = null;
      }
      if (clientRef.current) {
        try {
          clientRef.current.off('user-published', handleUserPublished);
          clientRef.current.off('user-unpublished', handleUserUnpublished);
          clientRef.current.off('user-left', handleUserLeft);
          clientRef.current.off('volume-indicator', handleVolumeIndicator);
          clientRef.current.leave().catch(() => {});
        } catch {}
        clientRef.current = null;
      }
      hasJoined.current = false;
    };

    return () => {
      genRef.current++;
      isMountedRef.current = false;
      stopLocalMedia();
    };
  }, [retry, appId, token, roomId, userId, callType, remoteContainerRef, localContainerRef, remoteMarkReady, remoteResetReadiness, localMarkReady, localResetReadiness]);

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
      if (!nextState) {
        localResetReadiness();
      }
    }
  };

  const handleEndCallLocal = async () => {
    const elapsed = Math.max(1, Math.floor((Date.now() - (startTimeRef.current || Date.now())) / 1000));
    remoteResetReadiness();
    localResetReadiness();
    if (localAudioTrackRef.current) {
      try {
        const msTrack = localAudioTrackRef.current.getMediaStreamTrack();
        if (msTrack) {
          msTrack.stop();
        }
      } catch {}
      try {
        localAudioTrackRef.current.stop();
        localAudioTrackRef.current.close();
      } catch {}
      localAudioTrackRef.current = null;
    }
    if (localVideoTrackRef.current) {
      try {
        const msTrack = localVideoTrackRef.current.getMediaStreamTrack();
        if (msTrack) {
          msTrack.stop();
        }
      } catch {}
      try {
        localVideoTrackRef.current.stop();
        localVideoTrackRef.current.close();
      } catch {}
      localVideoTrackRef.current = null;
    }
    if (clientRef.current) {
      try {
        await clientRef.current.leave();
      } catch {
        // ignore
      }
      clientRef.current = null;
    }
    hasJoined.current = false;
    triggerCallEndOnce(elapsed);
  };

  return (
    <div
      ref={mainContainerRef}
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
        /* Video Call Layout */
        <div className="absolute inset-0 flex flex-col md:flex-row gap-4 p-4">
          {/* Remote Video Container */}
          <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl relative overflow-hidden flex items-center justify-center">
            {!isRemoteVideoReady && (
              <VideoFallbackOverlay
                avatarUrl={effectiveProviderAvatar}
                displayName={partnerName || effectiveProviderName}
                statusText="Connecting video..."
              />
            )}
            <div
              ref={remoteContainerRef}
              className={`w-full h-full absolute inset-0 transition-opacity duration-300 ${
                isRemoteVideoReady ? 'opacity-100 z-0' : 'opacity-0 pointer-events-none'
              }`}
            />
            <div className="absolute top-4 left-4 bg-black/60 px-3 py-1 rounded text-xs text-white uppercase tracking-widest z-20">
              {partnerName || userName || 'Partner'}
            </div>
          </div>

          {/* Local Video Container */}
          <div className="w-full md:w-1/3 bg-zinc-950 border border-zinc-800 rounded-xl relative overflow-hidden flex items-center justify-center aspect-video md:aspect-auto">
            {!isLocalVideoReady && (
              <VideoFallbackOverlay
                avatarUrl={effectiveProviderAvatar}
                displayName="You"
                statusText={cameraEnabled ? "Starting camera..." : "Camera Off"}
              />
            )}
            <div
              ref={localContainerRef}
              className={`w-full h-full absolute inset-0 transition-opacity duration-300 ${
                isLocalVideoReady ? 'opacity-100 z-0' : 'opacity-0 pointer-events-none'
              }`}
            />
            <div className="absolute top-4 left-4 bg-black/60 px-3 py-1 rounded text-xs text-white uppercase tracking-widest z-20">
              You
            </div>
          </div>
        </div>
      ) : (
        /* Audio Call Layout */
        <>
          {/* Hidden containers for track binding so Agora doesn't complain, keeping refs unique */}
          <div style={{ display: 'none' }}>
            <div ref={remoteContainerRef} />
            <div ref={localContainerRef} />
          </div>

          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-gradient-to-b from-zinc-900 via-zinc-950 to-black overflow-hidden select-none">
            {/* Subtle blurred full-bleed background */}
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
                    src={partnerAvatar || effectiveProviderAvatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=150&auto=format&fit=crop"}
                    className="w-full h-full object-cover select-none pointer-events-none"
                    alt={partnerName || 'Partner'}
                  />
                </div>

                {/* Speaking Indicator Badge */}
                {isPartnerSpeaking && (
                  <span className="absolute -bottom-1 bg-green-500 text-black text-[9px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full border border-black shadow-lg">
                    Speaking
                  </span>
                )}
              </div>

              {/* Username */}
              <h2 className="text-2xl md:text-3xl font-serif italic text-white tracking-wide font-semibold drop-shadow-md text-center truncate max-w-xs px-4 mx-auto" title={partnerName || userName || 'Partner'}>
                {partnerName || userName || 'Partner'}
              </h2>

              {/* Subtle Call Status Label */}
              <div className="flex items-center gap-2 mt-3 text-xs tracking-widest uppercase font-mono text-zinc-400">
                <span className={`w-1.5 h-1.5 rounded-full bg-green-500 ${isPartnerSpeaking ? 'animate-ping' : 'animate-pulse'}`} />
                <span>In Call</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Control Overlay with Modern SVG Icons */}
      <div className="absolute bottom-6 inset-x-0 flex justify-center items-center gap-4 z-20 pointer-events-auto">
        {/* Mic Toggle Button */}
        <button
          onClick={toggleMic}
          aria-label={micEnabled ? "Mute Microphone" : "Unmute Microphone"}
          title={micEnabled ? "Mute Microphone" : "Unmute Microphone"}
          className={`w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center transition-all shadow-lg active:scale-95 ${
            micEnabled
              ? 'bg-zinc-800 text-white hover:bg-zinc-700 border border-zinc-700'
              : 'bg-red-950 text-red-500 border border-red-500/50 hover:bg-red-900/50'
          }`}
        >
          {micEnabled ? (
            <svg className="w-5 h-5 md:w-6 md:h-6 fill-current" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
            </svg>
          ) : (
            <svg className="w-5 h-5 md:w-6 md:h-6 fill-current" viewBox="0 0 24 24">
              <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zM14.98 11.17L9 5.18V5c0-1.66 1.34-3 3-3s3 1.34 3 3v6c0 .06-.01.11-.02.17zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c1.33-.19 2.56-.73 3.57-1.53l3.16 3.16L21 18.28 4.27 3z"/>
            </svg>
          )}
        </button>

        {/* Camera Toggle Button */}
        {callType === 'video' && (
          <button
            onClick={toggleCamera}
            aria-label={cameraEnabled ? "Turn Off Camera" : "Turn On Camera"}
            title={cameraEnabled ? "Turn Off Camera" : "Turn On Camera"}
            className={`w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center transition-all shadow-lg active:scale-95 ${
              cameraEnabled
                ? 'bg-zinc-800 text-white hover:bg-zinc-700 border border-zinc-700'
                : 'bg-red-950 text-red-500 border border-red-500/50 hover:bg-red-900/50'
          }`}
          >
            {cameraEnabled ? (
              <svg className="w-5 h-5 md:w-6 md:h-6 fill-current" viewBox="0 0 24 24">
                <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
              </svg>
            ) : (
              <svg className="w-5 h-5 md:w-6 md:h-6 fill-current" viewBox="0 0 24 24">
                <path d="M21 6.5l-4 4V7c0-.55-.45-1-1-1H9.82l2 2H16v4.18l2 2V6.5zM3.27 2L2 3.27 4.73 6H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.21 0 .39-.08.55-.18L19.73 21 21 19.73 3.27 2zM5 16V8h1.73l8 8H5z"/>
              </svg>
            )}
          </button>
        )}

        {/* End Call Button */}
        <button
          onClick={handleEndCallLocal}
          aria-label="End Call"
          title="End Call"
          className="w-12 h-12 md:w-14 md:h-14 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center transition-all shadow-[0_0_20px_rgba(220,38,38,0.6)] active:scale-95 border border-red-500"
        >
          <svg className="w-6 h-6 md:w-7 md:h-7 fill-current transform rotate-[135deg]" viewBox="0 0 24 24">
            <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/>
          </svg>
        </button>
      </div>
    </div>
  );
};

export default memo(CallRoom);
