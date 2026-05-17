import crypto from 'crypto';

export const generateStreamKey = (sessionId: string): string => {
  return `${sessionId}_${crypto.randomBytes(16).toString('hex')}`;
};

export const buildIngestUrl = (streamKey: string): string => {
  const host = process.env.MEDIA_SERVER_RTMP_HOST || 'rtmp://localhost/live';
  return `${host}/${streamKey}`;
};

export const buildPlaybackUrl = (streamKey: string): string => {
  const host = process.env.MEDIA_SERVER_HLS_HOST || 'http://localhost/hls';
  return `${host}/${streamKey}.m3u8`;
};

export const buildPrivatePlaybackUrl = (requestId: string): string => {
  const host = process.env.MEDIA_SERVER_HLS_HOST || 'http://localhost/hls';
  return `${host}/private_${requestId}.m3u8`;
};
