import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NaughtyRooms from '../components/AdultZone/NaughtyRooms';
import { server } from './mocks';
import { http, HttpResponse } from 'msw';

// Mock react-router-dom useParams, useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ roomId: undefined }),
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
    user: { id: 'user-123', email: 'lucy@vibe.com', username: 'lucy', role: 'user', credits: 100 },
    isAuthenticated: true,
  }),
}));

describe('NaughtyRooms Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('adultAccessToken', 'mock-token');

    // Register MSW Handlers for Naughty Rooms
    server.use(
      http.get('**/v1/adult/rooms', () => {
        return HttpResponse.json({
          success: true,
          data: {
            rooms: [
              {
                _id: 'room-1',
                name: 'Chill Castle',
                description: 'Casual visual roleplay stories',
                category: 'roleplay',
                mood: 'chill',
                memberCount: 24,
                requiresSubscription: false,
                coverGradient: ['#300a0e', '#090102'],
                icon: '🏰',
              },
              {
                _id: 'room-2',
                name: 'Explicit Fire',
                description: 'Spicy explicit roleplay scenarios',
                category: 'spicy',
                mood: 'explicit',
                memberCount: 154,
                requiresSubscription: true,
                coverGradient: ['#c8102e', '#0a0608'],
                icon: '🔥',
              },
            ],
          },
        });
      }),

      http.post('**/v1/adult/rooms/:roomId/join', () => {
        return HttpResponse.json({
          success: true,
          data: {
            membership: { role: 'member' }
          }
        });
      })
    );
  });

  it('renders landing list headers and cards correctly from mock fetch API', async () => {
    render(<NaughtyRooms />);

    // Check title
    expect(screen.getByText('Naughty Rooms')).toBeInTheDocument();
    expect(screen.getByText('Find your vibe. Join the conversation.')).toBeInTheDocument();

    // Wait for mock cards to load
    await waitFor(() => {
      expect(screen.getByText('Chill Castle')).toBeInTheDocument();
      expect(screen.getByText('Explicit Fire')).toBeInTheDocument();
    });

    expect(screen.getByText('24 ONLINE')).toBeInTheDocument();
    expect(screen.getByText('154 ONLINE')).toBeInTheDocument();
  });

  it('handles category filter pills click triggers correctly', async () => {
    render(<NaughtyRooms />);

    const spicyPill = screen.getByText('🌶️ Spicy');
    fireEvent.click(spicyPill);

    // Should load cards
    await waitFor(() => {
      expect(screen.getByText('Chill Castle')).toBeInTheDocument();
    });
  });

  it('handles mood filter pills click triggers correctly', async () => {
    render(<NaughtyRooms />);

    const wildPill = screen.getByText('Wild');
    fireEvent.click(wildPill);

    // Should load cards
    await waitFor(() => {
      expect(screen.getByText('Chill Castle')).toBeInTheDocument();
    });
  });

  it('handles Join/Enter Room button trigger calls API', async () => {
    render(<NaughtyRooms />);

    await waitFor(() => {
      expect(screen.getByText('Chill Castle')).toBeInTheDocument();
    });

    const enterButtons = screen.getAllByRole('button', { name: /Enter Room/i });
    fireEvent.click(enterButtons[0]);

    // Triggers join successfully
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/rooms/room-1');
    });
  });
});
