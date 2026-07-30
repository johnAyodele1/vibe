import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PrivateSext from '../components/AdultZone/PrivateSext';
import { server } from './mocks';
import { http, HttpResponse } from 'msw';

vi.mock('../contexts/AdultAuthContext', () => ({
  useAdultAuth: () => ({
    user: { id: 'user123', email: 'user@test.com', credits: 500, role: 'user' }
  })
}));

vi.mock('socket.io-client', () => {
  const mSocket = {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    connect: vi.fn()
  };
  return {
    io: vi.fn(() => mSocket),
    default: vi.fn(() => mSocket)
  };
});

describe('PrivateSext Auto Selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('adultAccessToken', 'mock-token');

    // Mock scrollIntoView for jsdom
    window.HTMLElement.prototype.scrollIntoView = vi.fn();

    // Use MSW with wildcards to handle requests cleanly across any origin
    server.use(
      http.get(`*/api/v1/adult/sext/conversations`, () => {
        return HttpResponse.json([
          {
            conversationId: 'conv_xyz',
            otherUser: {
              id: 'provider123',
              displayName: 'Sasha Lux',
              avatarUrl: 'https://test.com/sasha.jpg',
              isOnline: true,
              accountType: 'provider'
            },
            lastMessage: {
              content: 'Hello sweetie',
              mediaType: 'text',
              senderId: 'provider123',
              sentAt: new Date().toISOString()
            },
            unreadCount: 0,
            isMuted: false,
            isBlocked: false
          }
        ]);
      }),
      http.get(`*/api/v1/adult/sext/conversations/conv_xyz/messages`, () => {
        return HttpResponse.json([]);
      }),
      http.put(`*/api/v1/adult/sext/conversations/conv_xyz/read`, () => {
        return HttpResponse.json({ success: true });
      })
    );
  });

  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('automatically selects the conversation from the ?conversation= query parameter', async () => {
    window.history.replaceState({}, '', '/sext?conversation=conv_xyz');

    render(
      <MemoryRouter initialEntries={['/sext?conversation=conv_xyz']}>
        <PrivateSext />
      </MemoryRouter>
    );

    await waitFor(() => {
      const headers = screen.queryAllByTestId('conversation-header');
      expect(headers.length).toBeGreaterThan(0);
      const texts = screen.queryAllByText('Sasha Lux');
      expect(texts.length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });

  it('automatically selects the conversation from the pathname segment /sext/:conversationId', async () => {
    window.history.replaceState({}, '', '/sext/conv_xyz');

    render(
      <MemoryRouter initialEntries={['/sext/conv_xyz']}>
        <PrivateSext />
      </MemoryRouter>
    );

    await waitFor(() => {
      const headers = screen.queryAllByTestId('conversation-header');
      expect(headers.length).toBeGreaterThan(0);
      const texts = screen.queryAllByText('Sasha Lux');
      expect(texts.length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });
});
