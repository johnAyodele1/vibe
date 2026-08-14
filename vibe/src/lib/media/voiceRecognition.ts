/**
 * Voice-note browser recognition is disabled.
 *
 * Voice notes must never use the browser SpeechRecognition API. The audio
 * blob is sent to the server, where the authoritative content checks run.
 * This no-op compatibility session remains temporarily so the existing
 * recording components can send audio without invoking browser recognition.
 */
export interface VoiceRecognitionResult {
  status: 'clean';
  transcript: '';
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
      transcript: '',
    }),
    abort: () => {},
  };
}
