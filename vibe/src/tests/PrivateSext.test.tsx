import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PrivateSext from '../components/AdultZone/PrivateSext';
import { AdultCallProvider } from '../components/AdultZone/AdultCallContext';
import { server } from './mocks';
import { http, HttpResponse } from 'msw';

vi.mock('../contexts/AdultAuthContext', () => ({
  useAdultAuth: () => ({
    user: { id: 'user123', email: 'user@test.com', credits: 500, role: 'user' },
    isAuthenticated: true
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

// Mock lottie-react to prevent HTMLCanvasElement.getContext() errors in JSDOM
vi.mock('lottie-react', () => {
  return {
    default: () => <div data-testid="mocked-lottie">Mocked Lottie</div>
  };
});

describe('PrivateSext Frontend Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('adultAccessToken', 'mock-token');

    // Mock scrollIntoView for jsdom
    window.HTMLElement.prototype.scrollIntoView = vi.fn();

    // Setup base MSW handlers
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

  it('renders standard empty state correctly', async () => {
    render(
      <MemoryRouter>
        <AdultCallProvider>
          <PrivateSext />
        </AdultCallProvider>
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText(/Private Inbox/i)).toBeInTheDocument();
      expect(screen.getByText(/Choose an ongoing conversation from the sidebar/i)).toBeInTheDocument();
    });
  });

  it('handles service tonight request validation errors and displays the error popup', async () => {
    // Add custom post handler for request-service
    server.use(
      http.post(`*/api/v1/adult/sext/conversations/conv_xyz/request-service`, () => {
        return HttpResponse.json({
          success: false,
          error: 'NO_TONIGHT_RATE',
          message: 'Provider has not configured a tonight rate.'
        }, { status: 400 });
      })
    );

    render(
      <MemoryRouter>
        <AdultCallProvider>
          <PrivateSext />
        </AdultCallProvider>
      </MemoryRouter>
    );

    // Select the conversation
    await waitFor(() => {
      expect(screen.getByText('Sasha Lux')).toBeInTheDocument();
    });

    const convRow = screen.getByText('Sasha Lux');
    fireEvent.click(convRow);

    // Open tonight service request modal
    await waitFor(() => {
      expect(screen.getByText('🌙 Request Service')).toBeInTheDocument();
    });

    const requestTonightBtn = screen.getByText('🌙 Request Service');
    fireEvent.click(requestTonightBtn);

    expect(screen.getByText('Request a Tonight Service')).toBeInTheDocument();

    // Submit request and expect error overlay to pop up
    const submitBtn = screen.getByRole('button', { name: 'Send Service Request' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByTestId('service-error-overlay')).toBeInTheDocument();
      expect(screen.getByTestId('service-error-title')).toHaveTextContent('No Tonight Rate Set');
      expect(screen.getByTestId('service-error-message')).toHaveTextContent('The provider has not set their tonight arrangement rate yet.');
      expect(screen.getByRole('link', { name: /Go to Settings/i })).toBeInTheDocument();
    });

    // Dismiss popup
    const gotItBtn = screen.getByRole('button', { name: 'Got it' });
    fireEvent.click(gotItBtn);

    expect(screen.queryByTestId('service-error-overlay')).not.toBeInTheDocument();
  });

  it('sends gift with optimistic UI, closes modal immediately, reconciles on success, and rolls back on API error', async () => {
    server.use(
      http.get('*/api/v1/adult/gifts/catalogue', () => {
        return HttpResponse.json([
          { _id: 'gift-rose', name: 'Red Rose', iconUrl: 'rose', creditCost: 10, category: 'romantic', isActive: true }
        ]);
      }),
      http.post('*/api/v1/adult/sext/conversations/conv_xyz/send-gift', () => {
        return HttpResponse.json({
          message: {
            _id: 'msg-gift-1',
            conversationId: 'conv_xyz',
            senderId: 'user123',
            receiverId: 'provider123',
            content: 'Sent you a Red Rose',
            gift: { giftId: 'gift-rose', giftName: 'Red Rose', giftIconUrl: 'rose', giftValue: 10, message: 'For you!' },
            createdAt: new Date().toISOString()
          }
        });
      })
    );

    render(
      <MemoryRouter>
        <AdultCallProvider>
          <PrivateSext />
        </AdultCallProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Sasha Lux')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Sasha Lux'));

    await waitFor(() => {
      expect(screen.getByText('🎁 Send Gift')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('🎁 Send Gift'));

    await waitFor(() => {
      expect(screen.getByText('Red Rose')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Red Rose'));
    fireEvent.change(screen.getByPlaceholderText('Optional romantic/spicy message...'), { target: { value: 'For you!' } });

    const confirmBtn = screen.getByRole('button', { name: /Confirm Send/i });
    fireEvent.click(confirmBtn);

    // Optimistic UI: Modal should close immediately!
    expect(screen.queryByText('Send a Gift', { selector: 'h3' })).not.toBeInTheDocument();

    // Optimistic UI: Gift card should appear in chat feed immediately!
    expect(screen.getByTestId('message-gift-card')).toBeInTheDocument();
    expect(screen.getByText('Red Rose')).toBeInTheDocument();

    // Eventually reconciles cleanly
    await waitFor(() => {
      expect(screen.getByTestId('message-gift-card')).toBeInTheDocument();
    });
  });

  it('sends photo request with optimistic UI, closes modal immediately, reconciles on success, and rolls back on API error', async () => {
    server.use(
      http.post('*/api/v1/adult/sext/conversations/conv_xyz/request-photo', () => {
        return HttpResponse.json({
          id: 'msg-photo-req-1',
          conversationId: 'conv_xyz',
          senderId: 'user123',
          receiverId: 'provider123',
          content: 'Requested a photo',
          mediaType: 'request_photo',
          photoRequest: { status: 'pending', note: 'Hot selfie please' },
          createdAt: new Date().toISOString()
        });
      })
    );

    render(
      <MemoryRouter>
        <AdultCallProvider>
          <PrivateSext />
        </AdultCallProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Sasha Lux')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Sasha Lux'));

    await waitFor(() => {
      expect(screen.getByText('📸 Request Photo')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('📸 Request Photo'));

    expect(screen.getByText('Request a Photo', { selector: 'h3' })).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Can I get a hot selfie/i), { target: { value: 'Hot selfie please' } });

    fireEvent.click(screen.getByRole('button', { name: 'Send Photo Request' }));

    // Optimistic UI: Modal closes immediately!
    expect(screen.queryByText('Request a Photo', { selector: 'h3' })).not.toBeInTheDocument();

    // Optimistic UI: Photo request card appears immediately!
    expect(screen.getByTestId('message-photo-request')).toBeInTheDocument();
    expect(screen.getByText('"Hot selfie please"')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('message-photo-request')).toBeInTheDocument();
    });
  });

  it('prevents rendering socket messages from conversation B when open in conversation A (conversation isolation)', async () => {
    let socketNewMessageCallback: any = null;
    const mockSocket = {
      on: vi.fn((event, cb) => {
        if (event === 'sext:new_message') {
          socketNewMessageCallback = cb;
        }
      }),
      off: vi.fn(),
      emit: vi.fn(),
      disconnect: vi.fn(),
      connect: vi.fn()
    };

    const { io } = await import('socket.io-client');
    vi.mocked(io).mockReturnValue(mockSocket as any);

    server.use(
      http.get('*/api/v1/adult/sext/conversations', () => {
        return HttpResponse.json([
          {
            conversationId: 'conv_A',
            otherUser: { id: 'providerA', displayName: 'Sasha Lux', avatarUrl: '', isOnline: true, accountType: 'provider' },
            lastMessage: { content: 'Hi', mediaType: 'text', senderId: 'providerA', sentAt: new Date().toISOString() },
            unreadCount: 0
          },
          {
            conversationId: 'conv_B',
            otherUser: { id: 'providerB', displayName: 'Amber Rose', avatarUrl: '', isOnline: true, accountType: 'provider' },
            lastMessage: { content: 'Hey', mediaType: 'text', senderId: 'providerB', sentAt: new Date().toISOString() },
            unreadCount: 0
          }
        ]);
      }),
      http.get('*/api/v1/adult/sext/conversations/conv_A/messages', () => HttpResponse.json([])),
      http.get('*/api/v1/adult/sext/conversations/conv_B/messages', () => HttpResponse.json([]))
    );

    render(
      <MemoryRouter>
        <AdultCallProvider>
          <PrivateSext />
        </AdultCallProvider>
      </MemoryRouter>
    );

    // Open conversation A
    await waitFor(() => {
      expect(screen.getByText('Sasha Lux')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Sasha Lux'));

    await waitFor(() => {
      expect(screen.getByTestId('chat-input-bar')).toBeInTheDocument();
    });

    // Simulate incoming socket message for conversation B
    if (socketNewMessageCallback) {
      socketNewMessageCallback({
        message: {
          id: 'msg-convB-card',
          conversationId: 'conv_B',
          senderId: 'providerB',
          receiverId: 'user123',
          content: 'Requested a gift: Rose',
          mediaType: 'gift_request',
          giftRequest: { giftId: 'g1', giftName: 'Red Rose', giftValue: 10, status: 'pending' },
          createdAt: new Date().toISOString()
        }
      });
    }

    // Expected: Card for conv_B MUST NOT be rendered in conv_A
    expect(screen.queryByTestId('gift-request-message')).not.toBeInTheDocument();
  });
});
