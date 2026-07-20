import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProviderOnboarding from '../components/AdultZone/ProviderOnboarding';
import { useOnboardingStore } from '../components/AdultZone/useOnboardingStore';

// Mock AdultAuthContext
vi.mock('../contexts/AdultAuthContext', () => ({
  useAdultAuth: () => ({
    user: { id: 'provider123', email: 'lucia@vibe.com', role: 'provider' },
    isAuthenticated: true,
    logout: vi.fn(),
  })
}));

// Mock Location Hooks to return mock lists
vi.mock('../hooks/useLocation', () => ({
  useCountries: () => ({ data: [{ code: 'US', name: 'United States', flag: '🇺🇸' }], loading: false, error: null }),
  useStates: () => ({ data: [{ code: 'CA', name: 'California' }], loading: false, error: null }),
  useCities: () => ({ data: [{ name: 'Los Angeles', lat: 34, lng: -118 }], loading: false, error: null }),
}));

const mockFetch = vi.fn();
(globalThis as any).fetch = mockFetch;

describe('OnboardingWizard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('adultAccessToken', 'mock-token-abc');
    useOnboardingStore.getState().reset();

    mockFetch.mockImplementation(async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/v1/adult/providers/me/onboarding')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            currentStep: 1,
            completedSteps: [],
            isComplete: false,
            stepData: {
              1: null,
              2: null,
              3: null,
              4: null,
              5: null,
              6: null,
            }
          })
        };
      }
      return { ok: false, json: async () => ({ error: 'Not Found' }) };
    });
  });

  describe('Tab locking', () => {
    it('only step 1 tab is active on first load', async () => {
      render(
        <MemoryRouter>
          <ProviderOnboarding />
        </MemoryRouter>
      );

      // Wait for loading to finish
      await waitFor(() => {
        expect(screen.getByText('Tell us about yourself')).toBeInTheDocument();
      });

      const profileTab = screen.getByRole('button', { name: /Profile/i });
      expect(profileTab).toHaveClass('tab--active');

      const photosTab = screen.getByRole('button', { name: /Photos/i });
      expect(photosTab).toHaveClass('tab--locked');
    });

    it('steps 2-7 tabs are locked (pointer-events none) on first load', async () => {
      render(
        <MemoryRouter>
          <ProviderOnboarding />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Tell us about yourself')).toBeInTheDocument();
      });

      const photosTab = screen.getByRole('button', { name: /Photos/i });
      expect(photosTab).toHaveClass('tab--locked');

      const pricingTab = screen.getByRole('button', { name: /Pricing/i });
      expect(pricingTab).toHaveClass('tab--locked');
    });

    it('DONE tab is never clickable regardless of progress', async () => {
      mockFetch.mockImplementation(async (input: any) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.includes('/v1/adult/providers/me/onboarding')) {
          return {
            ok: true,
            json: async () => ({
              success: true,
              currentStep: 6,
              completedSteps: [1, 2, 3, 4, 5],
              isComplete: false,
              stepData: {
                1: { bio: 'Long bio text at least ten chars', gender: 'female', dateOfBirth: '1990-01-01' },
                2: { photos: [], videoPreview: '' },
                3: { servicesOffered: ['live_cam'] },
                4: { pricing: { perMinuteRate: 3.99, tonightRate: 150 }, tipMenu: [] },
                5: { location: { city: { name: 'LA' } }, coverageArea: 'city' },
                6: null,
              }
            })
          };
        }
        return { ok: false, json: async () => ({}) };
      });

      render(
        <MemoryRouter>
          <ProviderOnboarding />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Payout Method Settings')).toBeInTheDocument();
      });

      // DONE is a span, not a button, so it is never clickable
      const doneLabel = screen.getByText('Done');
      expect(doneLabel.tagName).toBe('SPAN');
      expect(doneLabel).toHaveClass('tab--locked');
    });

    it('completing step 1 makes step 1 tab green with checkmark', async () => {
      // Mock progress showing step 1 completed and currently on step 2
      mockFetch.mockImplementation(async (input: any) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.includes('/v1/adult/providers/me/onboarding')) {
          return {
            ok: true,
            json: async () => ({
              success: true,
              currentStep: 2,
              completedSteps: [1],
              isComplete: false,
              stepData: {
                1: { bio: 'Beautiful elegant bio that is long enough', gender: 'female', dateOfBirth: '1995-05-15' },
                2: null, 3: null, 4: null, 5: null, 6: null
              }
            })
          };
        }
        return { ok: false, json: async () => ({}) };
      });

      render(
        <MemoryRouter>
          <ProviderOnboarding />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Showcase Yourself')).toBeInTheDocument();
      });

      const profileTab = screen.getByRole('button', { name: /Profile/i });
      expect(profileTab).toHaveClass('tab--completed');
    });
  });

  describe('Progress persistence', () => {
    it('calls GET /onboarding on mount', async () => {
      render(
        <MemoryRouter>
          <ProviderOnboarding />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });
    });

    it('saves to localStorage after each successful step save', async () => {
      mockFetch.mockImplementation(async (input: any) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.includes('/v1/adult/providers/me/onboarding/step/1')) {
          return {
            ok: true,
            json: async () => ({ success: true, currentStep: 2, completedSteps: [1] })
          };
        }
        if (url.includes('/v1/adult/providers/me/onboarding')) {
          return {
            ok: true,
            json: async () => ({
              success: true,
              currentStep: 1,
              completedSteps: [],
              isComplete: false,
              stepData: { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null }
            })
          };
        }
        return { ok: false, json: async () => ({}) };
      });

      render(
        <MemoryRouter>
          <ProviderOnboarding />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Tell us about yourself')).toBeInTheDocument();
      });

      // Fill in bio
      const textarea = screen.getByPlaceholderText(/Describe yourself/i);
      fireEvent.change(textarea, { target: { value: 'This is a long and valid bio for Lucia Rose.' } });

      const saveButton = screen.getByRole('button', { name: /Save & Continue/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        const backup = localStorage.getItem('az_provider_onboarding');
        expect(backup).toBeDefined();
        expect(JSON.parse(backup || '{}').completedSteps).toContain(1);
      });
    });
  });

  describe('Step 4 conditional fields', () => {
    it('shows perMinuteRate field when private_call in services', async () => {
      // Mock store with private_call selected
      useOnboardingStore.setState({
        currentStep: 4,
        completedSteps: [1, 2, 3],
        stepData: {
          1: { bio: 'Long elegant bio', gender: 'female', dateOfBirth: '1995-05-15' },
          2: { photos: [], videoPreview: '' },
          3: { servicesOffered: ['private_call'] },
          4: null, 5: null, 6: null
        }
      });

      mockFetch.mockImplementation(async (input: any) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.includes('/v1/adult/providers/me/onboarding')) {
          return {
            ok: true,
            json: async () => ({
              success: true,
              currentStep: 4,
              completedSteps: [1, 2, 3],
              isComplete: false,
              stepData: useOnboardingStore.getState().stepData
            })
          };
        }
        return { ok: false, json: async () => ({}) };
      });

      render(
        <MemoryRouter>
          <ProviderOnboarding />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Per-minute Video Call Rate')).toBeInTheDocument();
      });
    });

    it('hides perMinuteRate field when private_call not in services', async () => {
      useOnboardingStore.setState({
        currentStep: 4,
        completedSteps: [1, 2, 3],
        stepData: {
          1: { bio: 'Long elegant bio', gender: 'female', dateOfBirth: '1995-05-15' },
          2: { photos: [], videoPreview: '' },
          3: { servicesOffered: ['live_cam'] },
          4: null, 5: null, 6: null
        }
      });

      mockFetch.mockImplementation(async (input: any) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.includes('/v1/adult/providers/me/onboarding')) {
          return {
            ok: true,
            json: async () => ({
              success: true,
              currentStep: 4,
              completedSteps: [1, 2, 3],
              isComplete: false,
              stepData: useOnboardingStore.getState().stepData
            })
          };
        }
        return { ok: false, json: async () => ({}) };
      });

      render(
        <MemoryRouter>
          <ProviderOnboarding />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.queryByText('Per-minute Video Call Rate')).not.toBeInTheDocument();
      });
    });
  });

  describe('Step 3 service card toggle', () => {
    it('selected card has checkmark in corner', async () => {
      useOnboardingStore.setState({
        currentStep: 3,
        completedSteps: [1, 2],
        stepData: {
          1: { bio: 'Long elegant bio', gender: 'female', dateOfBirth: '1995-05-15' },
          2: { photos: [], videoPreview: '' },
          3: { servicesOffered: ['live_cam'] },
          4: null, 5: null, 6: null
        }
      });

      mockFetch.mockImplementation(async (input: any) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.includes('/v1/adult/providers/me/onboarding')) {
          return {
            ok: true,
            json: async () => ({
              success: true,
              currentStep: 3,
              completedSteps: [1, 2],
              isComplete: false,
              stepData: useOnboardingStore.getState().stepData
            })
          };
        }
        return { ok: false, json: async () => ({}) };
      });

      render(
        <MemoryRouter>
          <ProviderOnboarding />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Live Webcam Shows')).toBeInTheDocument();
      });

      // There should be a checkmark icon shown
      expect(screen.getByText('✓')).toBeInTheDocument();
    });
  });
});
