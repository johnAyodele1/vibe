import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { API_BASE_URL } from '../../config';
import { useAdultAuth } from '../../contexts/AdultAuthContext';
import LoadingScreen from '../LoadingScreen/LoadingScreen';

interface Props {
  children: React.ReactNode;
}

/**
 * Provider onboarding is persisted by the backend. This guard resolves that
 * state before allowing access to provider-only application pages so a
 * partially onboarded provider cannot bypass onboarding after a reload.
 */
const ProviderOnboardingGuard: React.FC<Props> = ({ children }) => {
  const { user, isAuthenticated, loading: authLoading } = useAdultAuth();
  const [checking, setChecking] = useState(true);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated || user?.role !== 'provider') {
      setChecking(false);
      return;
    }

    const token = localStorage.getItem('adultAccessToken');
    if (!token) {
      setChecking(false);
      return;
    }

    let cancelled = false;

    const checkOnboarding = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/v1/adult/providers/me/onboarding`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const result = await response.json();

        if (!cancelled && response.ok && result.success) {
          const data = result.data || result;
          setIsComplete(data.isComplete === true);
        }
      } catch (error) {
        console.error('Provider onboarding check failed:', error);
      } finally {
        if (!cancelled) setChecking(false);
      }
    };

    void checkOnboarding();

    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated, user?.role]);

  if (authLoading || checking) return <LoadingScreen />;
  if (!isAuthenticated || user?.role !== 'provider') return <Navigate to="/" replace />;
  if (!isComplete) return <Navigate to="/adult/provider/onboarding" replace />;

  return <>{children}</>;
};

export default ProviderOnboardingGuard;
