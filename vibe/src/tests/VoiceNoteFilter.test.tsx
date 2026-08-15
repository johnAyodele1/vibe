import { beforeEach, describe, it, expect, vi } from 'vitest';
import { createVoiceRecognitionSession } from '../lib/media/voiceRecognition';

describe('Voice note recognition bypass', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('does not use browser SpeechRecognition', async () => {
    const start = vi.fn();
    const stop = vi.fn();

    (window as any).SpeechRecognition = class {
      start = start;
      stop = stop;
    };
    (window as any).webkitSpeechRecognition = class {
      start = start;
      stop = stop;
    };

    const session = createVoiceRecognitionSession();
    session.start();
    const result = await session.stop();

    expect(start).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'clean', transcript: '' });
  });

  it('returns clean without transcription or contact filtering', async () => {
    const session = createVoiceRecognitionSession();
    session.start();

    const result = await session.stop();