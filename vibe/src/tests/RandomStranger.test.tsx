import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RandomStranger from '../components/AdultZone/RandomStranger';

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
  })),
}));

vi.mock('../contexts/AdultAuthContext', () => ({
  useAdultAuth: () => ({
    user: { id: 'test_user_id', username: 'testuser' },
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('RandomStranger Component Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('adultAccessToken', 'mock_token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: { status: 'waiting' } }),
    }));
  });

  it('renders filter controls with default selections', () => {
    render(<RandomStranger />);

    expect(screen.getByText('Girls')).toBeInTheDocument();
    expect(screen.getByText('Guys')).toBeInTheDocument();
    expect(screen.getByText('Anyone')).toBeInTheDocument();

    expect(screen.getByText('Text Only')).toBeInTheDocument();
    expect(screen.getByText('Cam')).toBeInTheDocument();
    expect(screen.getByText('Both')).toBeInTheDocument();

    const anyoneBtn = screen.getByRole('button', { name: 'Anyone' });
    expect(anyoneBtn).toHaveAttribute('aria-pressed', 'true');

    const bothBtn = screen.getByRole('button', { name: 'Both' });
    expect(bothBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('updates selected preference and mode filters on click', () => {
    render(<RandomStranger />);

    const girlsBtn = screen.getByRole('button', { name: 'Girls' });
    fireEvent.click(girlsBtn);
    expect(girlsBtn).toHaveAttribute('aria-pressed', 'true');

    const textBtn = screen.getByRole('button', { name: 'Text Only' });
    fireEvent.click(textBtn);
    expect(textBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('sends selected filter values in the queue API request body', async () => {
    render(<RandomStranger />);

    const girlsBtn = screen.getByRole('button', { name: 'Girls' });
    fireEvent.click(girlsBtn);

    const textBtn = screen.getByRole('button', { name: 'Text Only' });
    fireEvent.click(textBtn);

    const startBtn = screen.getByRole('button', { name: /START MATCHING/i });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/adult/random/queue'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ preference: 'girls', mode: 'text' }),
        })
      );
    });
  });
});
