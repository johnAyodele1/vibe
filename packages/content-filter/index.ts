import {
  PHONE_PATTERNS,
  SPOKEN_PHONE_PATTERN,
  EMAIL_PATTERNS,
  PLATFORM_PATTERNS,
  SEPARATED_PLATFORM_PATTERNS,
  OFFPLATFORM_PHRASES
} from './patterns';

export type FilterResult = {
  detected: boolean;
  category: 'phone' | 'platform' | 'email' | 'offplatform' | null;
  matchedText: string | null;
};

export const detectContactSharing = (text: string): FilterResult => {
  if (!text) {
    return { detected: false, category: null, matchedText: null };
  }

  // Normalise the text for detection
  // Replace common lookalike characters
  const normalised = text
    .toLowerCase()
    .replace(/0/g, 'o')      // zero → o
    .replace(/1/g, 'i')      // one → i
    .replace(/3/g, 'e')      // three → e
    .replace(/4/g, 'a')      // four → a
    .replace(/5/g, 's')      // five → s
    .replace(/\$/g, 's')     // $ → s
    .replace(/\|/g, 'i')     // | → i
    .replace(/\\/g, 'i');    // \ → i

  // Check phone number patterns on ORIGINAL text
  for (const pattern of PHONE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return { detected: true, category: 'phone', matchedText: match[0] };
    }
  }

  // Spoken phone numbers need their own stricter rule. Do not treat individual
  // number words ("one", "two", "six", etc.) as contact information because
  // those are normal words in speech and are especially common in transcripts.
  const spokenPhoneMatch = text.match(SPOKEN_PHONE_PATTERN);
  if (spokenPhoneMatch) {
    return { detected: true, category: 'phone', matchedText: spokenPhoneMatch[0] };
  }

  // Check email patterns on BOTH original and normalised
  for (const pattern of EMAIL_PATTERNS) {
    const match = text.match(pattern) || normalised.match(pattern);
    if (match) {
      return { detected: true, category: 'email', matchedText: match[0] };
    }
  }

  // Check platform patterns on BOTH original and normalised
  for (const pattern of [...PLATFORM_PATTERNS, ...SEPARATED_PLATFORM_PATTERNS]) {
    const match = text.match(pattern) || normalised.match(pattern);
    if (match) {
      return { detected: true, category: 'platform', matchedText: match[0] };
    }
  }

  // Check off-platform phrases on BOTH original and normalised
  for (const pattern of OFFPLATFORM_PHRASES) {
    const match = text.match(pattern) || normalised.match(pattern);
    if (match) {
      return { detected: true, category: 'offplatform', matchedText: match[0] };
    }
  }

  return { detected: false, category: null, matchedText: null };
};
