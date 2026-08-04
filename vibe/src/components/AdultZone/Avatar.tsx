import React, { useState } from 'react';

interface AvatarProps {
  src?: string | null;
  name?: string;
  size?: number;
  className?: string;
}

const getInitials = (name: string): string => {
  if (!name || typeof name !== 'string') return '?';
  const cleanName = name.trim();
  if (!cleanName) return '?';

  const words = cleanName.split(/\s+/).filter(w => w.length > 0);

  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  if (words.length === 1) {
    return words[0][0].toUpperCase();
  }

  return '?';
};

export const Avatar: React.FC<AvatarProps> = ({ src, name, size = 40, className }) => {
  const [imgError, setImgError] = useState(false);
  const initials = getInitials(name || '');

  if (src && !imgError) {
    return (
      <img
        src={src}
        alt={name || 'Avatar'}
        className={className}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div
      className={`avatar-fallback ${className || ''}`}
      style={{
        width:          size,
        height:         size,
        borderRadius:   '50%',
        background:     'var(--az-accent-crimson)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        flexShrink:     0,
        overflow:       'hidden',
      }}
    >
      <span style={{
        font:       `600 ${Math.round(size * 0.35)}px/1 'DM Sans', sans-serif`,
        color:      'white',
        userSelect: 'none',
        letterSpacing: '-0.02em',
      }}>
        {initials}
      </span>
    </div>
  );
};

export default Avatar;
