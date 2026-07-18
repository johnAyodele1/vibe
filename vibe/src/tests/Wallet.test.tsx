import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Wallet from '../components/AdultZone/Wallet';

vi.mock('../contexts/AdultAuthContext', () => ({
  useAdultAuth: () => ({
    user: { id: 'user1', email: 'member@vibe.com', role: 'user' },
    isAuthenticated: true
  })
}));

const mockFetch = vi.fn();
(globalThis as any).fetch = mockFetch;

describe('Wallet Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('adultAccessToken', 'mock-token');

    mockFetch.mockImplementation(async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      console.log('MOCK FETCH CALLED FOR URL STRING:', url);
      if (url.includes('/v1/adult/wallet/bundles')) {
        return {
          ok: true,
          json: async () => [
            { id: 'bundle_100', credits: 100, priceUsd: 4.99, label: 'Starter', badge: null },
            { id: 'bundle_500', credits: 500, priceUsd: 19.99, label: 'Popular', badge: 'Best Value' }
          ]
        };
      }
      if (url.includes('/v1/adult/wallet/transactions')) {
        return {
          ok: true,
          json: async () => ({
            transactions: [
              { _id: 'tx1', type: 'purchase', amount: 500, createdAt: new Date().toISOString(), status: 'completed' }
            ]
          })
        };
      }
      if (url.includes('/v1/adult/wallet')) {
        return {
          ok: true,
          json: async () => ({
            creditBalance: 240,
            lifetimeCreditsPurchased: 500,
            lifetimeCreditsSpent: 260,
            estimatedUsdValue: '1.80'
          })
        };
      }
      return { ok: false, json: async () => ({ error: 'Not Found' }) };
    });
  });

  it('displays credit balance and estimated USD value from API', async () => {
    render(
      <MemoryRouter>
        <Wallet />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('240')).toBeInTheDocument();
      expect(screen.getByText(/Credits available for tipping/)).toBeInTheDocument();
      expect(screen.getByText(/~\$1\.80 USD/)).toBeInTheDocument();
    });
  });

  it('renders credit bundles from API with badges', async () => {
    render(
      <MemoryRouter>
        <Wallet />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Starter')).toBeInTheDocument();
      expect(screen.getByText('Popular')).toBeInTheDocument();
      expect(screen.getByText('Best Value')).toBeInTheDocument();
    });
  });

  it('renders transactions table from API', async () => {
    render(
      <MemoryRouter>
        <Wallet />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('purchase')).toBeInTheDocument();
      expect(screen.getByText('+500 💎')).toBeInTheDocument();
    });
  });

  it('handles credit bundle purchase interaction', async () => {
    render(
      <MemoryRouter>
        <Wallet />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Starter')).toBeInTheDocument();
    });

    const buyButton = screen.getAllByRole('button', { name: /Buy Now/i })[0];

    // Reset mock to handle purchase simulation
    mockFetch.mockImplementation(async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/v1/adult/wallet/purchase/intent')) {
        return {
          ok: true,
          json: async () => ({ paymentIntentId: 'pi_mock_123' })
        };
      }
      if (url.includes('/v1/adult/wallet/purchase/webhook')) {
        return {
          ok: true,
          json: async () => ({ success: true })
        };
      }
      if (url.includes('/v1/adult/wallet/bundles')) {
        return {
          ok: true,
          json: async () => [
            { id: 'bundle_100', credits: 100, priceUsd: 4.99, label: 'Starter', badge: null }
          ]
        };
      }
      if (url.includes('/v1/adult/wallet/transactions')) {
        return {
          ok: true,
          json: async () => ({ transactions: [] })
        };
      }
      if (url.includes('/v1/adult/wallet')) {
        return {
          ok: true,
          json: async () => ({
            creditBalance: 340,
            lifetimeCreditsPurchased: 600,
            lifetimeCreditsSpent: 260,
            estimatedUsdValue: '2.55'
          })
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    fireEvent.click(buyButton);

    await waitFor(() => {
      expect(screen.getByText('Successfully purchased credits!')).toBeInTheDocument();
      expect(screen.getByText('340')).toBeInTheDocument();
    });
  });
});
