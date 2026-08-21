import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import ChatSafetyNotice, { getSafetyNoticeStorageKey } from '../components/AdultZone/ChatSafetyNotice';

const MEMBER_WARNING = "Beware of scams. Never send money directly to a provider. Always use the service on this site.";
const PROVIDER_WARNING = "Never share your contact information or take the conversation outside this site. Offenders will have their account deactivated immediately once detected.";

describe('ChatSafetyNotice', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  describe('Member Notice Behavior', () => {
    it('appears when entering a conversation with the correct member warning', () => {
      render(
        <ChatSafetyNotice userId="user-123" conversationId="conv-abc" role="member" />
      );

      const notice = screen.getByTestId('chat-safety-notice');
      expect(notice).toBeInTheDocument();
      expect(screen.getByText(MEMBER_WARNING)).toBeInTheDocument();
    });

    it('closing the notice hides it and persists dismissal for the same conversation on the same day', () => {
      const { unmount } = render(
        <ChatSafetyNotice userId="user-123" conversationId="conv-abc" role="member" />
      );

      expect(screen.getByTestId('chat-safety-notice')).toBeInTheDocument();

      const closeBtn = screen.getByTestId('dismiss-safety-notice-btn');
      fireEvent.click(closeBtn);

      expect(screen.queryByTestId('chat-safety-notice')).not.toBeInTheDocument();

      unmount();

      // Reopening the SAME conversation on the same day keeps it hidden
      render(
        <ChatSafetyNotice userId="user-123" conversationId="conv-abc" role="member" />
      );
      expect(screen.queryByTestId('chat-safety-notice')).not.toBeInTheDocument();
    });

    it('opening a DIFFERENT conversation on the same day shows the notice', () => {
      // Dismiss for conv-abc
      render(
        <ChatSafetyNotice userId="user-123" conversationId="conv-abc" role="member" />
      );
      fireEvent.click(screen.getByTestId('dismiss-safety-notice-btn'));
      cleanup();

      // Open conv-xyz for same user
      render(
        <ChatSafetyNotice userId="user-123" conversationId="conv-xyz" role="member" />
      );
      expect(screen.getByTestId('chat-safety-notice')).toBeInTheDocument();
      expect(screen.getByText(MEMBER_WARNING)).toBeInTheDocument();
    });

    it('shows the notice again on the NEXT calendar day', () => {
      vi.useFakeTimers();
      const initialDate = new Date('2026-08-21T10:00:00Z');
      vi.setSystemTime(initialDate);

      const { unmount } = render(
        <ChatSafetyNotice userId="user-123" conversationId="conv-abc" role="member" />
      );

      expect(screen.getByTestId('chat-safety-notice')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('dismiss-safety-notice-btn'));
      expect(screen.queryByTestId('chat-safety-notice')).not.toBeInTheDocument();

      unmount();

      // Advance clock to next calendar day
      const nextDay = new Date('2026-08-22T10:00:00Z');
      vi.setSystemTime(nextDay);

      // Re-enter conversation on next calendar day
      render(
        <ChatSafetyNotice userId="user-123" conversationId="conv-abc" role="member" />
      );

      expect(screen.getByTestId('chat-safety-notice')).toBeInTheDocument();
      expect(screen.getByText(MEMBER_WARNING)).toBeInTheDocument();

      vi.useRealTimers();
    });
  });

  describe('Provider Notice Behavior', () => {
    it('appears when entering a conversation with the correct provider warning', () => {
      render(
        <ChatSafetyNotice userId="provider-456" conversationId="conv-123" role="provider" />
      );

      expect(screen.getByTestId('chat-safety-notice')).toBeInTheDocument();
      expect(screen.getByText(PROVIDER_WARNING)).toBeInTheDocument();
    });

    it('closing the notice hides it and keeps it hidden for that conversation on the same day', () => {
      const { unmount } = render(
        <ChatSafetyNotice userId="provider-456" conversationId="conv-123" role="provider" />
      );

      fireEvent.click(screen.getByTestId('dismiss-safety-notice-btn'));
      expect(screen.queryByTestId('chat-safety-notice')).not.toBeInTheDocument();

      unmount();

      render(
        <ChatSafetyNotice userId="provider-456" conversationId="conv-123" role="provider" />
      );
      expect(screen.queryByTestId('chat-safety-notice')).not.toBeInTheDocument();
    });

    it('shows notice for a different member conversation for the same provider', () => {
      render(
        <ChatSafetyNotice userId="provider-456" conversationId="conv-123" role="provider" />
      );
      fireEvent.click(screen.getByTestId('dismiss-safety-notice-btn'));
      cleanup();

      render(
        <ChatSafetyNotice userId="provider-456" conversationId="conv-456" role="provider" />
      );
      expect(screen.getByTestId('chat-safety-notice')).toBeInTheDocument();
      expect(screen.getByText(PROVIDER_WARNING)).toBeInTheDocument();
    });
  });

  describe('Storage Resilience & Malformed Data Handling', () => {
    it('handles malformed localStorage data gracefully without throwing error or breaking UI', () => {
      const key = getSafetyNoticeStorageKey('user-123', 'conv-abc');
      localStorage.setItem(key, '{ invalid json structure !!! ');

      expect(() => {
        render(
          <ChatSafetyNotice userId="user-123" conversationId="conv-abc" role="member" />
        );
      }).not.toThrow();

      // Since stored string is not valid YYYY-MM-DD date string matching today, notice shows safely
      expect(screen.getByTestId('chat-safety-notice')).toBeInTheDocument();
    });

    it('handles localStorage getItem exception gracefully', () => {
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError: localStorage blocked');
      });

      expect(() => {
        render(
          <ChatSafetyNotice userId="user-123" conversationId="conv-abc" role="member" />
        );
      }).not.toThrow();

      expect(screen.getByTestId('chat-safety-notice')).toBeInTheDocument();
      getItemSpy.mockRestore();
    });
  });
});
