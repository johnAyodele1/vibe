import React, { createContext, useContext, useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';

interface AdultUser {
  id: string;
  email: string;
  firstName: string;
  role: 'user' | 'provider';
  credits: number;
}

interface AdultAuthContextType {
  user: AdultUser | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (credentials: any) => Promise<void>;
  signup: (data: any) => Promise<void>;
  logout: () => void;
}

const AdultAuthContext = createContext<AdultAuthContextType | undefined>(undefined);

export const AdultAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AdultUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('adultAccessToken');
      if (token) {
        try {
          const response = await fetch(`${API_BASE_URL}/adult/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const data = await response.json();
          if (data.success) {
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
    checkAuth();
  }, []);

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
    } else {
      throw new Error(data.message || 'Login failed');
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
    } else {
      throw new Error(result.message || 'Signup failed');
    }
  };

  const logout = () => {
    localStorage.removeItem('adultAccessToken');
    setUser(null);
  };

  return (
    <AdultAuthContext.Provider value={{ user, isAuthenticated: !!user, loading, login, signup, logout }}>
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
