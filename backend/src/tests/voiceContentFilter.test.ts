import { describe, expect, it } from '@jest/globals';
import { detectContactSharing } from '@yourapp/content-filter';

describe('Voice transcription content filtering', () => {
  it('does not flag ordinary spoken words', () => {
    expect(detectContactSharing('the beat is nice and the music sounds good').detected).toBe(false);
  });

  it('does not flag a short sequence of number words in ordinary speech', () => {
    expect(detectContactSharing('one two three things happened today').detected).toBe(false);
  });

  it('detects a spoken phone number with seven or more digit words', () => {
    const result = detectContactSharing('zero eight one two three four five six seven eight nine');
    expect(result.detected).toBe(true);
    expect(result.category).toBe('phone');
  });

  it('does not treat transcription failure or empty speech as contact sharing', () => {
    expect(detectContactSharing('').detected).toBe(false);
    expect(detectContactSharing('[music]').detected).toBe(false);
  });
});
