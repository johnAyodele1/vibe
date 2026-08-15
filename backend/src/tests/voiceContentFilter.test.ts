import { describe, expect, it } from '@jest/globals';
import { detectContactSharing } from '@yourapp/content-filter';

describe('Content filtering behavior', () => {
  it('does not flag ordinary text words', () => {
    expect(detectContactSharing('the beat is nice and the music sounds good').detected).toBe(false);
  });

  it('does not flag a short sequence of number words in ordinary text', () => {
    expect(detectContactSharing('one two three things happened today').detected).toBe(false);
  });

  it('detects a phone number with seven or more digit words in text', () => {
    const result = detectContactSharing('zero eight one two three four five six seven eight nine');
    expect(result.detected).toBe(true);
    expect(result.category).toBe('phone');
  });

  it('does not flag empty string or default voice note placeholder', () => {
    expect(detectContactSharing('').detected).toBe(false);
    expect(detectContactSharing('[Voice Note]').detected).toBe(false);
  });
});
