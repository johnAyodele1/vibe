import { useEffect } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
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
import AdminRewardsPage from "../Admin/AdminRewardsPage";
import AdminAnalytics from "../Admin/AdminAnalytics";
import AdminPayoutsPage from "../Admin/AdminPayoutsPage";
import AdminErrorsPage from "../Admin/AdminErrorsPage";
import LoadingScreen from "../LoadingScreen/LoadingScreen";
import AdultZoneLayout from "../AdultZone/AdultZoneLayout";
import AdultHome from "../AdultZone/AdultHome";
import LiveCams from "../AdultZone/LiveCams";
import NaughtyRooms from "../AdultZone/NaughtyRooms";
import PrivateSext from "../AdultZone/PrivateSext";
import RandomStranger from "../AdultZone/RandomStranger";
import HookUpTonight from "../AdultZone/HookUpTonight";
import VIPLounge from "../AdultZone/VIPLounge";
import Wallet from "../AdultZone/Wallet";
import PublicProviderProfile from "../AdultZone/PublicProviderProfile";
import ProviderOnboarding from "../AdultZone/ProviderOnboarding";
import ProviderDashboard from "../AdultZone/ProviderDashboard";
import ProviderEarnings from "../AdultZone/ProviderEarnings";
import ProviderMessages from "../AdultZone/ProviderMessages";
import ProviderLive from "../AdultZone/ProviderLive";
import ProviderProfile from "../AdultZone/ProviderProfile";
import ProviderSettings from "../AdultZone/ProviderSettings";
import ProviderPayout from "../AdultZone/ProviderPayout";
import { useAuth } from "../../contexts/AuthContext";
import { useAdultAuth } from "../../contexts/AdultAuthContext";
import { API_BASE_URL } from "../../config";
import { getOrCreateDeviceId } from "../../lib/pwa/deviceId";
import ScrollToTop from "./ScrollToTop";

function App() {
  const navigate = useNavigate();
  const { user, isAuthenticated, loading } = useAuth();
  const { user: adultUser, isAuthenticated: adultIsAuthenticated } = useAdultAuth();
  const isAdminAuthenticated =
    typeof window !== "undefined" &&
    localStorage.getItem("isAdminAuthenticated") === "true";

  const isProfileComplete = (currentUser = user) => {
    if (!currentUser) return false;

    const requiredProfileFields =
      currentUser.location?.city &&
      currentUser.bio &&
      currentUser.bio.trim().length > 0 &&
      currentUser.photos &&
      currentUser.photos.length >= 2;

    if (typeof currentUser.profileCompletion === 'number') {
      return currentUser.profileCompletion >= 80 || Boolean(requiredProfileFields);
    }

    return Boolean(requiredProfileFields);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem('siteVisitTracked')) return;

    fetch(`${API_BASE_URL}/analytics/visit`, {
      method: 'POST',
    })
      .then(() => sessionStorage.setItem('siteVisitTracked', 'true'))
      .catch((error) => console.error('Visit tracking failed:', error));
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // Listen for SW telling us it updated
    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SW_UPDATED') {
        console.log('[App] New service worker version:', event.data.version);
        // Reload the page to get fresh assets
        // In PWA this is the only way to get the new version
        window.location.reload();
      }

      if (event.data?.type === 'NAVIGATE' && event.data.url) {
        navigate(event.data.url);
      }

      if (event.data?.type === 'PUSH_SUBSCRIPTION_CHANGED') {
        const token = localStorage.getItem('adultAccessToken') || localStorage.getItem('accessToken');
        if (token) {
          const deviceId = getOrCreateDeviceId();
          fetch(`${API_BASE_URL}/v1/adult/push/token`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              deviceId,
              subscription: event.data.subscription,
            })
          })
            .then(res => res.json())
            .then(data => console.log('[Push] Token refreshed after SW change:', data))
            .catch(err => console.error('[Push] Token refresh failed:', err.message));
        }
      }
    };

    navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);

    // Also check for updates when app comes to foreground
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        navigator.serviceWorker.ready.then(registration => {
          registration.update().catch(err => console.warn('[App] SW update check failed:', err));
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [navigate]);

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <>
      <ScrollToTop />
      {isAuthenticated && <CallManager />}
      <Routes>
        {/* Adult Zone is now the main layout at / */}
        <Route path="/" element={<AdultZoneLayout />}>
          <Route index element={adultIsAuthenticated && adultUser?.role === 'provider' ? <Navigate to="/adult/provider/dashboard" replace /> : <AdultHome />} />
          <Route path="cams" element={<LiveCams />} />
          <Route path="rooms" element={<NaughtyRooms />} />
          <Route path="rooms/:roomId" element={<NaughtyRooms />} />
          <Route path="sext" element={<PrivateSext />} />
          <Route path="sext/:conversationId" element={<PrivateSext />} />
          <Route path="adult/sext" element={<PrivateSext />} />
          <Route path="adult/sext/:conversationId" element={<PrivateSext />} />
          <Route path="random" element={<RandomStranger />} />
          <Route path="hookup" element={<HookUpTonight />} />
          <Route path="vip" element={<VIPLounge />} />
          <Route path="wallet" element={<Wallet />} />
          <Route path="adult/providers/:providerId" element={<PublicProviderProfile />} />

          {/* Provider studio routes nested under main layouts */}
          <Route path="adult/provider/onboarding" element={<ProviderOnboarding />} />
          <Route path="adult/provider/dashboard" element={<ProviderDashboard />} />
          <Route path="adult/provider/earnings" element={<ProviderEarnings />} />
          <Route path="adult/provider/messages" element={<ProviderMessages />} />
          <Route path="adult/provider/live" element={<ProviderLive />} />
          <Route path="adult/provider/profile" element={<ProviderProfile />} />
          <Route path="adult/provider/settings" element={<ProviderSettings />} />
          <Route path="adult/provider/payout" element={<ProviderPayout />} />
        </Route>

        {/* Dating App onboarding and entry path */}
        <Route
          path="/dating"
          element={
            isAuthenticated ? (
              isProfileComplete() ? (
                <Navigate to="/discovery" replace />
              ) : (
                <Navigate to="/profile" replace />
              )
            ) : (
              <Onboarding />
            )
          }
        />
        <Route
          path="/admin/errors"
          element={
            isAdminAuthenticated ? (
              <AdminErrorsPage />
            ) : (
              <Navigate to="/admin/login" replace />
            )
          }
        />
        <Route
          path="/admin/payouts"
          element={
            isAdminAuthenticated ? (
              <AdminPayoutsPage />
            ) : (
              <Navigate to="/admin/login" replace />
            )
          }
        />
        <Route
          path="/admin/analytics"
          element={
            isAdminAuthenticated ? (
              <AdminAnalytics />
            ) : (
              <Navigate to="/admin/login" replace />
            )
          }
        />
        <Route
          path="/admin/rewards"
          element={
            isAdminAuthenticated ? (
              <AdminRewardsPage />
            ) : (
              <Navigate to="/admin/login" replace />
            )
          }
        />

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
            isAdminAuthenticated ? (
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
