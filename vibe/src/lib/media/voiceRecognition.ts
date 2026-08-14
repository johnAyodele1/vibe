/**
 * Voice-note recognition is intentionally disabled.
 *
 * Voice notes are binary media messages and must be sent directly after
 * recording. Keeping this compatibility session avoids changing the two
 * existing recording components while ensuring no browser SpeechRecognition
 * API or content-filtering logic runs for voice notes.
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
