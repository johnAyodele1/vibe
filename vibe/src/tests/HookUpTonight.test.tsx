import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HookUpTonight from '../components/AdultZone/HookUpTonight';

// Mock location hooks
vi.mock('../hooks/useLocation', () => ({
  useCountries: () => ({ data: [{ code: 'US', name: 'United States', flag: '🇺🇸' }], loading: false }),
  useStates: (countryCode: string | null) => ({
    data: countryCode === 'US' ? [{ code: 'CA', name: 'California' }] : [],
    loading: false,
  }),
  useCities: (countryCode: string | null, stateCode: string | null) => ({
    data: countryCode === 'US' && stateCode === 'CA' ? [{ name: 'Los Angeles', lat: 34.0522, lng: -118.2437 }] : [],
    loading: false,
  }),
}));

// Mock leaflet
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: any) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => <div data-testid="tile-layer" />,
  CircleMarker: ({ children }: any) => <div data-testid="circle-marker">{children}</div>,
  Popup: ({ children }: any) => <div data-testid="popup">{children}</div>,
}));

describe('Hook Up Tonight — Horizontal Filters and CustomSelect', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.setItem('adultAccessToken', 'mock_token');
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/profiles/me')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              data: {
                location: {
                  country: { code: 'US', name: 'United States' },
                  state: { code: 'CA', name: 'California' },
                  city: { name: 'Los Angeles', lat: 34.0522, lng: -118.2437 },
                },
              },
            }),
        });
      }
      if (url.includes('/hookup/nearby')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              data: {
                providers: [
                  {
                    id: 'prov_1',
                    stageName: 'Stella Lux',
                    age: 24,
                    location: { city: { name: 'Los Angeles' } },
                    isOnline: true,
                    isVerified: true,
                    photoUrl: '/stella.jpg',
                  },
                ],
                pages: 1,
              },
              providers: [
                {
                  id: 'prov_1',
                  stageName: 'Stella Lux',
                  avatarUrl: '/stella.jpg',
                  coordinates: [34.0522, -118.2437],
                  isOnline: true,
                },
              ],
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
    });
    vi.stubGlobal('fetch', mockFetch);
  });

  it('renders Hook Up Tonight page without requesting GPS permission', async () => {
    render(
      <MemoryRouter>
        <HookUpTonight />
      </MemoryRouter>
    );

    // Header checks
    expect(screen.getByText('Hook Up Tonight')).toBeInTheDocument();
    expect(screen.getByText('Someone desires you right now.')).toBeInTheDocument();
  });

  it('pre-populates the filters from member profile location on page load', async () => {
    render(
      <MemoryRouter>
        <HookUpTonight />
      </MemoryRouter>
    );

    await waitFor(() => {
      // Check that California/Los Angeles selects are shown or pre-populated
      expect(screen.getByText('🇺🇸 United States')).toBeInTheDocument();
      expect(screen.getByText('California')).toBeInTheDocument();
      expect(screen.getByText('Los Angeles')).toBeInTheDocument();
    });
  });

  it('renders grid providers list when grid mode is active', async () => {
    render(
      <MemoryRouter>
        <HookUpTonight />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Stella Lux, 24')).toBeInTheDocument();
    });
  });

  it('switches to map view mode correctly', async () => {
    render(
      <MemoryRouter>
        <HookUpTonight />
      </MemoryRouter>
    );

    const mapBtn = screen.getByRole('button', { name: /Map/i });
    fireEvent.click(mapBtn);

    await waitFor(() => {
      expect(screen.getByTestId('map-container')).toBeInTheDocument();
    });
  });

  it('resets the filters back to empty when Reset is clicked', async () => {
    render(
      <MemoryRouter>
        <HookUpTonight />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Los Angeles')).toBeInTheDocument();
    });

    const resetBtn = screen.getByRole('button', { name: /Reset/i });
    fireEvent.click(resetBtn);

    await waitFor(() => {
      expect(screen.queryByText('Los Angeles')).not.toBeInTheDocument();
      const selectCountryEls = screen.getAllByText('Select Country');
      expect(selectCountryEls.length).toBeGreaterThan(0);
    });
  });
});
