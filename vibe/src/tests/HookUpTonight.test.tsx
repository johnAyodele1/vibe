import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import HookUpTonight from '../components/AdultZone/HookUpTonight';

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn()
}));

// Mock useLocation hooks
vi.mock('../hooks/useLocation', () => ({
  useCountries: () => ({
    data: [{ code: 'NG', name: 'Nigeria' }],
    loading: false,
    error: null
  }),
  useStates: () => ({
    data: [{ code: 'LA', name: 'Lagos' }],
    loading: false,
    error: null
  }),
  useCities: () => ({
    data: [{ name: 'Lagos', lat: 6.5244, lng: 3.3792 }],
    loading: false,
    error: null
  })
}));

// Mock react-leaflet
vi.mock('react-leaflet', () => {
  return {
    MapContainer: ({ children }: any) => <div data-testid="map-container">{children}</div>,
    TileLayer: () => <div data-testid="tile-layer" />,
    CircleMarker: ({ children, center }: any) => (
      <div data-testid="circle-marker" data-center={JSON.stringify(center)}>
        {children}
      </div>
    ),
    Popup: ({ children }: any) => <div data-testid="map-popup">{children}</div>
  };
});

// Mock global fetch
const mockProvidersList = [
  {
    _id: 'p1',
    displayName: 'Sophie',
    username: 'sophie',
    dateOfBirth: '1995-01-01',
    profilePhoto: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb',
    isVerified: true,
    providerProfile: {
      stageName: 'Sophie',
      isLive: true,
      tonightRate: 150,
      categories: ['Casual'],
      location: {
        country: { code: 'NG', name: 'Nigeria' },
        state: { code: 'LA', name: 'Lagos' },
        city: { name: 'Lagos', lat: 6.5244, lng: 3.3792 }
      }
    }
  }
];

describe('Hook Up Tonight Frontend View', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('adultAccessToken', 'mock_token');
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/adult/profiles/me')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: {
              location: {
                country: { code: 'NG', name: 'Nigeria' },
                state: { code: 'LA', name: 'Lagos' },
                city: { name: 'Lagos', lat: 6.5244, lng: 3.3792 }
              }
            }
          })
        });
      }
      if (url.includes('/adult/hookup/nearby')) {
        if (url.includes('view=map')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              success: true,
              providers: [
                {
                  id: 'p1',
                  stageName: 'Sophie',
                  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb',
                  coordinates: [6.5244, 3.3792],
                  isOnline: true,
                  tonightRate: 150
                }
              ]
            })
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: {
              providers: mockProvidersList,
              total: 1,
              page: 1,
              pages: 1
            }
          })
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([])
      });
    });
  });

  it('renders Hook Up Tonight header and sub-header', async () => {
    render(<HookUpTonight />);
    expect(screen.getByText('Hook Up Tonight')).toBeInTheDocument();
    expect(screen.getByText('Someone desires you right now.')).toBeInTheDocument();
  });

  it('loads and pre-populates location filter from user profile', async () => {
    render(<HookUpTonight />);
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('/adult/profiles/me'), expect.any(Object));
    });
  });

  it('allows selecting Grid and Map view modes', async () => {
    render(<HookUpTonight />);
    const gridBtn = screen.getByRole('button', { name: /^Grid$/i });
    const mapBtn = screen.getByRole('button', { name: /^Map$/i });

    expect(gridBtn).toBeInTheDocument();
    expect(mapBtn).toBeInTheDocument();

    fireEvent.click(mapBtn);
    await waitFor(() => {
      expect(screen.getByTestId('map-container')).toBeInTheDocument();
    });
  });

  it('performs searches when resetting filters', async () => {
    render(<HookUpTonight />);
    const resetBtn = screen.getByRole('button', { name: /Reset All Filters/i });
    fireEvent.click(resetBtn);
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('/adult/hookup/nearby'), expect.any(Object));
    });
  });
});
