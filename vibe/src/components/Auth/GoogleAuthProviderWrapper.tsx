import React, { useEffect, useState } from "react";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { API_BASE_URL } from "../../config";

interface GoogleAuthProviderWrapperProps {
  children: React.ReactNode;
}

const GoogleAuthProviderWrapper: React.FC<GoogleAuthProviderWrapperProps> = ({
  children,
}) => {
  const [clientId, setClientId] = useState<string>(
    import.meta.env.VITE_GOOGLE_CLIENT_ID ||
      import.meta.env.GOOGLE_CLIENT_ID ||
      ""
  );
  const [loading, setLoading] = useState(!clientId);

  useEffect(() => {
    if (!clientId) {
      const fetchClientId = async () => {
        try {
          const response = await fetch(`${API_BASE_URL}/auth/google-client-id`);
          const data = await response.json();
          if (data.success && data.data.clientId) {
            setClientId(data.data.clientId);
          }
        } catch (error) {
          console.error("Failed to fetch Google Client ID:", error);
        } finally {
          setLoading(false);
        }
      };

      fetchClientId();
    }
  }, [clientId]);

  if (loading) {
    return null; // Or a loading spinner
  }

  if (!clientId) {
    return <>{children}</>;
  }

  return (
    <GoogleOAuthProvider clientId={clientId}>{children}</GoogleOAuthProvider>
  );
};

export default GoogleAuthProviderWrapper;
