import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, Outlet, useNavigate } from 'react-router-dom';
import { Avatar } from './Avatar';
import { io } from 'socket.io-client';
import { API_BASE_URL, SOCKET_URL } from '../../config';
import AgeGate from './AgeGate';
import AdultAuthModal from './AdultAuthModal';
import LoadingScreen from '../LoadingScreen/LoadingScreen';
import { useAdultAuth } from '../../contexts/AdultAuthContext';
import { TipSheet } from './TipSheet';
import { useUIStore } from './useUIStore';
import { usePricingStore } from '../../lib/pricing';
import { InstallPrompt } from '../pwa/InstallPrompt/InstallPrompt';
import { registerServiceWorker, subscribeToPush, updateBadgeCount } from '../../lib/push/pushSubscription';
import { useUnreadStore } from '../../store/unreadStore';
import NotificationPrompt from '../pwa/NotificationPrompt';
import { getInstallContext } from '../../lib/pwa/context';
import { usePWAPromptStore, NOTIF_KEYS } from '../../store/pwaPromptStore';
import { runPushSelfTest } from '../../lib/pwa/pushSelfTest';
import { NotifSettingsDialog } from '../pwa/NotifSettingsDialog';
import { syncPushSubscription } from '../../lib/pwa/subscriptionSync';
import { removePushSubscriptionOnLogout } from '../../lib/pwa/pushSubscriptionLogout';
import { tryWelcomeBack } from '../../lib/pwa/welcomeBack';

const NavBadge: React.FC = () => {
  const totalUnread = useUnreadStore(s => s.totalUnread);
  if (totalUnread === 0) return null;

  return (
    <span className="absolute -top-1 -right-2 bg-red-600 text-white text-[8px] font-bold h-3.5 min-w-[14px] px-1 rounded-full flex items-center justify-center border border-[var(--az-bg-primary)] leading-none animate-pulse z-20">
      {totalUnread > 99 ? '99+' : totalUnread}
    </span>
  );
};

