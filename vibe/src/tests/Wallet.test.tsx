import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Wallet from '../components/AdultZone/Wallet';
import { BrowserRouter } from 'react-router-dom';
import * as AdultAuthContext from '../contexts/AdultAuthContext';

vi.spyOn(AdultAuthContext, 'useAdultAuth').mockReturnValue({
  user: { id: 'u1', username: 'testuser', role: 'user', credits: 100 },
  refetchUser: vi.fn(),
  updateCredits: vi.fn(),
  isAuthenticated: true,
  loading: false,
  login: vi.fn(),
  signup: vi.fn(),
  logout: vi.fn(),
} as ReturnType<typeof AdultAuthContext.useAdultAuth>);

describe('Wallet Component', () => {
  it('renders wallet page correctly with packages and custom purchase UI', async () => {
    render(
      <BrowserRouter>
        <Wallet />
      </BrowserRouter>
    );

    expect(screen.getByText(/Current Balance/i)).toBeInTheDocument();
    expect(screen.getByText(/Purchase Credits/i)).toBeInTheDocument();
    expect(screen.getByText(/Custom Purchase/i)).toBeInTheDocument();
  });

  it('renders custom purchase inputs and calculates diamonds correctly', async () => {
    render(
      <BrowserRouter>
        <Wallet />
      </BrowserRouter>
    );

    const input = screen.getByPlaceholderText('1,000');
    expect(input).toBeInTheDocument();
    expect(screen.getByText(/1 Diamond = ₦100/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Minimum ₦1,000/i).length).toBeGreaterThan(0);
  });

  it('correctly maps status colors for completed, pending, and failed transactions', async () => {
    localStorage.setItem('adultAccessToken', 'test-token');
    const mockTx = [
      { _id: 'tx1', type: 'credit_purchase', amount: 100, status: 'completed', createdAt: new Date().toISOString() },
      { _id: 'tx2', type: 'credit_purchase', amount: 50, status: 'pending', createdAt: new Date().toISOString() },
      { _id: 'tx3', type: 'credit_purchase', amount: 20, status: 'failed', createdAt: new Date().toISOString() },
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation((url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.includes('/transactions')) {
        return Promise.resolve({
          json: () => Promise.resolve({ transactions: mockTx, totalPages: 1, total: 3 })
        } as Response);
      }
      return Promise.resolve({
        json: () => Promise.resolve({})
      } as Response);
    });

    render(
      <BrowserRouter>
        <Wallet />
      </BrowserRouter>
    );

    const completedBadge = await screen.findByTestId('tx-status-tx1');
    const pendingBadge = await screen.findByTestId('tx-status-tx2');
    const failedBadge = await screen.findByTestId('tx-status-tx3');

    expect(completedBadge).toHaveClass('text-green-400');
    expect(pendingBadge).toHaveClass('text-amber-400');
    expect(failedBadge).toHaveClass('text-red-400');
  });
});
