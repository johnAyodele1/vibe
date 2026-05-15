import React, { useState, useEffect } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import AgeGate from './AgeGate';

const AdultZoneLayout: React.FC = () => {
  const [isVerified, setIsVerified] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const stored = localStorage.getItem('adultZoneVerified');
    if (stored) {
      try {
        const { verified } = JSON.parse(stored);
        // Expire after 24 hours if needed, but for now we trust session/storage
        if (verified) {
          setIsVerified(true);
        }
      } catch (e) {
        console.error('Error parsing verification status');
      }
    }
  }, []);

  if (!isVerified) {
    return <AgeGate onVerified={() => setIsVerified(true)} />;
  }

  const navLinks = [
    { name: 'Live Cams', path: '/adult/cams' },
    { name: 'Naughty Rooms', path: '/adult/rooms' },
    { name: 'Private Sext', path: '/adult/sext' },
    { name: 'Random Stranger', path: '/adult/random' },
    { name: 'Hook Up Tonight', path: '/adult/hookup' },
  ];

  return (
    <div className="min-h-screen bg-[var(--az-bg-primary)] text-[var(--az-text-primary)] font-sans az-grain flex flex-col">
      {/* Top Navigation */}
      <nav className="sticky top-0 z-50 az-glass border-b border-[var(--az-border)] px-4 py-3 md:px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link to="/adult" className="flex items-center gap-2 group">
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
            <div className="hidden xs:flex items-center bg-[var(--az-bg-tertiary)] px-3 py-1.5 rounded-full border border-[var(--az-border)]">
              <span className="text-xs font-mono text-[var(--az-accent-gold)]">💎 240 Credits</span>
            </div>
            <Link to="/adult/wallet" className="w-8 h-8 rounded-full bg-[var(--az-bg-secondary)] border border-[var(--az-border)] flex items-center justify-center overflow-hidden">
              <img src="/placeholder.svg" alt="User" className="w-full h-full object-cover" />
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-grow">
        <Outlet />
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 az-glass border-t border-[var(--az-border)] pb-safe">
        <div className="flex justify-around items-center h-16">
          {[
            { icon: '🔴', path: '/adult', label: 'Home' },
            { icon: '📹', path: '/adult/cams', label: 'Live' },
            { icon: '💬', path: '/adult/sext', label: 'Sext' },
            { icon: '🎲', path: '/adult/random', label: 'Random' },
            { icon: '🌙', path: '/adult/hookup', label: 'Hook Up' },
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
