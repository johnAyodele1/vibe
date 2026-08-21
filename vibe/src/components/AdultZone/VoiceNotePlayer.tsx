import React, { useState, useRef, useEffect } from 'react';

interface VoiceNotePlayerProps {
  mediaUrl?: string;
  mediaDurationSeconds?: number;
  isMe?: boolean;
  isFailed?: boolean;
}

const formatTime = (seconds: number): string => {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const WAVEFORM_INDICES = Array.from({ length: 15 }, (_, i) => i);

// Optimization (⚡ Bolt): Wrap VoiceNotePlayer in React.memo and use static waveform indices array to optimize audio component re-renders in chat message lists.
export const VoiceNotePlayer: React.FC<VoiceNotePlayerProps> = React.memo(({
  mediaUrl,
  mediaDurationSeconds = 0,
  isMe = false,
  isFailed = false,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number>(mediaDurationSeconds);

  useEffect(() => {
    if (mediaDurationSeconds && mediaDurationSeconds > 0) {
      setTimeout(() => setDuration(mediaDurationSeconds), 0);
    }
  }, [mediaDurationSeconds]);

  const togglePlayPause = (e?: React.SyntheticEvent) => {
    if (e) {
      e.stopPropagation();
    }
    if (!audioRef.current || !mediaUrl) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      if (audioRef.current.readyState === 0 && typeof audioRef.current.load === 'function') {
        try {
          audioRef.current.load();
        } catch {
          // Ignore load error in mock environments
        }
      }
      audioRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
        })
        .catch((err) => {
          console.error('Audio playback error:', err);
          setIsPlaying(false);
        });
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current && audioRef.current.duration && !isNaN(audioRef.current.duration)) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = 'touches' in e && e.touches.length > 0 ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clickX = clientX - rect.left;
    const width = rect.width;
    const seekFraction = Math.max(0, Math.min(1, clickX / width));
    const newTime = seekFraction * duration;
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const progressFraction = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const waveformBars = 15;

  return (
    <div
      data-testid="message-voice-note"
      className={`p-3.5 rounded-2xl flex items-center gap-3 w-64 message-voice-note ${
        isMe
          ? 'bg-pink-700 text-white'
          : 'bg-[#1e101a] text-gray-200 border border-pink-500/20'
      } ${isFailed ? 'msg-bubble--failed' : ''}`}
    >
      <audio
        ref={audioRef}
        src={mediaUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        preload="metadata"
        playsInline
        webkit-playsinline="true"
      />

      <button
        type="button"
        data-testid="voice-note-play-btn"
        onClick={(e) => togglePlayPause(e)}
        aria-label={isPlaying ? 'Pause voice note' : 'Play voice note'}
        className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center font-bold text-xs flex-shrink-0 hover:scale-105 active:scale-95 transition-transform cursor-pointer select-none"
      >
        {isPlaying ? '❚❚' : '▶'}
      </button>

      <div
        className="flex-grow flex items-end gap-0.5 h-6 cursor-pointer"
        onClick={handleSeek}
        title="Seek audio"
      >
        {WAVEFORM_INDICES.map((idx) => {
          const barFraction = idx / waveformBars;
          const isFilled = barFraction <= progressFraction;
          const heightPercent = Math.max(20, ((idx * 7) % 80) + 20);

          return (
            <span
              key={idx}
              className={`w-1.5 rounded-t transition-colors ${
                isFilled
                  ? isMe
                    ? 'bg-white'
                    : 'bg-pink-400'
                  : isMe
                  ? 'bg-pink-400/40'
                  : 'bg-pink-900/40'
              }`}
              style={{ height: `${heightPercent}%` }}
            />
          );
        })}
      </div>

      <span className="text-[10px] font-mono opacity-80 flex-shrink-0">
        {isPlaying ? formatTime(currentTime) : formatTime(duration)}
      </span>
    </div>
  );
});
