import React, { useEffect, useRef } from 'react';
import AgoraRTC, { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';

interface ProviderStreamRoomProps {
  appId: string | number;
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
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localAudioTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const localVideoTrackRef = useRef<ICameraVideoTrack | null>(null);

  useEffect(() => {
    const client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
    clientRef.current = client;

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

        await client.publish([audioTrack, videoTrack]);
      } catch (err) {
        console.error('Agora Host Stream failed to initialize:', err);
      }
    };

    initHost();

    return () => {
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
        clientRef.current.leave().catch(() => {});
        clientRef.current = null;
      }
    };
  }, [appId, token, roomId, userId, userName, sessionId]);

  const handleEndClick = () => {
    if (window.confirm('Are you sure you want to end the broadcast?')) {
      onEnd();
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '400px' }}>
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%', minHeight: '400px', background: '#0a0608' }}
        data-testid="zego-provider-stream-room"
      />
      {/* End Stream floating overlay button */}
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