const AdultZoneLayout: React.FC = () => {
  const { hideGlobalHeader, hideFooter } = useUIStore();
  const [isVerified, setIsVerified] = useState(() => {
    const stored = localStorage.getItem('adultZoneVerified');
    if (stored) {
      try {
        const { verified } = JSON.parse(stored);
        return !!verified;
      } catch (e) {
        return false;
      }
    }
    return false;
  });

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'signup'>('login');
  const [authModalRole, setAuthModalRole] = useState<'user' | 'provider'>('user');
  const { isAuthenticated, logout, user, loading } = useAdultAuth();
  const { setUnread, increment } = useUnreadStore();

  // Centralized PWA and Notification Prompts sequencing
  const {
    showInstallPrompt,
    showNotifPrompt,
    setShowInstallPrompt,
    setShowNotifPrompt,
    shouldShowInstallPrompt,
    shouldShowNotifPrompt,
    recordInstallPromptShown,
  } = usePWAPromptStore();

  useEffect(() => {
    if (!user?.id) return;

    const ctx = getInstallContext();

    if (!ctx.isStandalone) {
      // Not installed as PWA
      if (shouldShowInstallPrompt()) {
        setShowInstallPrompt(true);
        recordInstallPromptShown();
      }
      // Do not show notif prompt when not in standalone
      // (see Fix 3 — web context redirects to install first)
      return;
    }

    // IS standalone PWA — show notif prompt if needed
    if (ctx.pushSupportedOnThisDevice && shouldShowNotifPrompt()) {
      // Delay slightly so page loads first
      const t = setTimeout(() => {
        setShowNotifPrompt(true);
        sessionStorage.setItem(NOTIF_KEYS.shownThisSession, '1');
        localStorage.setItem(NOTIF_KEYS.lastShownAt, String(Date.now()));
      }, 3000);
      return () => clearTimeout(t);
    }
  }, [user?.id, showInstallPrompt, showNotifPrompt]);

  // Auto-test trigger in root layout (PWA standalone only)
  useEffect(() => {
    if (!user?.id) return;

    const ctx = getInstallContext();
    if (!ctx.isStandalone) return;    // only for PWA

    // Run after a short delay so app UI loads first
    const t = setTimeout(() => {
      runPushSelfTest(user.id);
    }, 4000);

    return () => clearTimeout(t);
  }, [user?.id]);

  const lastActiveRef = useRef<number>(Date.now());
  const AWAY_THRESHOLD = 5 * 60 * 1000;  // 5 minutes = "came back"

  useEffect(() => {
    if (!user?.id) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // Record when user left
        lastActiveRef.current = Date.now();
        console.log('[Visibility] App hidden at:', new Date().toISOString());
        return;
      }

      if (document.visibilityState === 'visible') {
        const awayDuration = Date.now() - lastActiveRef.current;
        console.log('[Visibility] App visible — was away for:', Math.round(awayDuration / 1000), 'seconds');

        // Only treat as "welcome back" if away for more than 5 minutes
        if (awayDuration > AWAY_THRESHOLD) {
          console.log('[Visibility] Away long enough — running welcome back');
          tryWelcomeBack(user.id);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [user?.id]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/v1/adult/config/diamond-rate`)
      .then(res => res.json())
      .then(data => {
        if (data && data.rate) {
          usePricingStore.getState().setRate(data.rate);
        }
      })
      .catch(err => console.error('Failed to fetch diamond rate config:', err));
  }, []);
  const location = useLocation();
  const navigate = useNavigate();

  const [incomingCall, setIncomingCall] = useState<{
    callId: string;
    callerId: string;
    callerName: string;
    callerAvatar: string;
    type: 'video' | 'audio';
    webrtcRoomId: string;
    rate: number;
  } | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const token = localStorage.getItem('adultAccessToken');
    if (!token) return;

    const socketUrl = SOCKET_URL || window.location.origin;
    const s = io(`${socketUrl}/adult`, {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    s.on('connect', () => {
      console.log('Global Adult Zone socket connected:', s.id);
    });

    s.on('sext:new_message_notification', (payload: any) => {
      s.emit('sext:message_delivered', { messageId: payload.messageId });
    });

    s.on('sext:new_message', (payload: any) => {
      if (payload.message?.receiverId === user.id) {
        const isViewingChat = window.location.pathname.includes(`/sext/${payload.message.conversationId}`) || window.location.pathname.includes(`/adult/sext/${payload.message.conversationId}`);
        if (!isViewingChat) {
          increment();
          updateBadgeCount(useUnreadStore.getState().totalUnread + 1);
        }
      }
    });

    s.on('sext:messages_read', () => {
      fetch(`${API_BASE_URL}/v1/adult/sext/conversations/unread-count`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
        .then(res => res.json())
        .then(data => {
          if (data && typeof data.total === 'number') {
            setUnread(data.total);
            updateBadgeCount(data.total);
          }
        })
        .catch(err => console.error('Failed to fetch unread count:', err));
    });

    s.on('call:incoming', (payload: any) => {
      // Ignore if already on the messaging page where calls are handled locally
      const isChatPage = location.pathname === '/adult/provider/messages' || location.pathname === '/sext';
      if (isChatPage) return;

      setIncomingCall({
        callId: payload.callId,
        callerId: payload.callerId,
        callerName: payload.callerName,
        callerAvatar: payload.callerAvatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=150&auto=format&fit=crop",
        type: payload.type || 'video',
        webrtcRoomId: payload.webrtcRoomId,
        rate: payload.rate
      });
    });

    s.on('call:missed', (payload: any) => {
      setIncomingCall(prev => {
        if (!payload?.callId || prev?.callId === payload.callId) {
          return null;
        }
        return prev;
      });
    });

    s.on('call:ended', (payload: any) => {
      setIncomingCall(prev => {
        if (!payload?.callId || prev?.callId === payload.callId) {
          return null;
        }
        return prev;
      });
    });

    return () => {
      s.disconnect();
    };
  }, [isAuthenticated, user?.id, location.pathname]);

  const handleDeclineIncomingCall = async () => {
    if (!incomingCall) return;
    try {
      const token = localStorage.getItem('adultAccessToken');
      await fetch(`${API_BASE_URL}/v1/adult/sext/calls/${incomingCall.callId}/decline`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
    } catch (err) {
      console.error('Error declining call globally:', err);
    } finally {
      setIncomingCall(null);
    }
  };

  const handleAcceptIncomingCall = () => {
    if (!incomingCall) return;
    const dest = user?.role === 'provider' ? '/adult/provider/messages' : '/sext';
    const params = new URLSearchParams();
    params.set('autoAcceptCallId', incomingCall.callId);
    params.set('callerId', incomingCall.callerId);
    params.set('type', incomingCall.type);

    setIncomingCall(null);
    navigate(`${dest}?${params.toString()}`);
  };

  useEffect(() => {
    const handleOpenAuth = (e?: Event) => {
      const customEvent = e as CustomEvent<{ mode?: 'login' | 'signup'; role?: 'user' | 'provider' }>;
      if (customEvent?.detail) {
        if (customEvent.detail.mode) setAuthModalMode(customEvent.detail.mode);
        if (customEvent.detail.role) setAuthModalRole(customEvent.detail.role);
      } else {
        setAuthModalMode('login');
        setAuthModalRole('user');
      }
      setIsAuthModalOpen(true);
    };
    window.addEventListener('open-adult-auth-modal', handleOpenAuth);
    return () => window.removeEventListener('open-adult-auth-modal', handleOpenAuth);
  }, []);

  useEffect(() => {
    const userId = user?.id;
    if (!isAuthenticated || !userId) return;

    const setupPush = async () => {
      console.log('[App] Syncing push subscription silently on login/load');
      syncPushSubscription(userId).catch((err) => {
        console.error('[App] Push sync failed (non-fatal):', err.message);
      });

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data?.type === 'NAVIGATE') {
            navigate(event.data.url);
          }
        });
      }
    };

    setupPush();
  }, [user?.id, isAuthenticated]);

  // Load initial unread count
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;

    const token = localStorage.getItem('adultAccessToken');
    if (!token) return;

    fetch(`${API_BASE_URL}/v1/adult/sext/conversations/unread-count`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
      .then(res => res.json())
      .then(data => {
        if (data && typeof data.total === 'number') {
          setUnread(data.total);
          updateBadgeCount(data.total);
        }
      })
      .catch(err => console.error('Failed to fetch unread count:', err));
  }, [user?.id, isAuthenticated]);

  if (loading) {
    return <LoadingScreen />;
  }

  if (!isVerified) {
    return <AgeGate onVerified={() => setIsVerified(true)} />;
  }

  const isProvider = user?.role === 'provider';

  const navLinks = isProvider ? [
    { name: 'Dashboard', path: '/adult/provider/dashboard' },
    { name: 'Earnings', path: '/adult/provider/earnings' },
    { name: 'Payout HQ', path: '/adult/provider/payout' },
    { name: 'Messages', path: '/adult/provider/messages' },
    { name: 'Profile Editor', path: '/adult/provider/profile' },
    { name: 'Settings', path: '/adult/provider/settings' }
  ] : [
    { name: 'Live Cams', path: '/cams' },
    { name: 'Naughty Rooms', path: '/rooms' },
    { name: 'Private Inbox', path: '/sext' },
    { name: 'Random Stranger', path: '/random' },
    { name: 'Hook Up Tonight', path: '/hookup' },
  ];

  return (
    <div
      className={`bg-[var(--az-bg-primary)] text-[var(--az-text-primary)] font-sans az-grain flex flex-col ${
        hideGlobalHeader ? 'h-[100dvh] overflow-hidden' : 'min-h-screen'
      }`}
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {/* Top Navigation */}
      <nav
        data-testid="global-header"
        className={`sticky top-0 z-50 az-glass border-b border-[var(--az-border)] px-4 py-3 md:px-8 ${
          hideGlobalHeader ? 'hidden md:block' : 'block'
        }`}
        style={{
          paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))',
        }}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 bg-[var(--az-accent-primary)] rounded flex items-center justify-center text-white font-bold text-lg shadow-[0_0_10px_var(--az-glow)] group-hover:scale-110 transition-transform">
              V
            </div>
            <span className="hidden sm:block font-serif italic text-xl tracking-wide border-l border-[var(--az-border)] pl-2 ml-1">
              Adult Zone
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`text-sm font-medium tracking-wide transition-colors hover:text-[var(--az-accent-rose)] relative ${
                  location.pathname === link.path ? 'text-[var(--az-accent-primary)]' : 'text-[var(--az-text-secondary)]'
                }`}
              >
                {link.name}
                {(link.path === '/sext' || link.path === '/adult/provider/messages') && <NavBadge />}
                {location.pathname === link.path && (
                  <span className="absolute -bottom-[1.1rem] left-0 right-0 h-0.5 bg-[var(--az-accent-primary)] shadow-[0_0_8px_var(--az-glow)]" />
                )}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <Link
              to="/dating"
              className="hidden lg:flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-pink-500/20 to-red-500/20 hover:from-pink-500/30 hover:to-red-500/30 border border-pink-500/30 hover:border-pink-500/50 text-[var(--az-accent-rose)] hover:text-white rounded-full text-xs font-bold transition-all duration-300"
            >
              <span>Something Deeper? ❤️</span>
            </Link>

            {isAuthenticated ? (
              <>
                <div className="hidden xs:flex items-center bg-[var(--az-bg-tertiary)] px-3 py-1.5 rounded-full border border-[var(--az-border)]">
                  <span className="text-xs font-mono text-[var(--az-accent-gold)]">💎 {user?.credits || 0} Credits</span>
                </div>
                <div className="flex items-center gap-3">
                  <Link to="/wallet" className="w-8 h-8 rounded-full bg-[var(--az-bg-secondary)] border border-[var(--az-border)] flex items-center justify-center overflow-hidden hover:scale-110 active:scale-95 transition-transform" title="Wallet">
                    <span className="text-base select-none">💎</span>
                  </Link>
                  <button
                    onClick={async () => {
                      console.log('[Auth] Logging out...');
                      await removePushSubscriptionOnLogout();
                      logout();
                    }}
                    className="text-xs text-[var(--az-text-muted)] hover:text-white uppercase font-bold"
                  >
                    Logout
                  </button>
                </div>
              </>
            ) : (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="px-6 py-2 bg-[var(--az-accent-primary)] text-white text-xs font-bold uppercase tracking-widest rounded-full shadow-[0_0_10px_var(--az-glow)]"
              >
                Login
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className={`flex-grow ${hideGlobalHeader ? 'h-full overflow-hidden' : ''}`}>
        <Outlet />
      </main>

      <AdultAuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        defaultMode={authModalMode}
        defaultRole={authModalRole}
      />

      <TipSheet />

      <InstallPrompt />

      {user?.id && <NotificationPrompt userId={user.id} />}

      {user?.id && <NotifSettingsDialog userId={user.id} />}

      {incomingCall && (
        <div className="fixed inset-0 bg-black/90 z-[11000] flex flex-col items-center justify-center p-8 text-white">
          <div className="w-32 h-32 rounded-full border-4 border-pink-500 animate-pulse mb-6 flex items-center justify-center overflow-hidden">
            <Avatar src={incomingCall.callerAvatar} name={incomingCall.callerName} size={128} />
          </div>
          <h2 className="text-3xl font-serif italic mb-2 truncate max-w-xs px-4 text-center" title={incomingCall.callerName}>{incomingCall.callerName}</h2>
          <p className="text-xs text-pink-400 uppercase tracking-widest animate-pulse">Incoming {incomingCall.type} Call...</p>
          <p className="text-xs text-yellow-400 mt-2 font-mono">Rate: 💎 {incomingCall.rate} credits / min</p>

          <div className="flex gap-8 mt-12">
            <button
              onClick={handleDeclineIncomingCall}
              className="w-16 h-16 bg-red-600 hover:bg-red-700 text-white text-2xl rounded-full flex items-center justify-center hover:scale-105 transition-transform"
              title="Decline Call"
            >
              ✕
            </button>
            <button
              onClick={handleAcceptIncomingCall}
              className="w-16 h-16 bg-green-600 hover:bg-green-700 text-white text-2xl rounded-full flex items-center justify-center hover:scale-105 transition-transform animate-bounce"
              title="Accept Call"
            >
              ✓
            </button>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation */}
      <nav data-testid="bottom-tab-bar" className="md:hidden fixed bottom-0 left-0 right-0 z-50 az-glass border-t border-[var(--az-border)] pb-safe">
        <div className="flex justify-around items-center h-16">
          {isProvider ? [
            { icon: '📊', path: '/adult/provider/dashboard', label: 'Studio' },
            { icon: '💰', path: '/adult/provider/earnings', label: 'Earnings' },
            { icon: '💬', path: '/adult/provider/messages', label: 'Inbox' },
            { icon: '👤', path: '/adult/provider/profile', label: 'Profile' },
            { icon: '⚙️', path: '/adult/provider/settings', label: 'Settings' }
          ].map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center gap-1 p-2 min-w-[64px] transition-all relative ${
                location.pathname === item.path ? 'scale-110' : 'opacity-60'
              }`}
            >
              <span className="text-xl relative">
                {item.icon}
                {item.path === '/adult/provider/messages' && <NavBadge />}
              </span>
              <span className={`text-[10px] uppercase tracking-tighter ${location.pathname === item.path ? 'text-[var(--az-accent-rose)] font-bold' : ''}`}>
                {item.label}
              </span>
            </Link>
          )) : [
            { icon: '🔴', path: '/', label: 'Home' },
            { icon: '📹', path: '/cams', label: 'Live' },
            { icon: '💬', path: '/sext', label: 'Inbox' },
            { icon: '🎲', path: '/random', label: 'Random' },
            { icon: '🌙', path: '/hookup', label: 'Hook Up' },
          ].map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center gap-1 p-2 min-w-[64px] transition-all relative ${
                location.pathname === item.path ? 'scale-110' : 'opacity-60'
              }`}
            >
              <span className="text-xl relative">
                {item.icon}
                {item.path === '/sext' && <NavBadge />}
              </span>
              <span className={`text-[10px] uppercase tracking-tighter ${location.pathname === item.path ? 'text-[var(--az-accent-primary)] font-bold' : ''}`}>
                {item.label}
              </span>
            </Link>
          ))}
        </div>
      </nav>

      {/* Footer */}
      <footer data-testid="site-footer" className={`bg-[#050304] border-t border-[var(--az-border)] px-4 py-12 pb-24 md:pb-12 mt-auto ${
        hideFooter ? 'hidden md:block' : 'block'
      }`}>
        <div className="max-w-7xl mx-auto flex flex-col items-center text-center">
          <p className="text-[10px] text-[var(--az-text-muted)] max-w-2xl mb-6 leading-relaxed">
            All performers are 18+ years of age. Age verification records are maintained in compliance with applicable law.
            The "Adult Zone" is a premium, restricted area of the application. Please use responsibly.
          </p>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-[10px] text-[var(--az-text-muted)] uppercase tracking-widest font-bold">
            <Link to="#" className="hover:text-[var(--az-text-secondary)]">Terms</Link>
            <Link to="#" className="hover:text-[var(--az-text-secondary)]">Privacy</Link>
            <Link to="#" className="hover:text-[var(--az-text-secondary)]">DMCA</Link>
            <button
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent('open-adult-auth-modal', {
                    detail: { mode: 'signup', role: 'provider' }
                  })
                );
              }}
              className="text-[10px] text-[var(--az-text-muted)] uppercase tracking-widest font-bold hover:text-[var(--az-text-secondary)] cursor-pointer focus:outline-none bg-transparent border-none p-0 font-sans"
            >
              Join as a provider
            </button>
            <Link to="#" className="hover:text-[var(--az-text-secondary)]">Support</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default AdultZoneLayout;
