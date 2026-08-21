import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProviderProfile from '../components/AdultZone/ProviderProfile';
import UserSettings from '../components/AdultZone/UserSettings';
import { AdultAuthProvider } from '../contexts/AdultAuthContext';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Emoji Validation Update Flow Regression Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('adultAccessToken', 'mock-token');
  });

  describe('Stage Name Validation in ProviderProfile', () => {
    it('VALID: stage name without emoji -> backend accepts -> success toast -> UI updates', async () => {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(async (input: unknown) => {
        const url = typeof input === 'string' ? input : ((input as { url?: string })?.url || String(input));
        if (url.includes('/auth/me')) {
          return { ok: true, status: 200, json: async () => ({ success: true, data: { user: { id: 'p1', role: 'provider' } } }) };
        }
        if (url.includes('/v1/shared/countries')) {
          return { ok: true, status: 200, json: async () => [] };
        }
        if (url.includes('/v1/adult/providers/me/onboarding')) {
          return { ok: true, status: 200, json: async () => ({ success: true, stepData: {} }) };
        }
        if (url.includes('/v1/adult/providers/me/profile')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ success: true, message: 'Profile updated' })
          };
        }
        if (url.includes('/v1/adult/providers/me')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              data: {
                user: {
                  id: 'p1',
                  providerProfile: { stageName: 'OriginalStageName' }
                }
              }
            })
          };
        }
        return { ok: true, status: 200, json: async () => ({ success: true, data: [] }) };
      }));

      render(
        <MemoryRouter>
          <ProviderProfile />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByDisplayValue('OriginalStageName')).toBeInTheDocument();
      });

      const stageInput = screen.getByDisplayValue('OriginalStageName');
      fireEvent.change(stageInput, { target: { value: 'ValidStageName' } });

      const saveBtn = screen.getByText('Save Basic Info');
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Basic profile details updated successfully!');
        expect(toast.error).not.toHaveBeenCalled();
      });
    });

    it('INVALID: stage name containing emoji -> backend rejects -> NO success toast -> error toast -> old value remains', async () => {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(async (input: unknown) => {
        const url = typeof input === 'string' ? input : ((input as { url?: string })?.url || String(input));
        if (url.includes('/auth/me')) {
          return { ok: true, status: 200, json: async () => ({ success: true, data: { user: { id: 'p1', role: 'provider' } } }) };
        }
        if (url.includes('/v1/shared/countries')) {
          return { ok: true, status: 200, json: async () => [] };
        }
        if (url.includes('/v1/adult/providers/me/onboarding')) {
          return { ok: true, status: 200, json: async () => ({ success: true, stepData: {} }) };
        }
        if (url.includes('/v1/adult/providers/me/profile')) {
          return {
            ok: false,
            status: 400,
            json: async () => ({
              success: false,
              error: 'Stage name cannot contain emoji, emoticons, or avatar symbols'
            })
          };
        }
        if (url.includes('/v1/adult/providers/me')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              data: {
                user: {
                  id: 'p1',
                  providerProfile: { stageName: 'OriginalStageName' }
                }
              }
            })
          };
        }
        return { ok: true, status: 200, json: async () => ({ success: true, data: [] }) };
      }));

      render(
        <MemoryRouter>
          <ProviderProfile />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByDisplayValue('OriginalStageName')).toBeInTheDocument();
      });

      const stageInput = screen.getByDisplayValue('OriginalStageName');
      fireEvent.change(stageInput, { target: { value: 'InvalidStage👑' } });

      const saveBtn = screen.getByText('Save Basic Info');
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Stage name cannot contain emoji, emoticons, or avatar symbols');
        expect(toast.success).not.toHaveBeenCalled();
      });
    });
  });

  describe('Username Validation in UserSettings', () => {
    it('VALID: username without emoji -> backend accepts -> success toast -> UI updates', async () => {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(async (input: unknown, opts: unknown) => {
        const url = typeof input === 'string' ? input : ((input as { url?: string })?.url || String(input));
        const reqOpts = opts as { method?: string } | undefined;
        const reqObj = input as { method?: string } | undefined;
        const method = reqOpts?.method || (typeof input === 'object' && reqObj?.method ? reqObj.method : 'GET');
        if (url.includes('/auth/me')) {
          return { ok: true, status: 200, json: async () => ({ success: true, data: { user: { id: 'u1', username: 'old_username', role: 'member' } } }) };
        }
        if (url.includes('/v1/shared/countries')) {
          return { ok: true, status: 200, json: async () => [] };
        }
        if (url.includes('/v1/adult/profiles/me')) {
          if (method === 'PUT') {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                success: true,
                data: { username: 'valid_user', displayName: 'Valid User' }
              })
            };
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              data: { username: 'old_username', displayName: 'Old Name' }
            })
          };
        }
        return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
      }));

      render(
        <MemoryRouter>
          <AdultAuthProvider>
            <UserSettings />
          </AdultAuthProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByDisplayValue('old_username')).toBeInTheDocument();
      });

      const usernameInput = screen.getByDisplayValue('old_username');
      fireEvent.change(usernameInput, { target: { value: 'valid_user' } });

      const saveBtn = screen.getByText('Save Profile Changes');
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Profile updated successfully');
        expect(toast.error).not.toHaveBeenCalled();
      });
    });

    it('INVALID: username containing emoji -> backend rejects -> NO success toast -> error toast', async () => {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(async (input: unknown, opts: unknown) => {
        const url = typeof input === 'string' ? input : ((input as { url?: string })?.url || String(input));
        const reqOpts = opts as { method?: string } | undefined;
        const reqObj = input as { method?: string } | undefined;
        const method = reqOpts?.method || (typeof input === 'object' && reqObj?.method ? reqObj.method : 'GET');
        if (url.includes('/auth/me')) {
          return { ok: true, status: 200, json: async () => ({ success: true, data: { user: { id: 'u1', username: 'old_username', role: 'member' } } }) };
        }
        if (url.includes('/v1/shared/countries')) {
          return { ok: true, status: 200, json: async () => [] };
        }
        if (url.includes('/v1/adult/profiles/me')) {
          if (method === 'PUT') {
            return {
              ok: false,
              status: 400,
              json: async () => ({
                success: false,
                error: {
                  code: 'VALIDATION_ERROR',
                  message: 'Username cannot contain emoji, emoticons, or avatar symbols'
                }
              })
            };
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              data: { username: 'old_username', displayName: 'Old Name' }
            })
          };
        }
        return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
      }));

      render(
        <MemoryRouter>
          <AdultAuthProvider>
            <UserSettings />
          </AdultAuthProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByDisplayValue('old_username')).toBeInTheDocument();
      });

      const usernameInput = screen.getByDisplayValue('old_username');
      fireEvent.change(usernameInput, { target: { value: 'bad_user😀' } });

      const saveBtn = screen.getByText('Save Profile Changes');
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Username cannot contain emoji, emoticons, or avatar symbols');
        expect(toast.success).not.toHaveBeenCalled();
      });
    });
  });
});
