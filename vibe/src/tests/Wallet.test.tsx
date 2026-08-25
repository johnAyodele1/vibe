import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import Wallet from '../components/AdultZone/Wallet';
import { BrowserRouter } from 'react-router-dom';
import * as AdultAuthContext from '../contexts/AdultAuthContext';

vi.spyOn(AdultAuthContext, 'useAdultAuth').mockReturnValue({
  user: { role: 'user', credits: 100 } as any,
  refetchUser: vi.fn(),
  updateCredits: vi.fn(),
  isAuthenticated: true,
  isLoading: false,
  token: 'mock_token',
  login: vi.fn(),
  logout: vi.fn(),
  error: null,
});

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
});
