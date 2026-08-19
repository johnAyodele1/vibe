import { render, screen } from '@testing-library/react';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import PrivateSext from '../components/AdultZone/PrivateSext';
import { AdultAuthProvider } from '../contexts/AdultAuthContext';

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

    vi.spyOn(global, 'fetch').mockImplementation((url) => {
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
          <PrivateSext />
        </AdultAuthProvider>
      </BrowserRouter>
    );

    expect(await screen.findAllByText('Official Notifications')).not.toHaveLength(0);
    expect(await screen.findAllByText('Official Customer Support')).not.toHaveLength(0);
  });
});
