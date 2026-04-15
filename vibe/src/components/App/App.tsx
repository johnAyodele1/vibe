import { Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import Onboarding from "../Onboarding/Onboarding";
import ProfileCreation from "../ProfileCreation/ProfileCreation";
import Auth from "../Auth/Auth";
import GoogleCallback from "../Auth/GoogleCallback";
import UserProfileView from "../UserProfileView/UserProfileView";
import Settings from "../Settings/Settings";
import ChatInterface from "../ChatInterface/ChatInterface";
import DirectMessage from "../DirectMessage/DirectMessage";
import Discovery from "../Discovery/Discovery";
import CallManager from "../CallManager/CallManager";
import { useAuth } from "../../contexts/AuthContext";

function App() {
  const { user, isAuthenticated, loading } = useAuth();

  const isProfileComplete = () => {
    if (!user) return false;

    return (
      user.firstName &&
      user.dateOfBirth &&
      user.gender &&
      user.location &&
      user.location.city &&
      user.bio &&
      user.bio.trim().length > 0 &&
      user.photos &&
      user.photos.length >= 2
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <>
      {isAuthenticated && <CallManager />}
      <Routes>
        <Route path="/" element={<Onboarding />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/auth/callback" element={<GoogleCallback />} />

        {/* Protected routes that require authentication */}
        <Route
          path="/profile"
          element={
            isAuthenticated ? (
              <ProfileCreation />
            ) : (
              <Navigate to="/auth" replace />
            )
          }
        />
        <Route
          path="/discovery"
          element={
            isAuthenticated ? (
              isProfileComplete() ? (
                <Discovery />
              ) : (
                <Navigate to="/profile" replace />
              )
            ) : (
              <Navigate to="/auth" replace />
            )
          }
        />
        <Route
          path="/my-profile"
          element={
            isAuthenticated ? (
              isProfileComplete() ? (
                <UserProfileView />
              ) : (
                <Navigate to="/profile" replace />
              )
            ) : (
              <Navigate to="/auth" replace />
            )
          }
        />
        <Route
          path="/settings"
          element={
            isAuthenticated ? (
              isProfileComplete() ? (
                <Settings />
              ) : (
                <Navigate to="/profile" replace />
              )
            ) : (
              <Navigate to="/auth" replace />
            )
          }
        />
        <Route
          path="/chat"
          element={
            isAuthenticated ? (
              isProfileComplete() ? (
                <ChatInterface />
              ) : (
                <Navigate to="/profile" replace />
              )
            ) : (
              <Navigate to="/auth" replace />
            )
          }
        />
        <Route
          path="/direct-message/:conversationId"
          element={
            isAuthenticated ? (
              isProfileComplete() ? (
                <DirectMessage />
              ) : (
                <Navigate to="/profile" replace />
              )
            ) : (
              <Navigate to="/auth" replace />
            )
          }
        />

        {/* Default redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </>
  );
}

export default App;
