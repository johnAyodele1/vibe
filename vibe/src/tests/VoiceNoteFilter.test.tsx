import { describe, it, expect } from 'vitest';
import { createVoiceRecognitionSession } from '../lib/media/voiceRecognition';

describe('Voice note verification session', () => {
  it('does not depend on browser SpeechRecognition support', async () => {
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;

    const session = createVoiceRecognitionSession();
    session.start();
    const result = await session.stop();

    expect(result.status).toBe('clean');
    expect(result.transcript).toBe('Voice note');
  });

  it('returns a clean placeholder because verification is server-side', async () => {
    const session = createVoiceRecognitionSession();
    session.start();

    await expect(session.stop()).resolves.toEqual({
      status: 'clean',
      transcript: 'Voice note',
    });
  });

  it('does not report a browser SpeechRecognition failure as a content violation', async () => {
    const session = createVoiceRecognitionSession();
    session.start();
    session.abort();

    const result = await session.stop();

    expect(result.status).toBe('unavailable_or_failed');
    expect(result.transcript).toBe('');
  });
});
