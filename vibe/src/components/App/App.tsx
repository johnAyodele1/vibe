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
import UserSettings from "../AdultZone/UserSettings";
import NotificationPrompt from "../pwa/NotificationPrompt";
import { useAuth } from "../../contexts/AuthContext";
import { useAdultAuth } from "../../contexts/AdultAuthContext";
import { API_BASE_URL } from "../../config";
import ScrollToTop from "./ScrollToTop";

function App() {
  const navigate = useNavigate();
  const { user, isAuthenticated, loading } = useAuth();
  const { user: adultUser, isAuthenticated: adultIsAuthenticated } = useAdultAuth();
  const isAdminAuthenticated = typeof window !== "undefined" && localStorage.getItem("isAdminAuthenticated") === "true";

  const isProfileComplete = (currentUser = user) => {
    if (!currentUser) return false;
    const requiredProfileFields = currentUser.location?.city && currentUser.bio && currentUser.bio.trim().length > 0 && currentUser.photos && currentUser.photos.length >= 2;
    if (typeof currentUser.profileCompletion === 'number') return currentUser.profileCompletion >= 80 || Boolean(requiredProfileFields);
    return Boolean(requiredProfileFields);
  };

  useEffect(() => {
    if (typeof window === 'undefined' || sessionStorage.getItem('siteVisitTracked')) return;
    fetch(`${API_BASE_URL}/analytics/visit`, { method: 'POST' })
      .then(() => sessionStorage.setItem('siteVisitTracked', 'true'))
      .catch(error => console.error('Visit tracking failed:', error));
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SW_UPDATED') {
        console.log('[App] New service worker version:', event.data.version);
        window.location.reload();
      }
      if (event.data?.type === 'NAVIGATE' && event.data.url) navigate(event.data.url);
      if (event.data?.type === 'PUSH_SUBSCRIPTION_CHANGED') window.dispatchEvent(new CustomEvent('zippo:push_subscription_changed', { detail: event.data.subscription }));
    };
    navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') navigator.serviceWorker.ready.then(registration => registration.update().catch(err => console.warn('[App] SW update check failed:', err)));
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [navigate]);

  if (loading) return <LoadingScreen />;

  // AdultZone uses its own authentication context. Push health must be mounted
  // for both auth systems so normal app entry, account switching, and provider
  // sessions all execute the same push verification path.
  const notificationUserId = adultIsAuthenticated && adultUser?.id
    ? adultUser.id
    : isAuthenticated && user?._id
      ? user._id
      : null;

  return (
    <>
      <ScrollToTop />
      {isAuthenticated && <CallManager />}
      <Routes>
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
          <Route path="adult/provider/onboarding" element={<ProviderOnboarding />} />
          <Route path="adult/provider/dashboard" element={<ProviderDashboard />} />
          <Route path="adult/provider/earnings" element={<ProviderEarnings />} />
          <Route path="adult/provider/messages" element={<ProviderMessages />} />
          <Route path="adult/provider/live" element={<ProviderLive />} />
          <Route path="adult/provider/profile" element={<ProviderProfile />} />
          <Route path="adult/provider/settings" element={<ProviderSettings />} />
          <Route path="adult/provider/payout" element={<ProviderPayout />} />
          <Route path="adult/settings" element={<UserSettings />} />
        </Route>
        <Route path="/dating" element={isAuthenticated ? (isProfileComplete() ? <Navigate to="/discovery" replace /> : <Navigate to="/profile" replace />) : <Onboarding />} />
        <Route path="/admin/errors" element={isAdminAuthenticated ? <AdminErrorsPage /> : <Navigate to="/admin/login" replace />} />
        <Route path="/admin/payouts" element={isAdminAuthenticated ? <AdminPayoutsPage /> : <Navigate to="/admin/login" replace />} />
        <Route path="/admin/analytics" element={isAdminAuthenticated ? <AdminAnalytics /> : <Navigate to="/admin/login" replace />} />
        <Route path="/admin/rewards" element={isAdminAuthenticated ? <AdminRewardsPage /> : <Navigate to="/admin/login" replace />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={isAdminAuthenticated ? <AdminDashboard /> : <Navigate to="/admin/login" replace />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/auth/callback" element={<GoogleCallback />} />
        <Route path="/profile" element={isAuthenticated ? <ProfileCreation /> : <Navigate to="/auth" replace />} />
        <Route path="/favourites" element={isAuthenticated ? (isProfileComplete() ? <Favourites /> : <Navigate to="/profile" replace />) : <Navigate to="/auth" replace />} />
        <Route path="/discovery" element={isAuthenticated ? (isProfileComplete() ? <Discovery /> : <Navigate to="/profile" replace />) : <Navigate to="/auth" replace />} />
        <Route path="/user/:userId" element={isAuthenticated ? (isProfileComplete() ? <PublicProfileView /> : <Navigate to="/profile" replace />) : <Navigate to="/auth" replace />} />
        <Route path="/my-profile" element={isAuthenticated ? (isProfileComplete() ? <UserProfileView /> : <Navigate to="/profile" replace />) : <Navigate to="/auth" replace />} />
        <Route path="/settings" element={isAuthenticated ? (isProfileComplete() ? <Settings /> : <Navigate to="/profile" replace />) : <Navigate to="/auth" replace />} />
        <Route path="/chat" element={isAuthenticated ? (isProfileComplete() ? <ChatInterface /> : <Navigate to="/profile" replace />) : <Navigate to="/auth" replace />} />
        <Route path="/direct-message/:conversationId" element={isAuthenticated ? (isProfileComplete() ? <DirectMessage /> : <Navigate to="/auth" replace />) : <Navigate to="/auth" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {notificationUserId && <NotificationPrompt userId={notificationUserId} />}
      <Toaster />
    </>
  );
}

export default App;
