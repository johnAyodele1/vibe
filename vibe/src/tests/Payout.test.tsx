import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProviderPayout from '../components/AdultZone/ProviderPayout';

const mockFetch = vi.fn();
(globalThis as any).fetch = mockFetch;

vi.mock('../contexts/AdultAuthContext', () => ({
  useAdultAuth: () => ({
    user: { id: 'provider123', email: 'lucia@vibe.com', role: 'provider' },
    isAuthenticated: true
  })
}));

// Mock lottie-react to prevent HTMLCanvasElement.getContext() errors in JSDOM
vi.mock('lottie-react', () => {
  return {
    default: () => <div data-testid="mocked-lottie">Mocked Lottie</div>
  };
});

describe('ProviderPayout Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('adultAccessToken', 'mock-token');

    // Default mock response: no active request, has eligible balance
    mockFetch.mockImplementation(async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;

      if (url.includes('/v1/adult/providers/me/payout/eligible')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            eligibleAmount: 1500,
            eligibleNaira: 150000,
            eligibleTransactionIds: ['tx123'],
            breakdown: { tips: 1000, calls: 500, service_charges: 0, gifts: 0, paid_media: 0, spin_wheel: 0 }
          })
        };
      }
      if (url.includes('/v1/adult/providers/me/payout/status')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: null
          })
        };
      }
      if (url.includes('/v1/adult/providers/me/payout/history')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: []
          })
        };
      }
      return { ok: false, status: 404, json: async () => ({ error: 'Not Found' }) };
    });
  });

  it('renders available eligible payout balance from the eligible API', async () => {
    render(
      <MemoryRouter>
        <ProviderPayout />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('💎 1,500')).toBeInTheDocument();
      expect(screen.getByText('₦150,000')).toBeInTheDocument();
      expect(screen.getByText('Earnings Breakdown')).toBeInTheDocument();
    });
  });

  it('clicking request payout sends a POST request and updates layout', async () => {
    render(
      <MemoryRouter>
        <ProviderPayout />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Request Payout — 💎 1,500')).toBeInTheDocument();
    });

    const requestButton = screen.getByRole('button', { name: /Request Payout/i });

    // Mock post request success
    mockFetch.mockImplementation(async (input: any, options: any = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      const method = (typeof input === 'object' && input.method) ? input.method : (options?.method || 'GET');
      console.log('MOCK FETCH CALLED:', method, url);

      if (method === 'POST' && url.includes('/v1/adult/providers/me/payout/request')) {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            success: true,
            requestId: 'req_123',
            amount: 1500,
            amountNaira: 150000,
            queuePosition: 1,
            status: 'queued'
          })
        };
      }
      if (url.includes('/v1/adult/providers/me/payout/eligible')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            eligibleAmount: 0,
            eligibleNaira: 0,
            eligibleTransactionIds: [],
            breakdown: { tips: 0, calls: 0, service_charges: 0, gifts: 0, paid_media: 0, spin_wheel: 0 }
          })
        };
      }
      if (url.includes('/v1/adult/providers/me/payout/status')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              _id: 'req_123',
              amount: 1500,
              amountNaira: 150000,
              payoutMethod: 'bank',
              payoutDetails: { bankName: 'GTBank', accountNumber: '0123456789' },
              status: 'queued',
              queuePosition: 1,
              requestedAt: new Date().toISOString()
            }
          })
        };
      }
      if (url.includes('/v1/adult/providers/me/payout/history')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: [] })
        };
      }
      return { ok: false, status: 404, json: async () => ({ error: 'Not Found' }) };
    });

    fireEvent.click(requestButton);

    await waitFor(() => {
      expect(screen.getByText('Payment Queued')).toBeInTheDocument();
      expect(screen.getByText('You are #1 in the queue — moving to verification soon.')).toBeInTheDocument();
    });
  });

  it('renders verifying state correctly when active request status is verifying', async () => {
    mockFetch.mockImplementation(async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;

      if (url.includes('/v1/adult/providers/me/payout/status')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              _id: 'req_123',
              amount: 1200,
              amountNaira: 120000,
              payoutMethod: 'paypal',
              payoutDetails: { paypalEmail: 'lucia@vibe.com' },
              status: 'verifying',
              queuePosition: 3,
              requestedAt: new Date().toISOString()
            }
          })
        };
      }
      return { ok: true, status: 200, json: async () => ({ success: true, data: [] }) };
    });

    render(
      <MemoryRouter>
        <ProviderPayout />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Admin Verifying Details')).toBeInTheDocument();
      expect(screen.getByText('Position #3 — Our team is reviewing your payout details.')).toBeInTheDocument();
      expect(screen.getByText('PayPal: lucia@vibe.com')).toBeInTheDocument();
    });
  });

  it('renders completed state with admin reference when status is completed', async () => {
    mockFetch.mockImplementation(async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;

      if (url.includes('/v1/adult/providers/me/payout/status')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              _id: 'req_123',
              amount: 1000,
              amountNaira: 100000,
              payoutMethod: 'bank',
              payoutDetails: { bankName: 'Access Bank', accountNumber: '9876543210' },
              status: 'completed',
              requestedAt: new Date().toISOString(),
              adminReference: 'TXREF-777'
            }
          })
        };
      }
      return { ok: true, status: 200, json: async () => ({ success: true, data: [] }) };
    });

    render(
      <MemoryRouter>
        <ProviderPayout />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Payment Sent! 🎉')).toBeInTheDocument();
      expect(screen.getByText('Reference: TXREF-777')).toBeInTheDocument();
    });
  });

  it('renders rejected state with reason, settings and submit buttons', async () => {
    mockFetch.mockImplementation(async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;

      if (url.includes('/v1/adult/providers/me/payout/status')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              _id: 'req_123',
              amount: 1000,
              amountNaira: 100000,
              payoutMethod: 'crypto',
              payoutDetails: { cryptoCurrency: 'USDT', cryptoAddress: '0x12345678901234567890' },
              status: 'rejected',
              requestedAt: new Date().toISOString(),
              rejectedReason: 'Invalid wallet address'
            }
          })
        };
      }
      return { ok: true, status: 200, json: async () => ({ success: true, data: [] }) };
    });

    render(
      <MemoryRouter>
        <ProviderPayout />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Payout Rejected')).toBeInTheDocument();
      expect(screen.getByText('Invalid wallet address')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Submit New Request/i })).toBeInTheDocument();
    });
  });
});
