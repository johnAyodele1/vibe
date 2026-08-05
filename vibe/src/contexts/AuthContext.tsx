import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { API_BASE_URL } from "../config";

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

interface User {
  _id: string;
  firstName?: string;
  dateOfBirth?: string;
  gender?: string;
  location?: {
    city?: string;
  };
  bio?: string;
  photos?: any[];
  profileCompletion?: number;
  fcmTokens?: string[];
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<User | null>;
  signup: (userData: any) => Promise<User | null>;
  googleLogin: (idToken: string) => Promise<User | null>;
  logout: () => void;
  checkAuthStatus: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkAuthStatus = async (): Promise<User | null> => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      setLoading(false);
      setIsAuthenticated(false);
      return null;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/users/profile`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (data.success) {
        setUser(data.data.user);
        setIsAuthenticated(true);
        return data.data.user;
      }

      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      setIsAuthenticated(false);
      return null;
    } catch (error) {
      console.error("Auth check error:", error);
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      setIsAuthenticated(false);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string): Promise<User | null> => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (data.success) {
        localStorage.setItem("accessToken", data.data.tokens.accessToken);
        localStorage.setItem("refreshToken", data.data.tokens.refreshToken);
        setUser(data.data.user || null);
        setIsAuthenticated(true);
        return data.data.user || null;
      }
      const errMsg = extractErrorMessage(data);
      throw new Error(errMsg);
    } catch (error) {
      console.error("Login error:", error);
      throw error;
    }
  };

  const googleLogin = async (idToken: string): Promise<User | null> => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/google`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ idToken }),
      });

      const data = await response.json();

      if (data.success) {
        localStorage.setItem("accessToken", data.data.tokens.accessToken);
        localStorage.setItem("refreshToken", data.data.tokens.refreshToken);
        setUser(data.data.user || null);
        setIsAuthenticated(true);
        return data.data.user || null;
      }
      const errMsg = extractErrorMessage(data);
      throw new Error(errMsg);
    } catch (error) {
      console.error("Google login error:", error);
      throw error;
    }
  };

  const signup = async (userData: any): Promise<User | null> => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(userData),
      });

      const data = await response.json();

      if (data.success) {
        localStorage.setItem("accessToken", data.data.tokens.accessToken);
        localStorage.setItem("refreshToken", data.data.tokens.refreshToken);
        setUser(data.data.user || null);
        setIsAuthenticated(true);
        return data.data.user || null;
      }
      const errMsg = extractErrorMessage(data);
      throw new Error(errMsg);
    } catch (error) {
      console.error("Signup error:", error);
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    setUser(null);
    setIsAuthenticated(false);
  };

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const value: AuthContextType = {
    user,
    isAuthenticated,
    loading,
    login,
    signup,
    googleLogin,
    logout,
    checkAuthStatus,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
