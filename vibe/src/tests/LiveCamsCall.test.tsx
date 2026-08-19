import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import LiveCams from '../components/AdultZone/LiveCams';
import { MemoryRouter } from 'react-router-dom';

// Mock AdultAuthContext
vi.mock('../contexts/AdultAuthContext', () => ({
  useAdultAuth: () => ({
    user: { id: 'member-123', firstName: 'Test Member', role: 'member' },
    isAuthenticated: true,
  }),
}));

// Mock Socket.io client
const mockEmit = vi.fn();
const mockOn = vi.fn();
const mockOff = vi.fn();
const mockDisconnect = vi.fn();

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    emit: mockEmit,
    on: mockOn,
    off: mockOff,
    disconnect: mockDisconnect,
    connected: true,
  })),
}));

// Mock Agora CallRoom & CamViewerRoom
vi.mock('../components/AdultZone/CamViewerRoom', () => ({
  default: () => <div data-testid="mock-cam-viewer-room">CamViewerRoom</div>,
}));

vi.mock('../components/AdultZone/CallRoom', () => ({
  default: () => <div data-testid="mock-call-room">CallRoom</div>,
}));

describe('LiveCams 1-to-1 Video Call Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('adultAccessToken', 'test-token');
  });

  it('renders live session cards and fetches sessions on load', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('/adult/cams?status=live')) {
        return Promise.resolve({
          json: () => Promise.resolve({
            success: true,
            data: {
              sessions: [
                {
                  _id: 'session-1',
                  title: 'Hot Stream',
                  totalViewerCount: 15,
                  providerId: {
                    _id: 'provider-101',
                    username: 'StarPerformer',
                    profilePhoto: 'https://example.com/photo.jpg',
                  },
                },
              ],
            },
          }),
        });
      }
      return Promise.reject(new Error('Unknown url'));
    }));

    await act(async () => {
      render(
        <MemoryRouter>
          <LiveCams />
        </MemoryRouter>
      );
    });

    expect(screen.getByText('StarPerformer')).toBeInTheDocument();
    expect(screen.getByText('Watch Now')).toBeInTheDocument();
  });

  it('opens viewer room and displays 1-to-1 video call button with provider rate', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('/adult/cams?status=live')) {
        return Promise.resolve({
          json: () => Promise.resolve({
            success: true,
            data: {
              sessions: [
                {
                  _id: 'session-1',
                  title: 'Hot Stream',
                  totalViewerCount: 15,
                  providerId: {
                    _id: 'provider-101',
                    username: 'StarPerformer',
                    profilePhoto: 'https://example.com/photo.jpg',
                  },
                },
              ],
            },
          }),
        });
      }
      if (url.includes('/adult/cams/session-1/token')) {
        return Promise.resolve({
          json: () => Promise.resolve({
            token: 'viewer-agora-token',
            appId: 12345,
            roomId: 'cam_provider-101_123',
          }),
        });
      }
      if (url.includes('/v1/adult/providers/provider-101')) {
        return Promise.resolve({
          json: () => Promise.resolve({
            success: true,
            data: {
              id: 'provider-101',
              stageName: 'StarPerformer',
              avatarUrl: 'https://example.com/photo.jpg',
              videoCallPrice: 8,
            },
          }),
        });
      }
      if (url.includes('/wheel')) {
        return Promise.resolve({
          json: () => Promise.resolve({ success: true, data: { isActive: false, items: [] } }),
        });
      }
      return Promise.reject(new Error('Unknown url ' + url));
    }));

    await act(async () => {
      render(
        <MemoryRouter>
          <LiveCams />
        </MemoryRouter>
      );
    });

    const watchBtn = screen.getByText('Watch Now');
    await act(async () => {
      fireEvent.click(watchBtn);
    });

    // Check video call button is rendered inside the viewer room modal
    const callBtn = screen.getByTestId('live-cam-video-call-btn');
    expect(callBtn).toBeInTheDocument();
    expect(callBtn).toHaveTextContent('1-to-1 Call (💎 8/min)');
  });

  it('handles 1-to-1 call creation, shows rate while ringing, and prevents double click', async () => {
    let callInitiatedCount = 0;

    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('/adult/cams?status=live')) {
        return Promise.resolve({
          json: () => Promise.resolve({
            success: true,
            data: {
              sessions: [
                {
                  _id: 'session-1',
                  title: 'Hot Stream',
                  totalViewerCount: 15,
                  providerId: {
                    _id: 'provider-101',
                    username: 'StarPerformer',
                    profilePhoto: 'https://example.com/photo.jpg',
                  },
                },
              ],
            },
          }),
        });
      }
      if (url.includes('/adult/cams/session-1/token')) {
        return Promise.resolve({
          json: () => Promise.resolve({
            token: 'viewer-agora-token',
            appId: 12345,
            roomId: 'cam_provider-101_123',
          }),
        });
      }
      if (url.includes('/v1/adult/providers/provider-101')) {
        return Promise.resolve({
          json: () => Promise.resolve({
            success: true,
            data: {
              id: 'provider-101',
              stageName: 'StarPerformer',
              avatarUrl: 'https://example.com/photo.jpg',
              videoCallPrice: 8,
            },
          }),
        });
      }
      if (url.includes('/wheel')) {
        return Promise.resolve({
          json: () => Promise.resolve({ success: true, data: { isActive: false, items: [] } }),
        });
      }
      if (url.includes('/v1/adult/sext/conversations/start')) {
        return Promise.resolve({
          json: () => Promise.resolve({ success: true, conversationId: 'conv_123' }),
        });
      }
      if (url.includes('/v1/adult/sext/calls/initiate')) {
        callInitiatedCount++;
        return Promise.resolve({
          json: () => Promise.resolve({
            callId: 'call_999',
            roomId: 'room_call_999',
            perMinuteRate: 8,
            status: 'ringing',
          }),
        });
      }
      if (url.includes('/v1/adult/zego/token')) {
        return Promise.resolve({
          json: () => Promise.resolve({ token: 'zego-token', appId: 12345 }),
        });
      }
      return Promise.reject(new Error('Unknown url ' + url));
    }));

    await act(async () => {
      render(
        <MemoryRouter>
          <LiveCams />
        </MemoryRouter>
      );
    });

    // Open watch stream
    await act(async () => {
      fireEvent.click(screen.getByText('Watch Now'));
    });

    const callBtn = screen.getByTestId('live-cam-video-call-btn');

    // Double click
    await act(async () => {
      fireEvent.click(callBtn);
      fireEvent.click(callBtn);
    });

    // Verify only 1 initiate call request was fired (double-click guarded)
    expect(callInitiatedCount).toBe(1);

    // Verify outgoing call ringing overlay is rendered over top of stream with rate
    await waitFor(() => {
      expect(screen.getByText('Requesting 1-to-1 Video Call...')).toBeInTheDocument();
      expect(screen.getByText('Rate: 💎 8 credits / min')).toBeInTheDocument();
    });
  });
});
