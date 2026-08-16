import React from 'react';

interface VideoFallbackOverlayProps {
  avatarUrl?: string;
  displayName?: string;
  statusText?: string;
  className?: string;
}

export const VideoFallbackOverlay: React.FC<VideoFallbackOverlayProps> = ({
  avatarUrl,
  displayName,
  statusText = 'Connecting video...',
  className = '',
}) => {
  const fallbackAvatar = '/placeholder.svg';
  const photoSrc = avatarUrl || fallbackAvatar;

  return (
    <div
      data-testid="video-fallback-overlay"
      className={`absolute inset-0 z-10 flex flex-col items-center justify-center bg-zinc-950 p-4 transition-all duration-300 pointer-events-none overflow-hidden ${className}`}
    >
      {/* Blurred background photo fill */}
      <div
        className="absolute inset-0 bg-cover bg-center filter blur-3xl opacity-25 scale-110 pointer-events-none transition-all duration-700"
        style={{ backgroundImage: `url(${photoSrc})` }}
      />

      {/* Subtle pulsing glow rings */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-64 h-64 rounded-full bg-pink-500/10 blur-[60px] animate-pulse" />
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center text-center">
        {/* Avatar Ring */}
        <div className="relative mb-3 flex items-center justify-center">
          <div className="absolute -inset-2 rounded-full bg-gradient-to-tr from-pink-500 via-amber-500 to-pink-500 opacity-40 blur-sm animate-pulse" />
          <div className="w-24 h-24 md:w-32 md:h-32 rounded-full overflow-hidden border-2 border-black bg-zinc-900 relative shadow-2xl">
            <img
              src={photoSrc}
              alt={displayName || 'Provider'}
              className="w-full h-full object-cover select-none pointer-events-none"
            />
          </div>
        </div>

        {/* Display Name */}
        {displayName && (
          <h3 className="text-lg md:text-xl font-serif italic text-white tracking-wide drop-shadow-md max-w-xs truncate px-2">
            {displayName}
          </h3>
        )}

        {/* Pulsing Status Text */}
        <div className="flex items-center gap-2 mt-2 text-[10px] md:text-xs font-mono uppercase tracking-widest text-pink-400">
          <span className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-ping" />
          <span>{statusText}</span>
        </div>
      </div>
    </div>
  );
};

export default VideoFallbackOverlay;
