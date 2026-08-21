export const EMOJI_AVATAR_REGEX = /[\p{Extended_Pictographic}\p{Emoji_Presentation}]|[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}\u{1F004}\u{1F0CF}\u{1F170}-\u{1F19A}]/u;

export const containsEmojiOrAvatar = (val: string | null | undefined): boolean => {
  if (!val || typeof val !== 'string') return false;
  return EMOJI_AVATAR_REGEX.test(val);
};

export const validateNoEmojiOrAvatar = (val: string | null | undefined): boolean => {
  return !containsEmojiOrAvatar(val);
};

export const USERNAME_EMOJI_ERROR = 'Username cannot contain emoji, emoticons, or avatar symbols';
export const STAGE_NAME_EMOJI_ERROR = 'Stage name cannot contain emoji, emoticons, or avatar symbols';
