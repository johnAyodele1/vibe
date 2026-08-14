import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createVoiceRecognitionSession } from '../lib/media/voiceRecognition';

describe('VoiceNoteFilter SpeechRecognition and contact detection', () => {
  const originalSpeechRecognition = (window as any).SpeechRecognition;
  const originalWebkitSpeechRecognition = (window as any).webkitSpeechRecognition;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    (window as any).SpeechRecognition = originalSpeechRecognition;
    (window as any).webkitSpeechRecognition = originalWebkitSpeechRecognition;
  });

  it('returns unavailable_or_failed when SpeechRecognition is not supported', async () => {
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;

    const session = createVoiceRecognitionSession();
    session.start();
    const result = await session.stop();

    expect(result.status).toBe('unavailable_or_failed');
    expect(result.transcript).toBe('');
  });

  it('returns contact_detected when transcript contains phone number or contact info', async () => {
    class MockSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = '';
      onresult: ((event: any) => void) | null = null;
      onerror: ((event: any) => void) | null = null;
      onend: (() => void) | null = null;

      start() {
        if (this.onresult) {
          this.onresult({
            results: [
              [{ transcript: 'call me on zero eight zero one two three four five six seven eight', isFinal: true }],
            ],
          });
        }
      }

      stop() {
        if (this.onend) this.onend();
      }

      abort() {}
    }

    (window as any).SpeechRecognition = MockSpeechRecognition;

    const session = createVoiceRecognitionSession();
    session.start();
    const result = await session.stop();

    expect(result.status).toBe('contact_detected');
    expect(result.transcript).toContain('zero eight zero');
  });

  it('returns clean when transcript is clean of contact info', async () => {
    class MockSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = '';
      onresult: ((event: any) => void) | null = null;
      onerror: ((event: any) => void) | null = null;
      onend: (() => void) | null = null;

      start() {
        if (this.onresult) {
          this.onresult({
            results: [
              [{ transcript: 'Hey there, excited to talk to you tonight!', isFinal: true }],
            ],
          });
        }
      }

      stop() {
        if (this.onend) this.onend();
      }

      abort() {}
    }

    (window as any).SpeechRecognition = MockSpeechRecognition;

    const session = createVoiceRecognitionSession();
    session.start();
    const result = await session.stop();

    expect(result.status).toBe('clean');
    expect(result.transcript).toBe('Hey there, excited to talk to you tonight!');
  });

  it('returns unavailable_or_failed when transcript is empty or audio was silent', async () => {
    class MockSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = '';
      onresult: ((event: any) => void) | null = null;
      onerror: ((event: any) => void) | null = null;
      onend: (() => void) | null = null;

      start() {
        // No results produced
      }

      stop() {
        if (this.onend) this.onend();
      }

      abort() {}
    }

    (window as any).SpeechRecognition = MockSpeechRecognition;

    const session = createVoiceRecognitionSession();
    session.start();
    const result = await session.stop();

    expect(result.status).toBe('unavailable_or_failed');
    expect(result.transcript).toBe('');
  });
});
