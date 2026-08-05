import React, { createContext, useContext, useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';
import { toast } from 'sonner';

export function extractErrorMessage(data: any): string {
  if (!data) return 'An unknown error occurred';

  let detailsList: string[] = [];

  // Zod validation details
  const details = data.error?.details || data.details;
  if (Array.isArray(details)) {
    details.forEach((issue: any) => {
      if (issue.message) {
        const field = Array.isArray(issue.path) ? issue.path[issue.path.length - 1] : '';
        const fieldName = field ? `${field}: ` : '';
        detailsList.push(`${fieldName}${issue.message}`);
      }
    });
  }

  // Express validator errors
  const errors = data.errors;
  if (Array.isArray(errors)) {
    errors.forEach((err: any) => {
      if (err.msg) {
        const field = err.path || err.param;
        const fieldName = field ? `${field}: ` : '';
        detailsList.push(`${fieldName}${err.msg}`);
      }
    });
  }

  if (detailsList.length > 0) {
    return detailsList.join('; ');
  }

  // Fallback to main message
  if (data.error?.message) {
    return data.error.message;
  }
  if (data.message) {
    return data.message;
  }

  return 'Request failed';
}

interface AdultUser {
  id: string;
  email: string;
  firstName: string;
  role: 'user' | 'provider';
  credits: number;
  profilePhoto?: string;
  subscriptionTier?: 'none' | 'gold' | 'platinum' | 'diamond';
}

interface AdultAuthContextType {
  user: AdultUser | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (credentials: any) => Promise<any>;
  signup: (data: any) => Promise<any>;
  logout: () => void;
  refetchUser: () => Promise<void>;
  updateCredits: (credits: number) => void;
}

const AdultAuthContext = createContext<AdultAuthContextType | undefined>(undefined);

export const AdultAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AdultUser | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = async () => {
    const token = localStorage.getItem('adultAccessToken');
    if (token) {
      try {
        const response = await fetch(`${API_BASE_URL}/adult/auth/me`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (response.status === 401 || !data.success) {
          localStorage.removeItem('adultAccessToken');
          setUser(null);
          toast.error('Session expired. Kindly relogin.', { id: 'session-expired' });
          window.dispatchEvent(new CustomEvent('open-adult-auth-modal'));
        } else if (data.success) {
          setUser(data.data.user);
        } else {
          localStorage.removeItem('adultAccessToken');
        }
      } catch (error) {
        console.error('Adult auth check failed:', error);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    checkAuth();
  }, []);

  // Global fetch interceptor to handle any unhandled 401 (Session Expired) errors
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (response.status === 401) {
        const token = localStorage.getItem('adultAccessToken');
        if (token) {
          localStorage.removeItem('adultAccessToken');
          setUser(null);
          toast.error('Session expired. Kindly relogin.', { id: 'session-expired' });
          window.dispatchEvent(new CustomEvent('open-adult-auth-modal'));
        }
      }
      return response;
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  const updateCredits = (credits: number) => {
    setUser(prev => prev ? { ...prev, credits } : null);
  };

  const login = async (credentials: any) => {
    const response = await fetch(`${API_BASE_URL}/adult/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });
    const data = await response.json();
    if (data.success) {
      localStorage.setItem('adultAccessToken', data.data.tokens.accessToken);
      setUser(data.data.user);
      return data.data.user;
    } else {
      const errMsg = extractErrorMessage(data);
      throw new Error(errMsg);
    }
  };

  const signup = async (data: any) => {
    const response = await fetch(`${API_BASE_URL}/adult/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await response.json();
    if (result.success) {
      localStorage.setItem('adultAccessToken', result.data.tokens.accessToken);
      setUser(result.data.user);
      return result.data.user;
    } else {
      const errMsg = extractErrorMessage(result);
      throw new Error(errMsg);
    }
  };

  const logout = () => {
    localStorage.removeItem('adultAccessToken');
    setUser(null);
  };

  return (
    <AdultAuthContext.Provider value={{ user, isAuthenticated: !!user, loading, login, signup, logout, refetchUser: checkAuth, updateCredits }}>
      {children}
    </AdultAuthContext.Provider>
  );
};

export const useAdultAuth = () => {
  const context = useContext(AdultAuthContext);
  if (context === undefined) {
    throw new Error('useAdultAuth must be used within an AdultAuthProvider');
  }
  return context;
};
