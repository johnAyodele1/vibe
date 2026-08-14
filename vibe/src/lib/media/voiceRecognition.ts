export interface VoiceRecognitionResult {
  status: 'clean' | 'contact_detected' | 'unavailable_or_failed';
  transcript: string;
  matchedText?: string;
}

export interface VoiceRecognitionSession {
  start: () => void;
  stop: () => Promise<VoiceRecognitionResult>;
  abort: () => void;
}

/**
 * Voice-note verification is now authoritative on the backend via whisper.cpp.
 * The browser SpeechRecognition API is deliberately not used because it is not
 * consistently available across browsers (including Firefox).
 *
 * The returned placeholder keeps the existing recorder flow compatible. The
 * actual transcript used for moderation is produced server-side before the
 * audio is stored.
 */
export function createVoiceRecognitionSession(): VoiceRecognitionSession {
  let aborted = false;

  return {
    start: () => {
      aborted = false;
    },
    stop: async () => {
      if (aborted) {
        return {
          status: 'unavailable_or_failed',
          transcript: '',
        };
      }

      return {
        status: 'clean',
        transcript: 'Voice note',
      };
    },
    abort: () => {
      aborted = true;
    },
  };
}
