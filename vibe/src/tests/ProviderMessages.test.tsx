import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProviderMessages from '../components/AdultZone/ProviderMessages';
import { server } from './mocks';
import { http, HttpResponse } from 'msw';

// Mock react-router-dom useParams, useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ conversationId: undefined }),
    useNavigate: () => mockNavigate,
  };
});

// Mock Socket.io-client
vi.mock('socket.io-client', () => {
  const mockSocket = {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
  };
  return {
    io: () => mockSocket,
  };
});

// Mock useAdultAuth context hook
vi.mock('../contexts/AdultAuthContext', () => ({
  useAdultAuth: () => ({
    user: {
      id: 'provider-123',
      _id: 'provider-123',
      email: 'lucia@test.com',
      username: 'lucia',
      displayName: 'Lucia Star',
      role: 'provider',
      credits: 1000,
      providerProfile: { tonightRate: 150 }
    },
    isAuthenticated: true,
  }),
}));

describe('ProviderMessages Frontend Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('adultAccessToken', 'mock-token');

    // Register MSW Handlers for Provider Messages
    server.use(
      http.get('**/v1/adult/sext/conversations', () => {
        return HttpResponse.json([
          {
            conversationId: 'conv-123',
            otherUser: {
              id: 'member-456',
              displayName: 'BigSpender',
              avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=150',
              isOnline: true,
              accountType: 'member'
            },
            lastMessage: {
              content: 'Hey Lucia, are you active tonight?',
              mediaType: 'text',
              senderId: 'member-456',
              sentAt: new Date().toISOString()
            },
            unreadCount: 1,
            isMuted: false,
            isBlocked: false
          }
        ]);
      }),

      http.get('**/v1/adult/sext/conversations/conv-123/messages', () => {
        return HttpResponse.json([
          {
            id: 'msg-1',
            senderId: 'member-456',
            receiverId: 'provider-123',
            content: 'Hey Lucia, are you active tonight?',
            mediaType: 'text',
            creditCost: 0,
            isUnlocked: true,
            createdAt: new Date().toISOString()
          },
          {
            id: 'msg-photo-req',
            senderId: 'member-456',
            receiverId: 'provider-123',
            content: 'Requested a photo',
            mediaType: 'request_photo',
            creditCost: 0,
            isUnlocked: true,
            photoRequest: {
              status: 'pending',
              note: 'Show me that hot outfit!'
            },
            createdAt: new Date().toISOString()
          }
        ]);
      }),

      http.put('**/v1/adult/sext/conversations/conv-123/read', () => {
        return HttpResponse.json({ success: true });
      }),

      http.get('**/v1/adult/gifts/catalogue', () => {
        return HttpResponse.json([
          { _id: 'gift-rose', name: 'Red Rose', iconUrl: 'rose', creditCost: 10, category: 'romantic', isActive: true },
          { _id: 'gift-balloon', name: 'Balloon', iconUrl: 'balloon', creditCost: 20, category: 'fun', isActive: true }
        ]);
      }),

      http.post('**/v1/adult/sext/conversations/conv-123/gift-request', () => {
        return HttpResponse.json({
          id: 'msg-gift-req-created',
          senderId: 'provider-123',
          receiverId: 'member-456',
          content: 'You requested a Red Rose',
          mediaType: 'gift_request',
          giftRequest: {
            giftId: 'gift-rose',
            giftName: 'Red Rose',
            giftIconUrl: 'rose',
            giftValue: 10,
            message: 'A nice rose!',
            status: 'pending'
          },
          createdAt: new Date().toISOString()
        });
      }),

      http.post('**/v1/adult/sext/conversations/conv-123/service-request', () => {
        return HttpResponse.json({
          id: 'msg-service-req-created',
          senderId: 'provider-123',
          receiverId: 'member-456',
          content: 'Service Request',
          mediaType: 'service_request',
          serviceRequest: {
            baseRate: 150,
            extras: [{ label: 'Transportation', amount: 50 }],
            totalAmount: 200,
            note: 'Tonight arrangement',
            status: 'pending',
            eligibleForPayout: false
          },
          createdAt: new Date().toISOString()
        });
      })
    );
  });

  it('mirrors member chat layout exactly and hides call buttons in header', async () => {
    render(<ProviderMessages />);

    // Wait for the conversation to load
    await waitFor(() => {
      expect(screen.getByText('BigSpender')).toBeInTheDocument();
    });

    // Tap on the conversation to select it
    fireEvent.click(screen.getByText('BigSpender'));

    // Should load the message feed and show conversation header details
    await waitFor(() => {
      expect(screen.getByTestId('conversation-header')).toBeInTheDocument();
    });

    // Check header actions: [💎 Send Paid Media] should be present, call buttons must NOT be present
    expect(screen.getByTestId('send-paid-media-btn')).toBeInTheDocument();
    expect(screen.queryByTitle('Audio Call')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Video Call')).not.toBeInTheDocument();
  });

  it('shows the three provider quick actions always visible below the input bar', async () => {
    render(<ProviderMessages />);

    await waitFor(() => {
      expect(screen.getByText('BigSpender')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('BigSpender'));

    await waitFor(() => {
      expect(screen.getByTestId('chat-input-bar')).toBeInTheDocument();
    });

    expect(screen.getByTestId('gift-request-btn')).toBeInTheDocument();
    expect(screen.getByText('SEND PAID MEDIA', { selector: '.provider-quick-action-btn--media' })).toBeInTheDocument();
    expect(screen.getByTestId('service-request-btn')).toBeInTheDocument();
  });

  it('opens Send Paid Media Dialog, allows selection, cost input, displays USD estimation, and triggers submit', async () => {
    render(<ProviderMessages />);

    await waitFor(() => {
      expect(screen.getByText('BigSpender')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('BigSpender'));

    await waitFor(() => {
      expect(screen.getByTestId('send-paid-media-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('send-paid-media-btn'));

    // Modal dialog should open
    expect(screen.getByTestId('send-paid-media-dialog')).toBeInTheDocument();
    expect(screen.getByText('Send Paid Media', { selector: 'h3' })).toBeInTheDocument();

    const priceInput = screen.getByTestId('send-paid-media-price-input');
    fireEvent.change(priceInput, { target: { value: '100' } });

    // Helper USD estimation text should display ≈ $10
    expect(screen.getByText(/≈ \$10 USD value/)).toBeInTheDocument();
  });

  it('opens Gift Request Dialog, loads catalogue, allows selection, personal note, and sends request', async () => {
    render(<ProviderMessages />);

    await waitFor(() => {
      expect(screen.getByText('BigSpender')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('BigSpender'));

    await waitFor(() => {
      expect(screen.getByTestId('gift-request-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('gift-request-btn'));

    // Modal dialog should open
    await waitFor(() => {
      expect(screen.getByTestId('gift-request-dialog')).toBeInTheDocument();
      expect(screen.getByText('Request a Gift')).toBeInTheDocument();
    });

    // Check catalog items loaded
    await waitFor(() => {
      expect(screen.getByText('Red Rose')).toBeInTheDocument();
      expect(screen.getByText('Balloon')).toBeInTheDocument();
    });

    // Select Red Rose
    fireEvent.click(screen.getByText('Red Rose'));

    // Personal Note input should display
    expect(screen.getByPlaceholderText('Add a personal note...')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Add a personal note...'), { target: { value: 'A nice rose!' } });

    // Send Gift Request
    fireEvent.click(screen.getByTestId('gift-request-send-btn'));

    // Should create a gift request message bubble in feed
    await waitFor(() => {
      expect(screen.getByTestId('gift-request-message')).toBeInTheDocument();
      expect(screen.getByText('You requested a Red Rose')).toBeInTheDocument();
    });
  });

  it('opens Service Request Dialog, pre-fills tonightRate and is readonly, adds extra charges, totals update live, and sends request', async () => {
    render(<ProviderMessages />);

    await waitFor(() => {
      expect(screen.getByText('BigSpender')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('BigSpender'));

    await waitFor(() => {
      expect(screen.getByTestId('service-request-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('service-request-btn'));

    // Dialog should open
    expect(screen.getByTestId('service-request-dialog')).toBeInTheDocument();
    expect(screen.getByText('Send Service Request', { selector: 'h3' })).toBeInTheDocument();

    // Base rate tonightRate should be pre-filled as 150
    expect(screen.getByText(/Your tonight rate/)).toBeInTheDocument();

    // Add extra charge row
    fireEvent.click(screen.getByTestId('service-request-add-extra'));

    // Fill extra charge description and amount
    const descInput = screen.getByPlaceholderText('Description (e.g. Hotel, Transport)');
    fireEvent.change(descInput, { target: { value: 'Transportation' } });

    const amountInput = screen.getByPlaceholderText('Credits');
    fireEvent.change(amountInput, { target: { value: '50' } });

    // Total should update live from 150 -> 200 credits
    expect(screen.getByTestId('service-request-total')).toHaveTextContent('💎 200 credits');

    // Submit
    fireEvent.click(screen.getByTestId('service-request-submit'));

    // Message bubble should display in chat
    await waitFor(() => {
      expect(screen.getByTestId('service-request-message')).toBeInTheDocument();
      expect(screen.getByTestId('service-request-status')).toHaveTextContent('⏳ Awaiting payment');
    });
  });

  it('receives actionable photo requests and displays Accept, Send Free, and Decline buttons', async () => {
    render(<ProviderMessages />);

    await waitFor(() => {
      expect(screen.getByText('BigSpender')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('BigSpender'));

    // Message feed should contain the photo request bubble with action triggers
    await waitFor(() => {
      expect(screen.getByTestId('message-photo-request')).toBeInTheDocument();
    });

    expect(screen.getByTestId('photo-request-accept-paid')).toBeInTheDocument();
    expect(screen.getByTestId('photo-request-send-free')).toBeInTheDocument();
    expect(screen.getByTestId('photo-request-decline')).toBeInTheDocument();
  });
});