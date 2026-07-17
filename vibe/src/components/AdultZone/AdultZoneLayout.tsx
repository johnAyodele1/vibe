import React, { useState } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import AgeGate from './AgeGate';
import AdultAuthModal from './AdultAuthModal';
import LoadingScreen from '../LoadingScreen/LoadingScreen';
import { useAdultAuth } from '../../contexts/AdultAuthContext';

const AdultZoneLayout: React.FC = () => {
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
  const { isAuthenticated, logout, user, loading } = useAdultAuth();
  const location = useLocation();

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
    { name: 'Private Sext', path: '/sext' },
    { name: 'Random Stranger', path: '/random' },
    { name: 'Hook Up Tonight', path: '/hookup' },
  ];

  return (
    <div className="min-h-screen bg-[var(--az-bg-primary)] text-[var(--az-text-primary)] font-sans az-grain flex flex-col">
      {/* Top Navigation */}
      <nav className="sticky top-0 z-50 az-glass border-b border-[var(--az-border)] px-4 py-3 md:px-8">
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
                className={`text-sm font-medium tracking-wide transition-colors hover:text-[var(--az-accent-rose)] ${
                  location.pathname === link.path ? 'text-[var(--az-accent-primary)] relative' : 'text-[var(--az-text-secondary)]'
                }`}
              >
                {link.name}
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
                  <Link to="/wallet" className="w-8 h-8 rounded-full bg-[var(--az-bg-secondary)] border border-[var(--az-border)] flex items-center justify-center overflow-hidden">
                    <img src={user?.profilePhoto || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=100&auto=format&fit=crop"} alt="User" className="w-full h-full object-cover" />
                  </Link>
                  <button onClick={logout} className="text-xs text-[var(--az-text-muted)] hover:text-white uppercase font-bold">Logout</button>
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
      <main className="flex-grow">
        <Outlet />
      </main>

      <AdultAuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 az-glass border-t border-[var(--az-border)] pb-safe">
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
              className={`flex flex-col items-center gap-1 p-2 min-w-[64px] transition-all ${
                location.pathname === item.path ? 'scale-110' : 'opacity-60'
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              <span className={`text-[10px] uppercase tracking-tighter ${location.pathname === item.path ? 'text-[var(--az-accent-rose)] font-bold' : ''}`}>
                {item.label}
              </span>
            </Link>
          )) : [
            { icon: '🔴', path: '/', label: 'Home' },
            { icon: '📹', path: '/cams', label: 'Live' },
            { icon: '💬', path: '/sext', label: 'Sext' },
            { icon: '🎲', path: '/random', label: 'Random' },
            { icon: '🌙', path: '/hookup', label: 'Hook Up' },
          ].map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center gap-1 p-2 min-w-[64px] transition-all ${
                location.pathname === item.path ? 'scale-110' : 'opacity-60'
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              <span className={`text-[10px] uppercase tracking-tighter ${location.pathname === item.path ? 'text-[var(--az-accent-primary)] font-bold' : ''}`}>
                {item.label}
              </span>
            </Link>
          ))}
        </div>
      </nav>

      {/* Footer */}
      <footer className="bg-[#050304] border-t border-[var(--az-border)] px-4 py-12 pb-24 md:pb-12 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col items-center text-center">
          <p className="text-[10px] text-[var(--az-text-muted)] max-w-2xl mb-6 leading-relaxed">
            All performers are 18+ years of age. Age verification records are maintained in compliance with applicable law.
            The "Adult Zone" is a premium, restricted area of the application. Please use responsibly.
          </p>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-[10px] text-[var(--az-text-muted)] uppercase tracking-widest font-bold">
            <Link to="#" className="hover:text-[var(--az-text-secondary)]">Terms</Link>
            <Link to="#" className="hover:text-[var(--az-text-secondary)]">Privacy</Link>
            <Link to="#" className="hover:text-[var(--az-text-secondary)]">DMCA</Link>
            <Link to="#" className="hover:text-[var(--az-text-secondary)]">2257 Statement</Link>
            <Link to="#" className="hover:text-[var(--az-text-secondary)]">Support</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default AdultZoneLayout;
