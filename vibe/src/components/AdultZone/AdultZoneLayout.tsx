import React, { useState, useEffect } from 'react';
import { Link, useLocation, Outlet, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { API_BASE_URL, SOCKET_URL } from '../../config';
import AgeGate from './AgeGate';
import AdultAuthModal from './AdultAuthModal';
import LoadingScreen from '../LoadingScreen/LoadingScreen';
import { useAdultAuth } from '../../contexts/AdultAuthContext';
import { TipSheet } from './TipSheet';
import { useUIStore } from './useUIStore';
import { usePricingStore, formatAmount } from '../../lib/pricing';
import { InstallPrompt } from '../pwa/InstallPrompt/InstallPrompt';
import { updateBadgeCount } from '../../lib/push/pushSubscription';
import { useUnreadStore } from '../../store/unreadStore';
import { getInstallContext } from '../../lib/pwa/context';
import { usePWAPromptStore } from '../../store/pwaPromptStore';
import { NotifSettingsDialog } from '../pwa/NotifSettingsDialog';
import { syncPushSubscription } from '../../lib/pwa/subscriptionSync';
import { removePushSubscriptionOnLogout } from '../../lib/pwa/pushSubscriptionLogout';
import { AdultCallProvider } from './AdultCallContext';

interface SocketMessagePayload {
  messageId?: string;
  message?: {
    receiverId: string;
    conversationId: string;
  };
}

const NavBadge: React.FC = () => {
  const totalUnread = useUnreadStore(s => s.totalUnread);
  if (totalUnread === 0) return null;

  return (
    <span className="absolute -top-1 -right-2 bg-red-600 text-white text-[8px] font-bold h-3.5 min-w-[14px] px-1 rounded-full flex items-center justify-center border border-[var(--az-bg-primary)] leading-none animate-pulse z-20">
      {totalUnread > 99 ? '99+' : totalUnread}
    </span>
  );
};

const AdultZoneLayoutInner: React.FC = () => {
  const { hideGlobalHeader, hideFooter } = useUIStore();
  const [isVerified, setIsVerified] = useState(() => {
    const stored = localStorage.getItem('adultZoneVerified');
    if (stored) {
      try {
        const { verified } = JSON.parse(stored);
        return !!verified;
      } catch {
        return false;
      }
    }
    return false;
  });

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'signup'>('login');
  const [authModalRole, setAuthModalRole] = useState<'user' | 'provider'>('user');
  const { isAuthenticated, logout, user, loading, updateCredits } = useAdultAuth();
  const setUnread = useUnreadStore(s => s.setUnread);
  const increment = useUnreadStore(s => s.increment);
  const location = useLocation();
  const navigate = useNavigate();

  const {
    setShowInstallPrompt,
    shouldShowInstallPrompt,
    recordInstallPromptShown,
  } = usePWAPromptStore();

  // Reset any previous PWA dismissals on page reload/mount.
  useEffect(() => {
    localStorage.removeItem('zippo_pwa_dismiss_until');
    localStorage.removeItem('zippo_pwa_dismiss_permanent');
  }, []);

  // PWA install prompt is independent from notification health.
  useEffect(() => {
    const ctx = getInstallContext();

    if (!ctx.isStandalone && location.pathname === '/') {
      if (shouldShowInstallPrompt()) {
        setShowInstallPrompt(true);
        recordInstallPromptShown();
      }
    } else {
      setShowInstallPrompt(false);
    }
  }, [location.pathname, shouldShowInstallPrompt, setShowInstallPrompt, recordInstallPromptShown]);

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

    s.on('wallet:updated', (payload: { balance: number }) => {
      if (typeof payload?.balance === 'number') {
        updateCredits(payload.balance);
      }
    });

    s.on('sext:new_message_notification', (payload: SocketMessagePayload) => {
      s.emit('sext:message_delivered', { messageId: payload.messageId });
    });

    s.on('sext:new_message', (payload: SocketMessagePayload) => {
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

    return () => {
      s.disconnect();
    };
  }, [isAuthenticated, user, increment, setUnread]);

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

  // Keep the browser subscription synchronized with the authenticated user.
  useEffect(() => {
    const userId = user?.id;
    if (!isAuthenticated || !userId) return;

    const setupPush = async () => {
      console.log('[App] Syncing push subscription silently on login/load');
      syncPushSubscription(userId).catch((err) => {
        console.error('[App] Push sync failed (non-fatal):', err.message);
      });

      if ('serviceWorker' in navigator) {
        const handleServiceWorkerMessage = (event: MessageEvent) => {
          if (event.data?.type === 'NAVIGATE') {
            navigate(event.data.url);
          }
        };

        navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);

        return () => {
          navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
        };
      }

      return undefined;
    };

    let cleanup: (() => void) | undefined;
    void setupPush().then((removeListener) => {
      cleanup = removeListener;
    });

    return () => cleanup?.();
  }, [user?.id, isAuthenticated, navigate]);

  // Load initial unread count.
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
  }, [user?.id, isAuthenticated, setUnread]);

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
    >
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
                  <span className="text-xs font-mono text-[var(--az-accent-gold)]">💎 {formatAmount(user?.credits)} Credits</span>
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

      <main className={`flex-grow ${hideGlobalHeader ? 'h-full overflow-hidden' : 'pb-[calc(56px+env(safe-area-inset-bottom))] md:pb-0'}`}>
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

      {user?.id && <NotifSettingsDialog userId={user.id} />}

      <nav
        data-testid="bottom-tab-bar"
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 az-glass border-t border-[var(--az-border)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex justify-around items-center h-14">
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
              className={`flex flex-col items-center justify-center gap-[3px] flex-1 h-14 transition-all relative ${
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
              className={`flex flex-col items-center justify-center gap-[3px] flex-1 h-14 transition-all relative ${
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

const AdultZoneLayout: React.FC = () => {
  return (
    <AdultCallProvider>
      <AdultZoneLayoutInner />
    </AdultCallProvider>
  );
};

export default AdultZoneLayout;
