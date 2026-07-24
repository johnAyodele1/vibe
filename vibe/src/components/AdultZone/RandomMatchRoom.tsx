import React, { useEffect, useRef } from 'react';
import { ZegoUIKitPrebuilt } from '@zegocloud/zego-uikit-prebuilt';

interface RandomMatchRoomProps {
  appId: number;
  token: string;
  roomId: string;
  matchId: string;
  userId: string;
  onNext: () => void;
  onEnd: () => void;
}

const RandomMatchRoom: React.FC<RandomMatchRoomProps> = ({
  appId,
  token,
  roomId,
  userId,
  onNext,
  onEnd,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const kitToken = ZegoUIKitPrebuilt.generateKitTokenForProduction(
      appId,
      token,
      roomId,
      userId,
      'Stranger'
    );

    const zp = ZegoUIKitPrebuilt.create(kitToken);

    zp.joinRoom({
      container: containerRef.current,
      scenario: {
        mode: ZegoUIKitPrebuilt.OneONoneCall,
      },
      turnOnCameraWhenJoining: true,
      turnOnMicrophoneWhenJoining: true,
      showLeaveRoomConfirmDialog: false,
      showTextChat: false,
      showUserList: false,
      maxUsers: 2,
      onUserLeave: () => {
        // Partner left — auto trigger "Next Stranger" / re-queue
        onNext();
      },
    } as any);

    return () => {
      zp.destroy();
    };
  }, [roomId, appId, token, userId, onNext]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '500px' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: '500px' }} />

      {/* Overlay controls */}
      <div className="absolute bottom-6 inset-x-0 flex justify-center gap-4 z-10">
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
