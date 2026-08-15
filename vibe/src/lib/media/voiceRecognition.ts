/**
 * Speech recognition is intentionally removed for voice notes.
 *
 * Voice notes are recorded and uploaded directly as audio media files without browser
 * speech recognition or content filtering checks.
 */
export interface VoiceRecognitionResult {
  status: 'clean';
  transcript: string;
}

export interface VoiceRecognitionSession {
  start: () => void;
  stop: () => Promise<VoiceRecognitionResult>;
  abort: () => void;
}

export function createVoiceRecognitionSession(): VoiceRecognitionSession {
  return {
    start: () => {},
    stop: async () => ({
      status: 'clean',
      transcript: '[Voice Note]',
    }),
    abort: () => {},
  };
}
