import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProviderEarnings from '../components/AdultZone/ProviderEarnings';

const mockFetch = vi.fn();
(globalThis as any).fetch = mockFetch;

describe('ProviderEarnings Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('adultAccessToken', 'mock-provider-token');

    mockFetch.mockImplementation(async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/v1/adult/providers/me/earnings')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              totalEarned: 74200,
              paidOut: 45000,
              pending: 600000,
              timeline: [
                { dayName: 'Mon', credits: 1000 },
                { dayName: 'Tue', credits: 2000 },
                { dayName: 'Wed', credits: 1500 },
                { dayName: 'Thu', credits: 4000 },
                { dayName: 'Fri', credits: 3000 },
                { dayName: 'Sat', credits: 5000 }
              ],
              transactions: [
                { id: '1', date: 'Jul 15', type: 'Tip', from: 'Member_3821', amount: 500, naira: 50000, status: 'Completed' },
                { id: '2', date: 'Jul 15', type: 'Private Call', from: 'Member_2214', amount: 1200, naira: 120000, status: 'Completed' },
                { id: '3', date: 'Jul 14', type: 'Tip', from: 'Anonymous', amount: 100, naira: 10000, status: 'Completed' },
                { id: '4', date: 'Jul 14', type: 'Payout', from: 'Bank Transfer', amount: -60000, naira: -6000000, status: 'Paid' }
              ]
            }
          })
        };
      }
      return { ok: false, json: async () => ({ error: 'Not Found' }) };
    });
  });

  it('displays metrics, graph, and transaction breakdown loaded from API', async () => {
    render(
      <MemoryRouter>
        <ProviderEarnings />
      </MemoryRouter>
    );

    // Verify loading spinner shows or data appears
    await waitFor(() => {
      expect(screen.getByText(/💎 74,?200/)).toBeInTheDocument();
      expect(screen.getByText('₦45,000')).toBeInTheDocument();
      expect(screen.getByText('₦600,000')).toBeInTheDocument();
      expect(screen.getByText('Member_3821')).toBeInTheDocument();
      expect(screen.getByText('Member_2214')).toBeInTheDocument();
      expect(screen.getByText('Bank Transfer')).toBeInTheDocument();
    });
  });

  it('supports beautiful client-side pagination', async () => {
    // Override fetch to return 12 mock transactions
    mockFetch.mockImplementation(async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/v1/adult/providers/me/earnings')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              totalEarned: 1000,
              paidOut: 0,
              pending: 0,
              timeline: [],
              transactions: Array.from({ length: 12 }, (_, idx) => ({
                id: `tx-${idx}`,
                date: 'Jul 15',
                type: 'Tip',
                from: `User_${idx}`,
                amount: 100,
                usd: 0.75,
                status: 'Completed'
              }))
            }
          })
        };
      }
      return { ok: false, json: async () => ({ error: 'Not Found' }) };
    });

    render(
      <MemoryRouter>
        <ProviderEarnings />
      </MemoryRouter>
    );

    // Page 1 should show User_0 to User_9 but not User_10
    await waitFor(() => {
      expect(screen.getByText('User_0')).toBeInTheDocument();
      expect(screen.getByText('User_9')).toBeInTheDocument();
    });
    expect(screen.queryByText('User_10')).not.toBeInTheDocument();

    // Find the Next page button
    const nextButton = screen.getByRole('button', { name: /Next/i });
    expect(nextButton).toBeInTheDocument();
    fireEvent.click(nextButton);

    // Now User_10 and User_11 should be shown, User_0 and User_9 should be hidden
    await waitFor(() => {
      expect(screen.getByText('User_10')).toBeInTheDocument();
    });
    expect(screen.queryByText('User_0')).not.toBeInTheDocument();

    // Go back to Page 1
    const prevButton = screen.getByRole('button', { name: /Prev/i });
    fireEvent.click(prevButton);

    await waitFor(() => {
      expect(screen.getByText('User_0')).toBeInTheDocument();
    });
    expect(screen.queryByText('User_10')).not.toBeInTheDocument();

    // Change rows per page size to 15
    const rowsSelect = screen.getByTestId('rows-per-page-select');
    fireEvent.change(rowsSelect, { target: { value: '15' } });

    // Now all 12 users should be visible since limit is 15
    await waitFor(() => {
      expect(screen.getByText('User_0')).toBeInTheDocument();
      expect(screen.getByText('User_10')).toBeInTheDocument();
    });
  });

  it('allows requesting a payout which triggers the payout API and refreshes the component', async () => {
    render(
      <MemoryRouter>
        <ProviderEarnings />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/💎 74,?200/)).toBeInTheDocument();
    });

    const payoutButton = screen.getByRole('button', { name: /Request Early Payout/i });

    // Mock payout API success
    mockFetch.mockImplementation(async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/v1/adult/providers/me/payout')) {
        return {
          ok: true,
          json: async () => ({ success: true })
        };
      }
      if (url.includes('/v1/adult/providers/me/earnings')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              totalEarned: 74200,
              paidOut: 55650,
              pending: 0.00,
              timeline: [],
              transactions: [
                { id: '5', date: 'Jul 16', type: 'Payout', from: 'Bank Transfer', amount: -14200, naira: -1420000, status: 'Completed' }
              ]
            }
          })
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    fireEvent.click(payoutButton);

    await waitFor(() => {
      expect(screen.getByText('₦55,650')).toBeInTheDocument();
      expect(screen.getByText('₦0')).toBeInTheDocument();
    });
  });
});
