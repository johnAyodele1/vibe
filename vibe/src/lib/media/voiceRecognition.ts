import { detectContactSharing } from '@yourapp/content-filter';

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

export function createVoiceRecognitionSession(): VoiceRecognitionSession {
  const SpeechRecognitionClass =
    typeof window !== 'undefined'
      ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      : null;

  if (!SpeechRecognitionClass) {
    return {
      start: () => {},
      stop: async () => ({
        status: 'unavailable_or_failed',
        transcript: '',
      }),
      abort: () => {},
    };
  }

  let recognition: any = null;
  let transcript = '';
  let hasError = false;
  let isRunning = false;

  try {
    recognition = new SpeechRecognitionClass();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = typeof navigator !== 'undefined' ? navigator.language || 'en-US' : 'en-US';

    recognition.onresult = (event: any) => {
      let current = '';
      for (let i = 0; i < event.results.length; i++) {
        current += event.results[i][0].transcript + ' ';
      }
      transcript = current.trim();
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      hasError = true;
    };

    recognition.onend = () => {
      isRunning = false;
    };
  } catch (err) {
    console.error('Failed to initialize SpeechRecognition:', err);
    hasError = true;
  }

  return {
    start: () => {
      if (recognition && !isRunning) {
        try {
          transcript = '';
          hasError = false;
          isRunning = true;
          recognition.start();
        } catch (e) {
          console.error('SpeechRecognition start error:', e);
          hasError = true;
        }
      }
    },
    stop: () => {
      return new Promise<VoiceRecognitionResult>((resolve) => {
        if (!recognition) {
          return resolve({
            status: 'unavailable_or_failed',
            transcript: '',
          });
        }

        if (isRunning) {
          try {
            recognition.stop();
          } catch (e) {}
        }

        setTimeout(() => {
          const finalTranscript = transcript.trim();
          if (hasError || !finalTranscript) {
            return resolve({
              status: 'unavailable_or_failed',
              transcript: finalTranscript,
            });
          }

          const check = detectContactSharing(finalTranscript);
          if (check.detected) {
            return resolve({
              status: 'contact_detected',
              transcript: finalTranscript,
              matchedText: check.matchedText || undefined,
            });
          }

          return resolve({
            status: 'clean',
            transcript: finalTranscript,
          });
        }, 100);
      });
    },
    abort: () => {
      if (recognition) {
        try {
          recognition.abort();
        } catch (e) {}
      }
    },
  };
}
