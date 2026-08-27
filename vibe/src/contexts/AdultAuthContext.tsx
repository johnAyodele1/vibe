/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';
import { toast } from 'sonner';
import { syncDeviceRegistration, deregisterDevice } from '../lib/pwa/subscriptionManager';

interface ApiErrorDetail { message?: string; path?: string[] | string; msg?: string; param?: string; }
interface ApiResponseData { error?: string | { message?: string; details?: ApiErrorDetail[] }; details?: ApiErrorDetail[]; errors?: ApiErrorDetail[] | Record<string, unknown>; message?: string; }

const formatFieldName = (path: string[] | string | undefined): string => {
  if (!path) return '';
  const value = Array.isArray(path) ? path[path.length - 1] : path;
  if (!value) return '';
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
};

const formatDetail = (issue: ApiErrorDetail): string => {
  const message = issue.message || issue.msg;
  if (!message) return '';
  const field = formatFieldName(issue.path || issue.param);
  return field ? `${field}: ${message}` : message;
};

export function extractErrorMessage(data: ApiResponseData | unknown): string {
  if (!data || typeof data !== 'object') {
    return typeof data === 'string' && data.trim() ? data : 'Request failed';
  }

  const payload = data as ApiResponseData;
  const detailsList: string[] = [];

  if (typeof payload.error === 'string' && payload.error.trim()) {
    detailsList.push(payload.error.trim());
  }

  const nestedError = payload.error && typeof payload.error === 'object' ? payload.error : undefined;
  const details = nestedError?.details || payload.details;
  if (Array.isArray(details)) {
    details.forEach(issue => {
      const formatted = formatDetail(issue);
      if (formatted) detailsList.push(formatted);
    });
  }

  if (Array.isArray(payload.errors)) {
    payload.errors.forEach(issue => {
      const formatted = formatDetail(issue);
      if (formatted) detailsList.push(formatted);
    });
  } else if (payload.errors && typeof payload.errors === 'object') {
    Object.entries(payload.errors).forEach(([field, value]) => {
      if (typeof value === 'string' && value.trim()) {
        detailsList.push(`${formatFieldName(field)}: ${value}`);
      } else if (Array.isArray(value)) {
        value.forEach(item => {
          if (typeof item === 'string' && item.trim()) {
            detailsList.push(`${formatFieldName(field)}: ${item}`);
          }
        });
      }
    });
  }

  if (detailsList.length > 0) return [...new Set(detailsList)].join('; ');
  if (nestedError?.message) return nestedError.message;
  if (payload.message) return payload.message;
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
