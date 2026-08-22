/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';
import { toast } from 'sonner';
import { syncDeviceRegistration, deregisterDevice } from '../lib/pwa/subscriptionManager';

interface ApiErrorDetail { message?: string; path?: string[] | string; msg?: string; param?: string; }
interface ApiResponseData { error?: { message?: string; details?: ApiErrorDetail[] }; details?: ApiErrorDetail[]; errors?: ApiErrorDetail[]; message?: string; }
export function extractErrorMessage(data: ApiResponseData): string {
  if (!data) return 'An unknown error occurred';
  const detailsList: string[] = [];
  const details = data.error?.details || data.details;
  if (Array.isArray(details)) details.forEach((issue) => { if (issue.message) { const field = Array.isArray(issue.path) ? issue.path[issue.path.length - 1] : ''; detailsList.push(`${field ? `${field}: ` : ''}${issue.message}`); } });
  const errors = data.errors;
  if (Array.isArray(errors)) errors.forEach((err) => { if (err.msg) { const field = err.path || err.param; detailsList.push(`${field ? `${field}: ` : ''}${err.msg}`); } });
  if (detailsList.length > 0) return detailsList.join('; ');
  if (data.error?.message) return data.error.message;
  if (data.message) return data.message;
  return 'Request failed';
}

interface AdultUser { id: string; email: string; firstName: string; role: 'user' | 'provider'; credits: number; profilePhoto?: string; subscriptionTier?: 'none' | 'gold' | 'platinum' | 'diamond'; }
interface AdultAuthContextType { user: AdultUser | null; isAuthenticated: boolean; loading: boolean; login: (credentials: Record<string, unknown>) => Promise<AdultUser>; signup: (data: Record<string, unknown>) => Promise<AdultUser>; logout: () => void; refetchUser: () => Promise<void>; updateCredits: (credits: number) => void; }
const AdultAuthContext = createContext<AdultAuthContextType | undefined>(undefined);

export const AdultAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AdultUser | null>(null);
  const [loading, setLoading] = useState(true);
  const checkAuth = async () => {
    const token = localStorage.getItem('adultAccessToken');
    if (token) {
      try {
        const response = await fetch(`${API_BASE_URL}/adult/auth/me`, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        if (response.status === 401 || !data.success) {
          localStorage.removeItem('adultAccessToken'); setUser(null); toast.error('Session expired. Kindly relogin.', { id: 'session-expired' }); window.dispatchEvent(new CustomEvent('open-adult-auth-modal'));
        } else if (data.success) {
          setUser(data.data.user); syncDeviceRegistration(data.data.user.id).catch(console.error);
        } else localStorage.removeItem('adultAccessToken');
      } catch (error) { console.error('Adult auth check failed:', error); }
    }
    setLoading(false);
  };
  useEffect(() => { const load = async () => { await checkAuth(); }; void load(); }, []);
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (response.status === 401) {
        const token = localStorage.getItem('adultAccessToken');
        if (token) { localStorage.removeItem('adultAccessToken'); setUser(null); toast.error('Session expired. Kindly relogin.', { id: 'session-expired' }); window.dispatchEvent(new CustomEvent('open-adult-auth-modal')); }
      }
      return response;
    };
    return () => { window.fetch = originalFetch; };
  }, []);
  const updateCredits = (credits: number) => setUser(prev => prev ? { ...prev, credits } : null);
  const login = async (credentials: Record<string, unknown>) => {
    const response = await fetch(`${API_BASE_URL}/adult/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
    const data = await response.json();
    if (!data.success) throw new Error(extractErrorMessage(data));
    localStorage.setItem('adultAccessToken', data.data.tokens.accessToken);
    setUser(data.data.user);
    syncDeviceRegistration(data.data.user.id).catch(console.error);
    localStorage.setItem(`zippo_push_test_after_login:${data.data.user.id}`, '1');
    return data.data.user;
  };
  const signup = async (data: Record<string, unknown>) => {
    const response = await fetch(`${API_BASE_URL}/adult/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const result = await response.json();
    if (!result.success) throw new Error(extractErrorMessage(result));
    localStorage.setItem('adultAccessToken', result.data.tokens.accessToken); setUser(result.data.user); syncDeviceRegistration(result.data.user.id).catch(console.error); return result.data.user;
  };
  const logout = () => { deregisterDevice().catch(console.error); localStorage.removeItem('adultAccessToken'); setUser(null); };
  return <AdultAuthContext.Provider value={{ user, isAuthenticated: !!user, loading, login, signup, logout, refetchUser: checkAuth, updateCredits }}>{children}</AdultAuthContext.Provider>;
};
export const useAdultAuth = () => { const context = useContext(AdultAuthContext); if (context === undefined) throw new Error('useAdultAuth must be used within an AdultAuthProvider'); return context; };
