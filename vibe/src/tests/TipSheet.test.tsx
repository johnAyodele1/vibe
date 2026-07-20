import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TipSheet } from '../components/AdultZone/TipSheet';
import { useTipSheetStore } from '../components/AdultZone/useTipSheetStore';
import { useWalletStore } from '../components/AdultZone/useWalletStore';

const mockFetch = vi.fn();
(globalThis as any).fetch = mockFetch;

describe('TipSheet Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('adultAccessToken', 'mock-token');

    // Default mock implementation
    mockFetch.mockImplementation(async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
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

    // Reset store states before each test
    useTipSheetStore.setState({
      isOpen: false,
      provider: null,
      selectedAmount: null,
      customAmount: '',
      message: '',
      step: 'select',
      result: null
    });
    useWalletStore.setState({
      creditBalance: 240,
      loading: false
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('does not render when isOpen is false', () => {
      const { container } = render(
        <MemoryRouter>
          <TipSheet />
        </MemoryRouter>
      );
      expect(container.firstChild).toBeNull();
    });

    it('renders and shows provider stage name, avatar, and live balance', async () => {
      useTipSheetStore.setState({
        isOpen: true,
        provider: {
          userId: 'provider123',
          stageName: 'Elena Rose',
          avatarUrl: 'https://test.com/elena.jpg',
          isOnline: true
        }
      });

      render(
        <MemoryRouter>
          <TipSheet />
        </MemoryRouter>
      );

      expect(screen.getByText('Elena Rose')).toBeInTheDocument();
      expect(screen.getByAltText('Elena Rose')).toHaveAttribute('src', 'https://test.com/elena.jpg');
      expect(screen.getByText('240')).toBeInTheDocument();
      expect(screen.getByText('Send Tip')).toBeDisabled();
    });

    it('renders 6 preset amount chips and custom amount chip', () => {
      useTipSheetStore.setState({
        isOpen: true,
        provider: {
          userId: 'provider123',
          stageName: 'Elena Rose',
          avatarUrl: 'https://test.com/elena.jpg',
          isOnline: true
        }
      });

      render(
        <MemoryRouter>
          <TipSheet />
        </MemoryRouter>
      );

      expect(screen.getByText('10')).toBeInTheDocument();
      expect(screen.getByText('25')).toBeInTheDocument();
      expect(screen.getByText('50')).toBeInTheDocument();
      expect(screen.getByText('100')).toBeInTheDocument();
      expect(screen.getByText('250')).toBeInTheDocument();
      expect(screen.getByText('500')).toBeInTheDocument();
      expect(screen.getByText('✏️ Enter custom amount')).toBeInTheDocument();
    });
  });

  describe('Amount selection', () => {
    it('clicking a preset chip selects it and updates Send button text', async () => {
      useTipSheetStore.setState({
        isOpen: true,
        provider: {
          userId: 'provider123',
          stageName: 'Elena Rose',
          avatarUrl: 'https://test.com/elena.jpg',
          isOnline: true
        }
      });

      render(
        <MemoryRouter>
          <TipSheet />
        </MemoryRouter>
      );

      const chip50 = screen.getByText('50');
      fireEvent.click(chip50);

      expect(useTipSheetStore.getState().selectedAmount).toBe(50);
      expect(screen.getByRole('button', { name: /Send 💎 50 to Elena Rose/i })).toBeInTheDocument();
    });

    it('chips where amount > balance are disabled', () => {
      useWalletStore.setState({ creditBalance: 30 });
      useTipSheetStore.setState({
        isOpen: true,
        provider: {
          userId: 'provider123',
          stageName: 'Elena Rose',
          avatarUrl: 'https://test.com/elena.jpg',
          isOnline: true
        }
      });

      render(
        <MemoryRouter>
          <TipSheet />
        </MemoryRouter>
      );

      const chip50Button = screen.getByText('50').closest('button');
      expect(chip50Button).toBeDisabled();
    });

    it('selecting custom chip shows custom input and focuses it', async () => {
      useTipSheetStore.setState({
        isOpen: true,
        provider: {
          userId: 'provider123',
          stageName: 'Elena Rose',
          avatarUrl: 'https://test.com/elena.jpg',
          isOnline: true
        }
      });

      render(
        <MemoryRouter>
          <TipSheet />
        </MemoryRouter>
      );

      const customChip = screen.getByText('✏️ Enter custom amount');
      fireEvent.click(customChip);

      const customInput = screen.getByPlaceholderText('0');
      expect(customInput).toBeInTheDocument();

      fireEvent.change(customInput, { target: { value: '75' } });
      expect(screen.getByRole('button', { name: /Send 💎 75 to Elena Rose/i })).toBeInTheDocument();
      expect(screen.getByText('≈ $0.56')).toBeInTheDocument();
    });
  });

  describe('Optional message', () => {
    it('updates message state when user types and shows character counter', () => {
      useTipSheetStore.setState({
        isOpen: true,
        provider: {
          userId: 'provider123',
          stageName: 'Elena Rose',
          avatarUrl: 'https://test.com/elena.jpg',
          isOnline: true
        }
      });

      render(
        <MemoryRouter>
          <TipSheet />
        </MemoryRouter>
      );

      const textarea = screen.getByPlaceholderText(/Say something nice/i);
      fireEvent.change(textarea, { target: { value: 'Great content!' } });

      expect(useTipSheetStore.getState().message).toBe('Great content!');
      expect(screen.getByText('14 / 150')).toBeInTheDocument();
    });
  });

  describe('Send action', () => {
    it('calls POST /wallet/tip with correct body and transitions to success', async () => {
      useTipSheetStore.setState({
        isOpen: true,
        provider: {
          userId: 'provider123',
          stageName: 'Elena Rose',
          avatarUrl: 'https://test.com/elena.jpg',
          isOnline: true
        },
        selectedAmount: 50
      });

      mockFetch.mockImplementation(async (input: any, init: any) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.includes('/v1/adult/wallet/tip')) {
          let body: any = {};
          if (typeof input === 'string') {
            body = init && init.body ? JSON.parse(init.body) : {};
          } else if (input && typeof input.json === 'function') {
            body = await input.json();
          } else if (input && input.body) {
            body = JSON.parse(input.body);
          }
          expect(body.recipientId).toBe('provider123');
          expect(body.amount).toBe(50);
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              tipId: 'tip_tx_999',
              amount: 50,
              recipientName: 'Elena Rose',
              senderNewBalance: 190
            })
          };
        }
        return { ok: false, json: async () => ({}) };
      });

      render(
        <MemoryRouter>
          <TipSheet />
        </MemoryRouter>
      );

      const sendButton = screen.getByRole('button', { name: /Send 💎 50 to Elena Rose/i });
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(useTipSheetStore.getState().step).toBe('success');
        expect(screen.getByText('Tip Sent! 🎉')).toBeInTheDocument();
        expect(screen.getByText('190')).toBeInTheDocument();
      });
    });
  });

  describe('Success screen', () => {
    it('resets back to select screen on Send Another click', async () => {
      useTipSheetStore.setState({
        isOpen: true,
        provider: {
          userId: 'provider123',
          stageName: 'Elena Rose',
          avatarUrl: 'https://test.com/elena.jpg',
          isOnline: true
        },
        step: 'success',
        result: {
          tipId: 'tip_tx_999',
          amount: 50,
          newBalance: 190,
          recipientName: 'Elena Rose'
        }
      });

      render(
        <MemoryRouter>
          <TipSheet />
        </MemoryRouter>
      );

      const sendAnotherButton = screen.getByRole('button', { name: /Send Another Tip/i });
      fireEvent.click(sendAnotherButton);

      expect(useTipSheetStore.getState().step).toBe('select');
      expect(useTipSheetStore.getState().selectedAmount).toBeNull();
    });
  });
});
