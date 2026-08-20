import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, beforeEach, afterEach, it, expect } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import PrivateSext from '../components/AdultZone/PrivateSext';
import ProviderMessages from '../components/AdultZone/ProviderMessages';
import { AdultAuthProvider } from '../contexts/AdultAuthContext';
import { AdultCallProvider } from '../components/AdultZone/AdultCallContext';

vi.mock('../components/AdultZone/Avatar', () => ({
  Avatar: ({ name }: { name: string }) => <div data-testid="avatar">{name}</div>,
}));

vi.mock('../../hooks/useContentFilter', () => ({
  useContentFilter: () => ({
    filterWarning: { show: false, category: 'none', message: '' },
    checkContent: () => {},
    dismissWarning: () => {},
    setFilterWarning: () => {},
  }),
}));

vi.mock('socket.io-client', () => ({
  io: () => ({
    on: () => {},
    off: () => {},
    emit: () => {},
    disconnect: () => {},
    close: () => {},
  }),
  default: () => ({
    on: () => {},
    off: () => {},
    emit: () => {},
    disconnect: () => {},
    close: () => {},
  }),
}));

describe('Official Channels UI Verification', () => {
  beforeEach(() => {
    localStorage.setItem('adultAccessToken', 'mockToken');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders official channels with official badge in conversation list', async () => {
    const mockConversations = [
      {
        conversationId: 'official_notifications',
        isOfficial: true,
        type: 'official_notification',
        position: 0,
        otherUser: {
          id: 'official_notifications',
          displayName: 'Official Notifications',
          avatarUrl: '/icons/icon-192x192.png',
          isOnline: true,
          accountType: 'official',
          isOfficial: true,
        },
        lastMessage: { content: 'Welcome to Vibe!', mediaType: 'official_notification', sentAt: new Date().toISOString() },
        unreadCount: 1,
        isMuted: false,
        isBlocked: false,
      },
      {
        conversationId: 'support_user1',
        isOfficial: true,
        type: 'support',
        position: 1,
        otherUser: {
          id: 'official_support',
          displayName: 'Official Customer Support',
          avatarUrl: '/icons/icon-192x192.png',
          isOnline: true,
          accountType: 'official',
          isOfficial: true,
        },
        lastMessage: { content: 'Thanks for contacting support', mediaType: 'text', sentAt: new Date().toISOString() },
        unreadCount: 0,
        isMuted: false,
        isBlocked: false,
      },
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation((url: RequestInfo | URL) => {
      if (url.toString().includes('/v1/adult/auth/me') || url.toString().includes('/auth/me')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            user: { _id: 'user1', username: 'testuser', displayName: 'Test User', role: 'member', credits: 500, isAgeVerified: true }
          }),
        } as Response);
      }
      if (url.toString().includes('/v1/adult/sext/conversations')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockConversations,
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);
    });

    render(
      <BrowserRouter>
        <AdultAuthProvider>
          <AdultCallProvider>
            <PrivateSext />
          </AdultCallProvider>
        </AdultAuthProvider>
      </BrowserRouter>
    );

    expect(await screen.findAllByText('Official Notifications')).not.toHaveLength(0);
    expect(await screen.findAllByText('Official Customer Support')).not.toHaveLength(0);
  });

  it('renders read-only notice banner for official notifications and hides compose controls', async () => {
    const mockConversations = [
      {
        conversationId: 'official_notifications',
        isOfficial: true,
        type: 'official_notification',
        position: 0,
        otherUser: {
          id: 'official_notifications',
          displayName: 'Official Notifications',
          avatarUrl: '/icons/icon-192x192.png',
          isOnline: true,
          accountType: 'official',
          isOfficial: true,
        },
        lastMessage: { content: 'Welcome to Vibe!', mediaType: 'official_notification', sentAt: new Date().toISOString() },
        unreadCount: 0,
        isMuted: false,
        isBlocked: false,
      },
    ];

    const mockNotificationMessages = [
      {
        id: 'notif_1',
        conversationId: 'official_notifications',
        senderId: 'official_notifications',
        receiverId: 'user1',
        content: 'System Update\n\nVersion 5 is now live.',
        mediaType: 'official_notification',
        createdAt: new Date().toISOString(),
        title: 'System Update'
      }
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation((url: RequestInfo | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes('/v1/adult/auth/me') || urlStr.includes('/auth/me')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            user: { _id: 'user1', username: 'testuser', displayName: 'Test User', role: 'member', credits: 500, isAgeVerified: true }
          }),
        } as Response);
      }
      if (urlStr.includes('/v1/adult/sext/conversations/official_notifications/messages')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockNotificationMessages,
        } as Response);
      }
      if (urlStr.includes('/v1/adult/sext/conversations')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockConversations,
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);
    });

    render(
      <BrowserRouter>
        <AdultAuthProvider>
          <AdultCallProvider>
            <PrivateSext />
          </AdultCallProvider>
        </AdultAuthProvider>
      </BrowserRouter>
    );

    const notifItems = await screen.findAllByText('Official Notifications');
    fireEvent.click(notifItems[0]);

    expect(await screen.findByText('📢 Only admins can send messages to this channel.')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-text-input')).not.toBeInTheDocument();
    expect(screen.queryByText('🎁 Send Gift')).not.toBeInTheDocument();
  });

  it('renders official channel badge with correct blue or gold style based on officialBadge setting', async () => {
    const mockConversations = [
      {
        conversationId: 'official_notifications',
        isOfficial: true,
        type: 'official_notification',
        position: 0,
        otherUser: {
          id: 'official_notifications',
          displayName: 'Official Notifications',
          avatarUrl: '/icons/icon-192x192.png',
          isOnline: true,
          accountType: 'official',
          isOfficial: true,
          officialBadge: 'gold',
        },
        lastMessage: { content: 'Gold Badge Announcement', mediaType: 'official_notification', sentAt: new Date().toISOString() },
        unreadCount: 0,
        isMuted: false,
        isBlocked: false,
      },
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation((url: RequestInfo | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes('/v1/adult/auth/me') || urlStr.includes('/auth/me')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            user: { _id: 'user1', username: 'testuser', displayName: 'Test User', role: 'member', credits: 500, isAgeVerified: true }
          }),
        } as Response);
      }
      if (urlStr.includes('/v1/adult/sext/conversations')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockConversations,
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);
    });

    render(
      <BrowserRouter>
        <AdultAuthProvider>
          <AdultCallProvider>
            <PrivateSext />
          </AdultCallProvider>
        </AdultAuthProvider>
      </BrowserRouter>
    );

    const badgeSvg = await screen.findByTitle('Official Gold Channel');
    expect(badgeSvg).toBeInTheDocument();
  });

  it('renders read-only notice banner in provider chat for official notifications and hides provider quick actions', async () => {
    const mockConversations = [
      {
        conversationId: 'official_notifications',
        isOfficial: true,
        type: 'official_notification',
        position: 0,
        otherUser: {
          id: 'official_notifications',
          displayName: 'Official Notifications',
          avatarUrl: '/icons/icon-192x192.png',
          isOnline: true,
          accountType: 'official',
          isOfficial: true,
        },
        lastMessage: { content: 'Welcome to Vibe!', mediaType: 'official_notification', sentAt: new Date().toISOString() },
        unreadCount: 0,
        isMuted: false,
        isBlocked: false,
      },
    ];

    const mockNotificationMessages = [
      {
        id: 'notif_1',
        conversationId: 'official_notifications',
        senderId: 'official_notifications',
        receiverId: 'provider1',
        content: 'Platform Update\n\nNew provider payout rates are now active.',
        mediaType: 'official_notification',
        createdAt: new Date().toISOString(),
        title: 'Platform Update'
      }
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation((url: RequestInfo | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes('/v1/adult/auth/me') || urlStr.includes('/auth/me')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            user: { _id: 'provider1', username: 'lucia', displayName: 'Lucia', role: 'provider', credits: 500, isAgeVerified: true }
          }),
        } as Response);
      }
      if (urlStr.includes('/v1/adult/sext/conversations/official_notifications/messages')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockNotificationMessages,
        } as Response);
      }
      if (urlStr.includes('/v1/adult/sext/conversations')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockConversations,
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);
    });

    render(
      <BrowserRouter>
        <AdultAuthProvider>
          <AdultCallProvider>
            <ProviderMessages />
          </AdultCallProvider>
        </AdultAuthProvider>
      </BrowserRouter>
    );

    const notifItems = await screen.findAllByText('Official Notifications');
    fireEvent.click(notifItems[0]);

    expect(await screen.findByText('📢 Only admins can send messages to this channel.')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-text-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('send-paid-media-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('gift-request-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('service-request-btn')).not.toBeInTheDocument();
  });
});
