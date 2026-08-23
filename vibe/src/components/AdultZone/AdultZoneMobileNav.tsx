import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAdultAuth } from '../../contexts/AdultAuthContext';
import { useUnreadStore } from '../../store/unreadStore';

const NavBadge: React.FC = () => {
  const totalUnread = useUnreadStore((state) => state.totalUnread);
  if (totalUnread === 0) return null;
  return (
    <span className="absolute -top-1 -right-2 bg-red-600 text-white text-[8px] font-bold h-3.5 min-w-[14px] px-1 rounded-full flex items-center justify-center border border-[var(--az-bg-primary)] leading-none animate-pulse z-20">
      {totalUnread > 99 ? '99+' : totalUnread}
    </span>
  );
};

export const AdultZoneMobileNav: React.FC = () => {
  const location = useLocation();
  const { user } = useAdultAuth();
  const isProvider = user?.role === 'provider';
  const items = isProvider
    ? [
        { icon: '📊', path: '/adult/provider/dashboard', label: 'Studio' },
        { icon: '💰', path: '/adult/provider/earnings', label: 'Earnings' },
        { icon: '💬', path: '/adult/provider/messages', label: 'Inbox' },
        { icon: '👤', path: '/adult/provider/profile', label: 'Profile' },
        { icon: '⚙️', path: '/adult/provider/settings', label: 'Settings' },
      ]
    : [
        { icon: '🔴', path: '/', label: 'Home' },
        { icon: '📹', path: '/cams', label: 'Live' },
        { icon: '💬', path: '/sext', label: 'Inbox' },
        { icon: '🎲', path: '/random', label: 'Random' },
        { icon: '🌙', path: '/hookup', label: 'Hook Up' },
      ];

  return (
    <nav data-testid="bottom-tab-bar" className="md:hidden w-full flex-shrink-0 border-t border-[var(--az-border)] az-glass" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="flex justify-around items-center h-14">
        {items.map((item) => (
          <Link key={item.path} to={item.path} className={`flex flex-col items-center justify-center gap-[3px] flex-1 h-14 transition-all relative ${location.pathname === item.path ? 'scale-110' : 'opacity-60'}`}>
            <span className="text-xl relative">
              {item.icon}
              {item.path === '/sext' && !isProvider && <NavBadge />}
              {item.path === '/adult/provider/messages' && isProvider && <NavBadge />}
            </span>
            <span className={`text-[10px] uppercase tracking-tighter ${location.pathname === item.path ? (isProvider ? 'text-[var(--az-accent-rose)] font-bold' : 'text-[var(--az-accent-primary)] font-bold') : ''}`}>
              {item.label}
            </span>
          </Link>
        ))}
      </div>
    </nav>
  );
};
