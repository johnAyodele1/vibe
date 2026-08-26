import React, { useEffect, useRef, useState, useCallback } from 'react';
import AgoraRTC, { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack, IAgoraRTCRemoteUser } from 'agora-rtc-sdk-ng';
import { Socket } from 'socket.io-client';
import { useVideoReadiness } from '../../hooks/useVideoReadiness';
import VideoFallbackOverlay from './VideoFallbackOverlay';

interface ChatMessage {
  id: string;
  senderId: string;
  content: string;
  timestamp: number;
}

interface RandomMatchRoomProps {
  appId: string | number;
  token: string;
  roomId: string;
  matchId: string;
  userId: string;
  socket?: Socket | null;
  mode?: 'text' | 'video' | 'both';
  partnerAvatar?: string;
  partnerName?: string;
  onNext: () => void;
  onEnd: () => void;
}

type TrackWithEvents = {
  on?: (event: string, callback: () => void) => void;
};

const RandomMatchRoom: React.FC<RandomMatchRoomProps> = ({
  appId,
  token,
  roomId,
  matchId,
  userId,
  socket,
  mode = 'both',
  partnerAvatar,
  partnerName,
  onNext,
  onEnd,
}) => {
  const isVideoEnabled = mode === 'video' || mode === 'both';
  const isTextEnabled = mode === 'text' || mode === 'both';

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [textInput, setTextInput] = useState('');
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  const remoteVideoState = useVideoReadiness();
  const localVideoState = useVideoReadiness();

  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localAudioTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const localVideoTrackRef = useRef<ICameraVideoTrack | null>(null);

  const {
    containerRef: remoteContainerRef,
    isVideoReady: isRemoteVideoReady,
    markReady: remoteMarkReady,
    resetReadiness: remoteResetReadiness,
  } = remoteVideoState;

  const {
    containerRef: localContainerRef,
    isVideoReady: isLocalVideoReady,
    markReady: localMarkReady,
    resetReadiness: localResetReadiness,
  } = localVideoState;

  // Socket chat messaging handlers
  useEffect(() => {
    if (!socket || !roomId) return;

    socket.emit('room:join', { roomId });

    const handleNewMessage = (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
    };

    socket.on('random:new_message', handleNewMessage);

    return () => {
      socket.off('random:new_message', handleNewMessage);
      socket.emit('room:leave', { roomId });
    };
  }, [socket, roomId]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!textInput.trim() || !socket || !roomId) return;

      socket.emit('random:chat_message', {
        roomId,
        content: textInput.trim(),
      });
      setTextInput('');
    },
    [textInput, socket, roomId]
  );

  // Agora RTC lifecycle
  useEffect(() => {
    if (!isVideoEnabled) return;

    const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    clientRef.current = client;

    const handleUserPublished = async (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video' | 'datachannel') => {
      if (mediaType === 'datachannel') return;
      await client.subscribe(user, mediaType);
      if (mediaType === 'video' && user.videoTrack) {
        if (remoteContainerRef.current) {
          user.videoTrack.play(remoteContainerRef.current);
        }
        const trackWithEvents = user.videoTrack as unknown as TrackWithEvents;
        if (typeof trackWithEvents.on === 'function') {
          trackWithEvents.on('first-frame-decoded', () => {
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
        const trackWithEvents = videoTrack as unknown as TrackWithEvents;
        if (typeof trackWithEvents.on === 'function') {
          trackWithEvents.on('first-frame-decoded', () => {
            localMarkReady();
          });
        }

        await client.publish([audioTrack, videoTrack]);
      } catch (err) {
        console.error('Agora Random Match initialization failed:', err);
      }
    };

    void initCall();

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
  }, [
    isVideoEnabled,
    roomId,
    appId,
    token,
    userId,
    onNext,
    remoteContainerRef,
    localContainerRef,
    remoteMarkReady,
    remoteResetReadiness,
    localMarkReady,
    localResetReadiness,
  ]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '520px', background: '#0a0608' }} className="flex flex-col">
      <div className="flex-1 flex flex-col md:flex-row gap-4 p-4 pb-28">
        {/* Media Stream Section (Video / Cam Mode) */}
        {isVideoEnabled && (
          <div className="flex-1 flex flex-col md:flex-row gap-4">
            {/* Remote Partner */}
            <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl relative overflow-hidden flex items-center justify-center min-h-[260px]">
              {!isRemoteVideoReady && (
                <VideoFallbackOverlay
                  avatarUrl={partnerAvatar}
                  displayName={partnerName || 'Stranger'}
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
                {partnerName || 'Stranger'}
              </div>
            </div>

            {/* Local Video */}
            <div className="w-full md:w-1/3 bg-zinc-950 border border-zinc-800 rounded-xl relative overflow-hidden flex items-center justify-center aspect-video md:aspect-auto min-h-[160px]">
              {!isLocalVideoReady && (
                <VideoFallbackOverlay
                  avatarUrl={partnerAvatar}
                  displayName="You"
                  statusText="Starting camera..."
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
        )}

        {/* Text Chat Panel (Text Only or Both Mode) */}
        {isTextEnabled && (
          <div className={`${isVideoEnabled ? 'w-full md:w-80' : 'w-full flex-1'} bg-zinc-900 border border-zinc-800 rounded-xl flex flex-col overflow-hidden min-h-[300px]`}>
            <div className="p-3 bg-zinc-950 border-b border-zinc-800 text-xs font-bold text-zinc-300 uppercase tracking-wider flex justify-between items-center">
              <span>💬 Live Stranger Chat</span>
              <span className="text-[10px] text-pink-400">{mode === 'text' ? 'Text Only' : 'Both Mode'}</span>
            </div>

            <div className="flex-1 p-3 overflow-y-auto space-y-3 max-h-[360px]">
              {messages.length === 0 ? (
                <div className="text-center text-zinc-600 text-xs italic py-8">
                  Say hello! You are connected with a stranger.
                </div>
              ) : (
                messages.map((m) => {
                  const isMe = m.senderId === userId;
                  return (
                    <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                      <div className={`px-3 py-2 rounded-2xl max-w-[85%] text-xs ${isMe ? 'bg-pink-600 text-white rounded-br-none' : 'bg-zinc-800 text-zinc-200 rounded-bl-none'}`}>
                        {m.content}
                      </div>
                      <span className="text-[9px] text-zinc-500 mt-1 px-1">
                        {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={chatBottomRef} />
            </div>

            <form onSubmit={handleSendMessage} className="p-2 bg-zinc-950 border-t border-zinc-800 flex gap-2">
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-full px-4 py-2 text-xs text-white focus:outline-none focus:border-pink-500"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs rounded-full transition-all"
              >
                Send
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Control Actions Bar */}
      <div className="absolute bottom-6 inset-x-0 flex justify-center gap-4 z-20">
        <button
          onClick={onNext}
          className="px-6 py-3 bg-[var(--az-accent-primary)] hover:bg-pink-700 text-white font-bold text-xs uppercase tracking-widest rounded-full shadow-[0_0_15px_var(--az-glow)] transition-all"
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
