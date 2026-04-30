import React, { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";

const GoogleCallback: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { checkAuthStatus } = useAuth();

  const isProfileComplete = (currentUser: any) => {
    if (!currentUser) return false;

    return (
      currentUser.firstName &&
      currentUser.dateOfBirth &&
      currentUser.gender &&
      currentUser.location?.city &&
      currentUser.bio &&
      currentUser.bio.trim().length > 0 &&
      currentUser.photos &&
      currentUser.photos.length >= 2
    );
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const accessToken = params.get("accessToken");
    const refreshToken = params.get("refreshToken");
    const error = params.get("error");

    if (error) {
      toast.error("Google authentication failed");
      navigate("/auth");
      return;
    }

    if (accessToken && refreshToken) {
      localStorage.setItem("accessToken", accessToken);
      localStorage.setItem("refreshToken", refreshToken);

      // Verify authentication and get user data
      checkAuthStatus().then((currentUser) => {
        toast.success("Successfully logged in with Google!");
        navigate(isProfileComplete(currentUser) ? "/discovery" : "/profile");
      });
    } else {
      navigate("/auth");
    }
  }, [location, navigate, checkAuthStatus]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="text-white text-xl">Authenticating with Google...</div>
    </div>
  );
};

export default GoogleCallback;
