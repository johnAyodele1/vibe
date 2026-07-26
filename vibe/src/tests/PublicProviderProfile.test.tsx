import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PublicProviderProfile from '../components/AdultZone/PublicProviderProfile';

const mockFetch = vi.fn();
(globalThis as any).fetch = mockFetch;

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom') as any;
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ providerId: 'provider-123' })
  };
});

// We'll dynamically mock the auth hook to control authenticated state
let mockIsAuthenticated = false;

vi.mock('../contexts/AdultAuthContext', () => ({
  useAdultAuth: () => ({
    user: mockIsAuthenticated ? { id: 'user1', email: 'member@vibe.com', role: 'user', credits: 240 } : null,
    isAuthenticated: mockIsAuthenticated
  })
}));

describe('PublicProviderProfile Authentication Interceptor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthenticated = false;

    mockFetch.mockImplementation(async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/adult/providers/provider-123')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              id: 'provider-123',
              stageName: 'Zara Lux',
              bio: 'Sensual and elegant',
              isOnline: true,
              isVerified: true,
              rating: 4.9,
              reviewCount: 42,
              photos: [{ url: 'https://test.com/photo.jpg', isExplicit: false }]
            }
          })
        };
      }
      return { ok: false, json: async () => ({ error: 'Not Found' }) };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders Login Required and triggers auth modal event when unauthenticated', async () => {
    let modalEventTriggered = false;
    const handleModalEvent = () => {
      modalEventTriggered = true;
    };
    window.addEventListener('open-adult-auth-modal', handleModalEvent);

    render(
      <MemoryRouter>
        <PublicProviderProfile />
      </MemoryRouter>
    );

    // Verify "Login Required" card elements are displayed
    expect(screen.getByText('Login Required')).toBeInTheDocument();
    expect(screen.getByText(/Please login or sign up to view this provider/i)).toBeInTheDocument();

    // Verify the authentication modal open event was dispatched (wait for the delay)
    await waitFor(() => {
      expect(modalEventTriggered).toBe(true);
    });

    // Clicking the login button should dispatch the event again
    modalEventTriggered = false;
    const loginBtn = screen.getByRole('button', { name: /Login or Sign Up/i });
    fireEvent.click(loginBtn);
    expect(modalEventTriggered).toBe(true);

    window.removeEventListener('open-adult-auth-modal', handleModalEvent);
  });

  it('bypasses Login Required and fetches profile successfully when authenticated', async () => {
    mockIsAuthenticated = true;

    render(
      <MemoryRouter>
        <PublicProviderProfile />
      </MemoryRouter>
    );

    // Loading indicator is shown first
    expect(screen.getByText(/Elevating profiles.../i)).toBeInTheDocument();

    // Wait for the profile data to load and render
    await waitFor(() => {
      expect(screen.getByText('Zara Lux')).toBeInTheDocument();
    });

    expect(screen.getByText(/Sensual and elegant/i)).toBeInTheDocument();
    expect(screen.queryByText('Login Required')).not.toBeInTheDocument();
  });
});
