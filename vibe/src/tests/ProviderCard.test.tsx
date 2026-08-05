import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdultHome from '../components/AdultZone/AdultHome';
import { useTipSheetStore } from '../components/AdultZone/useTipSheetStore';

const mockFetch = vi.fn();
(globalThis as any).fetch = mockFetch;

vi.mock('../contexts/AdultAuthContext', () => ({
  useAdultAuth: () => ({
    user: { id: 'user1', email: 'member@vibe.com', role: 'user', credits: 240 },
    isAuthenticated: true
  })
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom') as any;
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

describe('Provider Card — Message and Tip actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('adultAccessToken', 'mock-token');

    mockFetch.mockImplementation(async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/adult/providers')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              providers: [
                {
                  _id: 'provider123',
                  userId: 'provider123',
                  displayName: 'Elena Rose',
                  age: 23,
                  country: 'London, UK',
                  profilePhoto: 'https://test.com/elena.jpg',
                  providerProfile: {
                    stageName: 'Elena Rose',
                    isLive: true,
                    rating: { average: 4.9, count: 120 },
                    viewerCount: 245,
                    tags: ['sensual']
                  }
                }
              ]
            }
          })
        };
      }
      return { ok: false, json: async () => ({ error: 'Not Found' }) };
    });

    useTipSheetStore.setState({
      isOpen: false,
      provider: null
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Send Tip button opens TipSheet with correct provider data', async () => {
    render(
      <MemoryRouter>
        <AdultHome />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Elena Rose')).toBeInTheDocument();
    });

    const sendTipButton = screen.getByRole('button', { name: /Send Tip/i });
    fireEvent.click(sendTipButton);

    const storeState = useTipSheetStore.getState();
    expect(storeState.isOpen).toBe(true);
    expect(storeState.provider?.stageName).toBe('Elena Rose');
    expect(storeState.provider?.userId).toBe('provider123');
  });

  it('message icon calls POST /sext/conversations on click and navigates on success', async () => {
    mockFetch.mockImplementation(async (input: any, init: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/adult/providers')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              providers: [
                {
                  _id: 'provider123',
                  userId: 'provider123',
                  displayName: 'Elena Rose',
                  age: 23,
                  country: 'London, UK',
                  profilePhoto: 'https://test.com/elena.jpg',
                  providerProfile: {
                    stageName: 'Elena Rose',
                    isLive: true,
                    rating: { average: 4.9, count: 120 }
                  }
                }
              ]
            }
          })
        };
      }
      if (url.includes('/v1/adult/sext/conversations')) {
        let body: any = {};
        if (typeof input === 'string') {
          body = init && init.body ? JSON.parse(init.body) : {};
        } else if (input && typeof input.json === 'function') {
          body = await input.json();
        } else if (input && input.body) {
          body = JSON.parse(input.body);
        }
        expect(body.recipientId).toBe('provider123');
        return {
          ok: true,
          json: async () => ({
            success: true,
            conversationId: 'user1_provider123'
          })
        };
      }
      return { ok: false, json: async () => ({}) };
    });

    render(
      <MemoryRouter>
        <AdultHome />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Elena Rose')).toBeInTheDocument();
    });

    const messageButton = screen.getByTestId('provider-card-message-btn');
    fireEvent.click(messageButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/adult/sext?conversation=user1_provider123');
    });
  });
});
