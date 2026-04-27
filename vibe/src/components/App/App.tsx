import { Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import Onboarding from "../Onboarding/Onboarding";
import ProfileCreation from "../ProfileCreation/ProfileCreation";
import Auth from "../Auth/Auth";
import GoogleCallback from "../Auth/GoogleCallback";
import UserProfileView from "../UserProfileView/UserProfileView";
import PublicProfileView from "../UserProfileView/PublicProfileView";
import Settings from "../Settings/Settings";
import ChatInterface from "../ChatInterface/ChatInterface";
import DirectMessage from "../DirectMessage/DirectMessage";
import Discovery from "../Discovery/Discovery";
import Favourites from "../Favourites/Favourites";
import CallManager from "../CallManager/CallManager";
import AdminDashboard from "../Admin/AdminDashboard";
import AdminLogin from "../Admin/AdminLogin";
import LoadingScreen from "../LoadingScreen/LoadingScreen";
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
    return <LoadingScreen />;
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
          path="/favourites"
          element={
            isAuthenticated ? (
              isProfileComplete() ? (
                <Favourites />
              ) : (
                <Navigate to="/profile" replace />
              )
            ) : (
              <Navigate to="/auth" replace />
            )
          }
        />
        <Route
          path="/discovery"
          element={
            isAuthenticated ? (
              <Discovery />
            ) : (
              <Navigate to="/auth" replace />
            )
          }
        />
        <Route
          path="/user/:userId"
          element={
            isAuthenticated ? (
              isProfileComplete() ? (
                <PublicProfileView />
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
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route
          path="/admin"
          element={
            isAuthenticated ? (
              <AdminDashboard />
            ) : (
              <Navigate to="/admin/login" replace />
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
