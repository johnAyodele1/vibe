import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, act, fireEvent, waitFor, cleanup } from '@testing-library/react';
import LiveCams from '../components/AdultZone/LiveCams';
import { AdultCallProvider, normalizeCallError } from '../components/AdultZone/AdultCallContext';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

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

describe('LiveCams 1-to-1 Video Call Flow & Error Handling Regression Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('adultAccessToken', 'test-token');
  });

  afterEach(() => {
    cleanup();
  });

  describe('Call Error Normalization Unit & Fallback Tests', () => {
    it('1. Insufficient balance / credits mapping', () => {
      const result = normalizeCallError('Insufficient credits to start call');
      expect(result).toBe('Insufficient credits to start call. Please top up your wallet.');
    });

    it('2. Provider busy mapping', () => {
      const result = normalizeCallError('This provider is busy. Try again later.');
      expect(result).toBe('This provider is busy. Try again later.');
    });

    it('3. Caller already active mapping', () => {
      const result = normalizeCallError('You are already on a call on another device.');
      expect(result).toBe('You are already on a call on another device.');
    });

    it('4. Token acquisition failure mapping', () => {
      const result = normalizeCallError('Failed to obtain call connection token');
      expect(result).toBe('Failed to obtain call connection token');
    });

    it('5. Malformed/unexpected backend response returns safe generic fallback', () => {
      expect(normalizeCallError(null)).toBe('Failed to initiate call.');
      expect(normalizeCallError({})).toBe('Failed to initiate call.');
      expect(normalizeCallError({ unknownField: 999 })).toBe('Failed to initiate call.');
      expect(normalizeCallError('')).toBe('Failed to initiate call.');
    });

    it('6. Literal Zod/schema error "This string does not match the expected pattern" is NEVER surfaced directly', () => {
      const errString = 'This string does not match the expected pattern';
      const result = normalizeCallError(errString);
      expect(result).not.toContain('pattern');
      expect(result).toBe('Failed to initiate call.');
    });
  });

  describe('Provider Dynamic Rate Determination Tests', () => {
    const ratesToTest = [10, 25, 100];

    ratesToTest.forEach((rate) => {
      it(`respects provider configured rate = ${rate} diamonds`, async () => {
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
                  videoCallPrice: rate,
                },
              }),
            });
          }
          if (url.includes('/wheel')) {
            return Promise.resolve({
              json: () => Promise.resolve({ success: true, data: { isActive: false, items: [] } }),
            });
          }
          if (url.includes('/v1/adult/sext/conversations')) {
            return Promise.resolve({
              json: () => Promise.resolve({ success: true, conversationId: 'conv_123' }),
            });
          }
          if (url.includes('/v1/adult/sext/calls/initiate')) {
            return Promise.resolve({
              json: () => Promise.resolve({
                callId: 'call-xyz',
                webrtcRoomId: 'room-xyz',
                perMinuteRate: rate,
              }),
            });
          }
          if (url.includes('/v1/adult/zego/token')) {
            return Promise.resolve({
              json: () => Promise.resolve({ token: 'zego-call-token', appId: 12345 }),
            });
          }
          return Promise.reject(new Error('Unknown url ' + url));
        }));

        await act(async () => {
          render(
            <MemoryRouter>
              <AdultCallProvider>
                <LiveCams />
              </AdultCallProvider>
            </MemoryRouter>
          );
        });

        await act(async () => {
          fireEvent.click(screen.getByText('Watch Now'));
        });

        const callBtn = screen.getByTestId('live-cam-video-call-btn');
        await act(async () => {
          fireEvent.click(callBtn);
        });

        await waitFor(() => {
          expect(screen.getByTestId('global-outgoing-call-modal')).toBeInTheDocument();
          expect(screen.getByText(`Rate: 💎 ${rate} credits / min`)).toBeInTheDocument();
        });
      });
    });

    it('regression: does not default to hardcoded 5 when provider rate is 0 or explicit', async () => {
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
                videoCallPrice: 42,
              },
            }),
          });
        }
        if (url.includes('/wheel')) {
          return Promise.resolve({
            json: () => Promise.resolve({ success: true, data: { isActive: false, items: [] } }),
          });
        }
        if (url.includes('/v1/adult/sext/conversations')) {
          return Promise.resolve({
            json: () => Promise.resolve({ success: true, conversationId: 'conv_123' }),
          });
        }
        if (url.includes('/v1/adult/sext/calls/initiate')) {
          return Promise.resolve({
            json: () => Promise.resolve({
              callId: 'call-42',
              webrtcRoomId: 'room-42',
              perMinuteRate: 42,
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
            <AdultCallProvider>
              <LiveCams />
            </AdultCallProvider>
          </MemoryRouter>
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByText('Watch Now'));
      });

      const callBtn = screen.getByTestId('live-cam-video-call-btn');
      await act(async () => {
        fireEvent.click(callBtn);
      });

      await waitFor(() => {
        expect(screen.queryByText('Rate: 💎 5 credits / min')).not.toBeInTheDocument();
        expect(screen.getByText('Rate: 💎 42 credits / min')).toBeInTheDocument();
      });
    });
  });

  describe('Live Cams Call Initiation UI & Toast Tests', () => {
    it('displays clear insufficient balance toast when credits are depleted', async () => {
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
        if (url.includes('/v1/adult/sext/conversations')) {
          return Promise.resolve({
            json: () => Promise.resolve({ success: true, conversationId: 'conv_123' }),
          });
        }
        if (url.includes('/v1/adult/sext/calls/initiate')) {
          return Promise.resolve({
            json: () => Promise.resolve({
              success: false,
              error: 'Insufficient credits to start call'
            }),
          });
        }
        return Promise.reject(new Error('Unknown url ' + url));
      }));

      await act(async () => {
        render(
          <MemoryRouter>
            <AdultCallProvider>
              <LiveCams />
            </AdultCallProvider>
          </MemoryRouter>
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByText('Watch Now'));
      });

      const callBtn = screen.getByTestId('live-cam-video-call-btn');
      await act(async () => {
        fireEvent.click(callBtn);
      });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Insufficient credits to start call. Please top up your wallet.');
      });
    });

    it('displays provider busy message when provider is already on a call', async () => {
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
        if (url.includes('/v1/adult/sext/conversations')) {
          return Promise.resolve({
            json: () => Promise.resolve({ success: true, conversationId: 'conv_123' }),
          });
        }
        if (url.includes('/v1/adult/sext/calls/initiate')) {
          return Promise.resolve({
            json: () => Promise.resolve({
              success: false,
              error: 'This provider is busy. Try again later.'
            }),
          });
        }
        return Promise.reject(new Error('Unknown url ' + url));
      }));

      await act(async () => {
        render(
          <MemoryRouter>
            <AdultCallProvider>
              <LiveCams />
            </AdultCallProvider>
          </MemoryRouter>
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByText('Watch Now'));
      });

      const callBtn = screen.getByTestId('live-cam-video-call-btn');
      await act(async () => {
        fireEvent.click(callBtn);
      });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('This provider is busy. Try again later.');
      });
    });

    it('NEVER surfaces "This string does not match the expected pattern" when schema error occurs', async () => {
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
        if (url.includes('/v1/adult/sext/conversations')) {
          return Promise.resolve({
            json: () => Promise.resolve({
              success: false,
              error: 'This string does not match the expected pattern'
            }),
          });
        }
        return Promise.reject(new Error('Unknown url ' + url));
      }));

      await act(async () => {
        render(
          <MemoryRouter>
            <AdultCallProvider>
              <LiveCams />
            </AdultCallProvider>
          </MemoryRouter>
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByText('Watch Now'));
      });

      const callBtn = screen.getByTestId('live-cam-video-call-btn');
      await act(async () => {
        fireEvent.click(callBtn);
      });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to initiate call.');
        expect(toast.error).not.toHaveBeenCalledWith(expect.stringContaining('expected pattern'));
      });
    });
  });
});
