import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PrivateSext from '../components/AdultZone/PrivateSext';
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
        <PrivateSext />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText(/Sexting Inbox/i)).toBeInTheDocument();
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
        <PrivateSext />
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
});
