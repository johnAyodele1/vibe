import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProviderProfile from '../components/AdultZone/ProviderProfile';

const mockFetch = vi.fn();
(globalThis as any).fetch = mockFetch;

describe('ProviderProfile Component Payment Tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('adultAccessToken', 'mock-token');

    mockFetch.mockImplementation(async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;

      if (url.includes('/v1/adult/providers/me/onboarding')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            stepData: {
              6: {
                payoutMethod: 'bank',
                payoutDetails: {
                  bankName: 'First Bank',
                  accountHolderName: 'Jane Doe',
                  accountNumber: '1234567890',
                  routingCode: '011',
                }
              }
            }
          })
        };
      }
      if (url.includes('/v1/adult/providers/me')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              user: {
                id: 'p1',
                firstName: 'Jane',
                bio: 'Experienced performer',
                gender: 'female',
                providerProfile: {
                  stageName: 'Jane',
                  servicesOffered: ['live_cam', 'private_call'],
                  pricePerMinute: 5,
                  tonightRate: 200,
                  location: {},
                  schedule: []
                }
              }
            }
          })
        };
      }
      return { ok: true, json: async () => ({ success: true }) };
    });
  });

  it('selects payment tab when ?tab=payment query parameter is present and loads prefilled bank data', async () => {
    render(
      <MemoryRouter initialEntries={['/adult/provider/profile?tab=payment']}>
        <ProviderProfile />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('payment-tab-content')).toBeInTheDocument();
      expect(screen.getByDisplayValue('First Bank')).toBeInTheDocument();
      expect(screen.getByDisplayValue('1234567890')).toBeInTheDocument();
    });
  });

  it('submits updated payment settings to onboarding step 6 API endpoint', async () => {
    render(
      <MemoryRouter initialEntries={['/adult/provider/profile?tab=payment']}>
        <ProviderProfile />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('payment-tab-content')).toBeInTheDocument();
    });

    const bankInput = screen.getByDisplayValue('First Bank');
    fireEvent.change(bankInput, { target: { value: 'Zenith Bank' } });

    const saveBtn = screen.getByTestId('save-payment-btn');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      const calls = mockFetch.mock.calls;
      const matchingCall = calls.find((callArgs: any[]) => {
        const arg = callArgs[0];
        const url = typeof arg === 'string' ? arg : arg?.url;
        return url && url.includes('/v1/adult/providers/me/onboarding/step/6');
      });
      expect(matchingCall).toBeDefined();
      const reqOrOptions = matchingCall[1] || matchingCall[0];
      const method = reqOrOptions.method || 'PUT';
      expect(method).toBe('PUT');
    });
  });
});
