import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { API_BASE_URL, SOCKET_URL } from '../../config';
import { useTipSheetStore } from './useTipSheetStore';
import { toast } from 'sonner';
import { DatingCrossPromo } from './DatingCrossPromo';
import { RewardsButton } from './RewardsButton';
import { getResponseBadge } from './responseTime';
import { io } from 'socket.io-client';

interface PerformerItem {
  _id?: string;
  userId?: string;
  displayName?: string;
  firstName?: string;
  profilePhoto?: string;
  photos?: Array<{ url: string }>;
  age?: number;
  country?: string;
  providerProfile?: {
    stageName?: string;
    isLive?: boolean;
    isOnline?: boolean;
    rating?: number | { average?: number };
    totalResponseCount?: number;
    totalResponseMinutes?: number;
    recentResponseCount?: number;
    recentAverageResponseMinutes?: number | null;
    effectiveResponseMinutes?: number | null;
  };
}

const AdultHome: React.FC = () => {
  const navigate = useNavigate();
  const openSheet = (prov: { userId: string; stageName: string; avatarUrl: string; isOnline: boolean }, amt?: number | null) =>
    useTipSheetStore.getState().openSheet(prov, amt);
  const serviceCardsRef = useRef<HTMLDivElement>(null);

  const [performers, setPerformers] = useState<PerformerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [messageLoading, setMessageLoading] = useState<string | null>(null);
  const [flashingTips, setFlashingTips] = useState<Record<string, boolean>>({});

  // Dynamic homepage stats initialized lazily with randomized values
  const [stats, setStats] = useState(() => ({
    liveNow: Math.floor(1150 + Math.random() * 180),
    camsOnline: Math.floor(310 + Math.random() * 60),
    roomsActive: Math.floor(1100 + Math.random() * 200),
    sextChatting: Math.floor(3100 + Math.random() * 600),
    randomWaiting: Math.floor(820 + Math.random() * 140),
    hookupNearby: Math.floor(130 + Math.random() * 40),
  }));

  useEffect(() => {
    const interval = setInterval(() => {
      setStats((prev) => {
        const change = (val: number, minChange: number, maxChange: number, minBound: number, maxBound: number) => {
          const delta = Math.floor(Math.random() * (maxChange - minChange + 1)) + minChange;
          const sign = Math.random() > 0.5 ? 1 : -1;
          const newVal = val + sign * delta;
          return Math.max(minBound, Math.min(maxBound, newVal));
        };

        return {
          liveNow: change(prev.liveNow, 1, 5, 1000, 1500),
          camsOnline: change(prev.camsOnline, 1, 3, 250, 450),
          roomsActive: change(prev.roomsActive, 2, 8, 900, 1500),
          sextChatting: change(prev.sextChatting, 5, 15, 2500, 4500),
          randomWaiting: change(prev.randomWaiting, 1, 4, 700, 1000),
          hookupNearby: change(prev.hookupNearby, 1, 2, 100, 250),
        };
      });
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleHighlight = (e: Event) => {
      const providerId = (e as CustomEvent).detail?.providerId;
      if (providerId) {
        setFlashingTips((prev) => ({ ...prev, [providerId]: true }));
        setTimeout(() => {
          setFlashingTips((prev) => ({ ...prev, [providerId]: false }));
        }, 2000);
      }
    };
    window.addEventListener('tip-success-highlight', handleHighlight);
    return () => window.removeEventListener('tip-success-highlight', handleHighlight);
  }, []);

  const handleMessageClick = async (providerId: string) => {
    if (!localStorage.getItem('adultAccessToken')) {
      window.dispatchEvent(new CustomEvent('open-adult-auth-modal'));
      return;
    }
    setMessageLoading(providerId);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/adult/sext/conversations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('adultAccessToken')}`
        },
        body: JSON.stringify({ recipientId: providerId })
      });
      const data = await response.json();
      if (data.conversationId) {
        const isMobile = window.innerWidth < 768;
        if (isMobile) {
          navigate(`/adult/sext/${data.conversationId}`);
        } else {
          navigate(`/adult/sext?conversation=${data.conversationId}`);
        }
      } else {
        toast.error('Could not start conversation. Please try again.');
      }
    } catch {
      toast.error('Could not start conversation. Please try again.');
    } finally {
      setMessageLoading(null);
    }
  };

  const handleTipClick = (p: PerformerItem) => {
    if (!localStorage.getItem('adultAccessToken')) {
      window.dispatchEvent(new CustomEvent('open-adult-auth-modal'));
      return;
    }
    const photoUrl = p.profilePhoto || p.photos?.[0]?.url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=600&auto=format&fit=crop";
    const displayName = p.displayName || p.providerProfile?.stageName || p.firstName || 'Provider';
    const userId = p.userId || p._id || '';
    openSheet({
      userId,
      stageName: displayName,
      avatarUrl: photoUrl,
      isOnline: p.providerProfile?.isLive || false
    });
  };

  useEffect(() => {
    const token = localStorage.getItem('adultAccessToken');
    if (!token) return;

    const socketUrl = SOCKET_URL || window.location.origin;
    const socket = io(`${socketUrl}/adult`, {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    socket.on('provider:online', ({ providerId }) => {
      setPerformers(prev => prev.map(p => {
        const pId = p.userId || p._id;
        if (pId === providerId) {
          return {
            ...p,
            providerProfile: {
              ...(p.providerProfile || {}),
              isOnline: true,
              isLive: true
            }
          };
        }
        return p;
      }));
    });

    socket.on('provider:offline', ({ providerId }) => {
      setPerformers(prev => prev.map(p => {
        const pId = p.userId || p._id;
        if (pId === providerId) {
          return {
            ...p,
            providerProfile: {
              ...(p.providerProfile || {}),
              isOnline: false,
              isLive: false
            }
          };
        }
        return p;
      }));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    const fetchPerformers = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/adult/providers/recommended?limit=6`);
        const data = await response.json();
        if (data.success && data.data.providers && data.data.providers.length > 0) {
          setPerformers(data.data.providers);
        } else {
          setPerformers([]);
        }
      } catch (err) {
        console.error('Failed to fetch performers for home page:', err);
        setPerformers([]);
      } finally {
        setLoading(false);
      }
    };
    fetchPerformers();
  }, []);

  // Helper to format thousands as K (e.g. 1.2K)
  const formatK = (num: number) => {
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  };

  const serviceCards = [
    {
      id: 'cams',
      title: 'Live Cams',
      tagline: 'Watch stunning performers live, tip to interact',
      icon: '📹',
      stats: `🔴 ${stats.camsOnline.toLocaleString()} online`,
      path: '/cams',
      color: 'from-red-900/40'
    },
    {
      id: 'rooms',
      title: 'Naughty Rooms',
      tagline: 'Join themed group chat rooms, no limits',
      icon: '🔞',
      stats: `🔴 ${formatK(stats.roomsActive)} active`,
      path: '/rooms',
      color: 'from-purple-900/40'
    },
    {
      id: 'sext',
      title: 'Private Inbox',
      tagline: 'One-on-one explicit text & photo exchange',
      icon: '💬',
      stats: `🔴 ${formatK(stats.sextChatting)} chatting`,
      path: '/sext',
      color: 'from-pink-900/40'
    },
    {
      id: 'random',
      title: 'Random Stranger',
      tagline: 'Matched with a random adult, no names needed',
      icon: '🎲',
      stats: `🔴 ${stats.randomWaiting.toLocaleString()} waiting`,
      path: '/random',
      color: 'from-indigo-900/40'
    },
    {
      id: 'hookup',
      title: 'Hook Up Tonight',
      tagline: 'Find someone nearby for tonight',
      icon: '🌙',
      stats: `🔴 ${stats.hookupNearby.toLocaleString()} nearby`,
      path: '/hookup',
      color: 'from-orange-900/40'
    },
    {
      id: 'vip',
      title: 'VIP Lounge',
      tagline: 'Premium members only — exclusive content',
      icon: '⭐',
      stats: '🔴 Elite access',
      path: '/vip',
      color: 'from-yellow-900/40'
    }
  ];

  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative min-h-[50vh] md:min-h-[60vh] py-12 md:py-16 flex items-center justify-center overflow-hidden px-4">
        {/* Animated Background Mesh */}
        <div className="absolute inset-0 z-0">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[var(--az-accent-primary)] rounded-full blur-[120px] opacity-20 animate-pulse" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[var(--az-accent-rose)] rounded-full blur-[120px] opacity-10" />
        </div>

        <div className="relative z-10 text-center max-w-4xl mx-auto">
          <div className="flex justify-center gap-4 mb-6">
            <span className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] text-[var(--az-text-secondary)] text-[10px] px-3 py-1 rounded-full uppercase tracking-widest font-bold">
              🔴 {stats.liveNow.toLocaleString()} Live Now
            </span>
            <span className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] text-[var(--az-text-secondary)] text-[10px] px-3 py-1 rounded-full uppercase tracking-widest font-bold">
              ⭐ 98% Satisfaction
            </span>
          </div>

          <h1 className="text-5xl md:text-7xl font-serif italic text-[var(--az-text-primary)] mb-6 tracking-tight leading-tight">
            Enter Your <span className="text-[var(--az-accent-primary)]">Desires</span>
          </h1>

          <p className="text-lg md:text-xl text-[var(--az-text-secondary)] font-serif italic mb-10 max-w-2xl mx-auto opacity-80">
            Premium adult experiences, curated for you. Cinematic, intimate, and entirely yours.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => serviceCardsRef.current?.scrollIntoView({ behavior: 'smooth' })}
              className="w-full sm:w-auto px-10 py-4 bg-[var(--az-accent-primary)] text-white font-bold uppercase tracking-widest rounded-full shadow-[0_0_20px_var(--az-glow)] hover:scale-105 active:scale-95 transition-all"
            >
              Explore Now
            </button>
            <button
              onClick={() => navigate('/cams')}
              className="w-full sm:w-auto px-10 py-4 border-2 border-[var(--az-accent-rose)] text-[var(--az-accent-rose)] font-bold uppercase tracking-widest rounded-full hover:bg-[var(--az-accent-rose)] hover:text-white transition-all"
            >
              View Live Now
            </button>
          </div>
        </div>
      </section>

      {/* Service Cards Grid */}
      <section ref={serviceCardsRef} className="max-w-7xl mx-auto px-4 pt-4 pb-16 md:pt-6 md:pb-20 w-full">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {serviceCards.map((card) => (
            <Link
              key={card.id}
              to={card.path}
              className="group relative h-72 rounded-2xl overflow-hidden border border-[var(--az-border)] bg-[var(--az-bg-secondary)] az-card-hover"
            >
              {/* Abstract Background with Gradient */}
              <div className={`absolute inset-0 bg-gradient-to-t ${card.color} to-transparent opacity-40 group-hover:opacity-60 transition-opacity`} />

              <div className="absolute inset-0 flex flex-col justify-end p-6 z-10">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-3xl filter drop-shadow-[0_0_8px_rgba(0,0,0,0.5)]">{card.icon}</div>
                  <span className="text-[10px] text-[var(--az-text-primary)] font-bold uppercase bg-[var(--az-accent-primary)]/80 px-2 py-0.5 rounded-sm">
                    {card.stats}
                  </span>
                </div>

                <h3 className="text-2xl font-serif italic text-white mb-2 tracking-wide group-hover:text-[var(--az-accent-rose)] transition-colors">
                  {card.title}
                </h3>

                <p className="text-sm text-[var(--az-text-secondary)] mb-4 font-serif italic">
                  {card.tagline}
                </p>

                <div className="w-full py-2 border border-[var(--az-accent-primary)]/30 rounded-lg text-center text-[10px] font-bold uppercase tracking-widest text-[var(--az-text-primary)] group-hover:bg-[var(--az-accent-primary)] group-hover:border-transparent transition-all">
                  Access Now
                </div>
              </div>

              {/* Grain Overlay */}
              <div className="absolute inset-0 pointer-events-none az-grain opacity-10" />
            </Link>
          ))}
        </div>
      </section>

      {/* For You Row */}
      <section className="px-4 py-20 bg-[var(--az-bg-secondary)]/30 border-t border-[var(--az-border)] overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-10">
            <h2 className="text-3xl font-serif italic text-[var(--az-text-primary)]">Recommended For You</h2>
          </div>

          <div className="flex gap-6 overflow-x-auto pb-8 no-scrollbar snap-x snap-mandatory w-full">
            {loading ? (
              [1, 2, 3, 4].map(i => (
                <div key={i} className="min-w-[280px] aspect-[3/4] bg-[var(--az-bg-secondary)] rounded-xl border border-[var(--az-border)] overflow-hidden snap-start flex-shrink-0 animate-pulse" />
              ))
            ) : performers.length > 0 ? (
              performers.map((p) => {
                const photoUrl = p.profilePhoto || p.photos?.[0]?.url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=600&auto=format&fit=crop";
                const isLiveNow = p.providerProfile?.isLive;
                const ratingVal = typeof p.providerProfile?.rating === 'object' ? p.providerProfile?.rating?.average : p.providerProfile?.rating;
                const displayName = p.displayName || p.providerProfile?.stageName || p.firstName;
                const responseBadge = getResponseBadge(p.providerProfile?.effectiveResponseMinutes);
                return (
                  <div key={p._id} className="min-w-[280px] bg-[var(--az-bg-secondary)] rounded-xl border border-[var(--az-border)] overflow-hidden snap-start flex-shrink-0 group">
                    <div className="relative aspect-[3/4] overflow-hidden bg-[#1e1318] cursor-pointer" onClick={() => navigate(`/adult/providers/${p.userId || p._id}`)}>
                      <img src={photoUrl} alt={displayName} className="absolute inset-0 w-full h-full object-cover object-top filter blur-[1px] group-hover:blur-0 transition-all duration-500" />
                      <div className="absolute top-3 left-3 flex gap-2">
                        {isLiveNow && (
                          <span className="bg-[var(--az-accent-primary)] text-white text-[8px] font-bold px-1.5 py-0.5 rounded uppercase">🔴 Live</span>
                        )}
                        <span className="bg-black/50 text-white text-[8px] font-bold px-1.5 py-0.5 rounded uppercase">New</span>
                      </div>
                    </div>
                    <div className="p-4 flex flex-col justify-between">
                      <div className="flex items-start justify-between">
                        <div className="cursor-pointer" onClick={() => navigate(`/adult/providers/${p.userId || p._id}`)}>
                          <h4 className="font-serif italic text-white text-lg hover:underline">{displayName}</h4>
                          <p className="text-[10px] text-[var(--az-text-secondary)] uppercase tracking-tighter">{p.age || 23} • {p.country || 'London, UK'}</p>
                          {responseBadge && (
                            <span className="inline-block mt-1 text-[8px] font-bold border rounded px-1.5 py-0.5 leading-none" style={{ borderColor: responseBadge.color, color: responseBadge.color }}>
                              ⚡ {responseBadge.label}
                            </span>
                          )}
                        </div>
                        <div className="text-[var(--az-accent-gold)] text-sm">⭐ {ratingVal || 4.9}</div>
                      </div>
                      <div className="flex items-center justify-between mt-4">
                        <div className="flex gap-2">
                          <button
                            data-testid="provider-card-message-btn"
                            disabled={messageLoading !== null}
                            onClick={() => handleMessageClick(p.userId || p._id || '')}
                            className="w-8 h-8 rounded-full border border-[var(--az-border)] flex items-center justify-center hover:bg-[var(--az-accent-primary)] transition-colors text-white/70 hover:text-white"
                          >
                            {messageLoading === (p.userId || p._id) ? (
                              <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                            ) : (
                              '💬'
                            )}
                          </button>
                          <button className="w-8 h-8 rounded-full border border-[var(--az-border)] flex items-center justify-center hover:bg-[var(--az-accent-rose)] transition-colors text-white/70">❤️</button>
                        </div>
                        <button
                          onClick={() => handleTipClick(p)}
                          className={`px-4 py-1.5 text-[10px] font-bold rounded-full border transition-all duration-300
                            ${flashingTips[p.userId || p._id || '']
                              ? 'bg-green-950/40 border-green-500 text-green-500 shadow-[0_0_12px_rgba(34,197,94,0.3)] scale-105'
                              : 'bg-[var(--az-bg-tertiary)] text-[var(--az-text-primary)] border-[var(--az-border)] hover:border-[var(--az-accent-gold)] hover:bg-[var(--az-accent-primary)]/10 hover:text-[var(--az-accent-gold)]'}`}
                        >
                          Send Tip
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="w-full text-center py-10 text-[var(--az-text-muted)] font-serif italic text-sm">
                No recommendation for you at the moment. Check your internet connection or come back later.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Dating app cross promotion circular button */}
      <DatingCrossPromo />

      {/* Free Rewards daily checkin and tasks button */}
      <RewardsButton />
    </div>
  );
};

export default AdultHome;
