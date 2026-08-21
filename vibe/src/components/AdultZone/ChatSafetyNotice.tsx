import React, { useState, useEffect } from 'react';

const getTodayDateString = (): string => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getSafetyNoticeStorageKey = (userId: string | undefined, conversationId: string | undefined): string => {
  return `zippo:chat-safety-notice:${userId || 'anonymous'}:${conversationId || 'unknown'}`;
};

export const useChatSafetyNotice = (userId: string | undefined, conversationId: string | undefined) => {
  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    if (!userId || !conversationId) return true;
    try {
      const key = getSafetyNoticeStorageKey(userId, conversationId);
      const storedDate = localStorage.getItem(key);
      const todayDate = getTodayDateString();
      return storedDate === todayDate;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!userId || !conversationId) {
      setIsDismissed(true);
      return;
    }
    try {
      const key = getSafetyNoticeStorageKey(userId, conversationId);
      const storedDate = localStorage.getItem(key);
      const todayDate = getTodayDateString();
      setIsDismissed(storedDate === todayDate);
    } catch {
      setIsDismissed(false);
    }
  }, [userId, conversationId]);

  const dismiss = () => {
    if (!userId || !conversationId) return;
    try {
      const key = getSafetyNoticeStorageKey(userId, conversationId);
      const todayDate = getTodayDateString();
      localStorage.setItem(key, todayDate);
      setIsDismissed(true);
    } catch {
      setIsDismissed(true);
    }
  };

  return { isDismissed, dismiss };
};

interface ChatSafetyNoticeProps {
  userId: string | undefined;
  conversationId: string | undefined;
  role: 'member' | 'provider';
}

export const ChatSafetyNotice: React.FC<ChatSafetyNoticeProps> = ({ userId, conversationId, role }) => {
  const { isDismissed, dismiss } = useChatSafetyNotice(userId, conversationId);

  if (isDismissed || !userId || !conversationId) {
    return null;
  }

  const memberText = "Beware of scams. Never send money directly to a provider. Always use the service on this site.";
  const providerText = "Never share your contact information or take the conversation outside this site. Offenders will have their account deactivated immediately once detected.";

  const messageText = role === 'provider' ? providerText : memberText;

  return (
    <div
      data-testid="chat-safety-notice"
      className="chat-safety-notice bg-[#150a12] border-b border-pink-500/20 px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-[var(--az-text-secondary,#d1c4cd)] leading-tight shadow-inner flex-shrink-0"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-pink-400 font-bold flex-shrink-0 text-sm">🛡️</span>
        <span className="truncate sm:whitespace-normal font-sans font-medium text-[11px] sm:text-xs">
          {messageText}
        </span>
      </div>
      <button
        type="button"
        onClick={dismiss}
        data-testid="dismiss-safety-notice-btn"
        className="chat-safety-notice__close text-gray-400 hover:text-white text-base leading-none p-1 rounded-full hover:bg-white/10 transition-colors flex-shrink-0"
        aria-label="Dismiss safety notice"
        title="Dismiss safety notice"
      >
        ✕
      </button>
    </div>
  );
};

export default ChatSafetyNotice;
