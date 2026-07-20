import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../../config';
import { useTipSheetStore } from './useTipSheetStore';
import { toast } from 'sonner';

const FALLBACK_PERFORMERS = [
  {
    _id: "mock-1",
    firstName: "Amara Lux",
    providerProfile: {
      isLive: true,
      rating: { average: 4.9, count: 120 },
      viewerCount: 245,
      country: "🇬🇧",
      tags: ["sensual", "brunette", "tattooed"],
    },
    photos: [{ url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=600&auto=format&fit=crop" }],
    age: 23,
    country: "London, UK"
  },
  {
    _id: "mock-2",
    firstName: "Elena Rostova",
    providerProfile: {
      isLive: true,
      rating: { average: 4.8, count: 85 },
      viewerCount: 189,
      country: "🇫🇷",
      tags: ["petite", "blonde", "elegant"],
    },
    photos: [{ url: "https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=600&auto=format&fit=crop" }],
    age: 22,
    country: "Paris, FR"
  },
  {
    _id: "mock-3",
    firstName: "Zara Brooks",
    providerProfile: {
      isLive: false,
      rating: { average: 4.7, count: 50 },
      viewerCount: 0,
      country: "🇯🇵",
      tags: ["exotic", "cosplay", "gaming"],
    },
    photos: [{ url: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=600&auto=format&fit=crop" }],
    age: 24,
    country: "Tokyo, JP"
  },
  {
    _id: "mock-4",
    firstName: "Sasha Grey",
    providerProfile: {
      isLive: true,
      rating: { average: 4.9, count: 210 },
      viewerCount: 312,
      country: "🇩🇪",
      tags: ["goth", "alt", "ebony"],
    },
    photos: [{ url: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?q=80&w=600&auto=format&fit=crop" }],
    age: 26,
    country: "Berlin, DE"
  },
  {
    _id: "mock-5",
    firstName: "Marcus Vance",
    providerProfile: {
      isLive: true,
      rating: { average: 4.9, count: 42 },
      viewerCount: 94,
      country: "🇺🇸",
      tags: ["muscle", "charismatic", "dominant"],
    },
    photos: [{ url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=600&auto=format&fit=crop" }],
    age: 25,
    country: "New York, US"
  },
  {
    _id: "mock-6",
    firstName: "Dominic Cruz",
    providerProfile: {
      isLive: false,
      rating: { average: 4.6, count: 31 },
      viewerCount: 0,
      country: "🇺🇸",
      tags: ["athletic", "charming", "sensual"],
    },
    photos: [{ url: "https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?q=80&w=600&auto=format&fit=crop" }],
    age: 27,
    country: "Miami, US"
  }
];

const AdultHome: React.FC = () => {
  const navigate = useNavigate();
  const openSheet = useTipSheetStore((state) => state.openSheet);

  const [performers, setPerformers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [messageLoading, setMessageLoading] = useState<string | null>(null);
  const [flashingTips, setFlashingTips] = useState<Record<string, boolean>>({});

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
    } catch (err) {
      toast.error('Could not start conversation. Please try again.');
    } finally {
      setMessageLoading(null);
    }
  };

  const handleTipClick = (p: any) => {
    const photoUrl = p.profilePhoto || p.photos?.[0]?.url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=600&auto=format&fit=crop";
    const displayName = p.displayName || p.providerProfile?.stageName || p.firstName;
    const userId = p.userId || p._id;
    openSheet({
      userId,
      stageName: displayName,
      avatarUrl: photoUrl,
      isOnline: p.providerProfile?.isLive || false
    });
  };

  useEffect(() => {
    const fetchPerformers = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/adult/providers`);
        const data = await response.json();
        if (data.success && data.data.providers && data.data.providers.length > 0) {
          setPerformers(data.data.providers.slice(0, 6));
        } else {
          setPerformers(FALLBACK_PERFORMERS);
        }
      } catch (err) {
        console.error('Failed to fetch performers for home page:', err);
        setPerformers(FALLBACK_PERFORMERS);
      } finally {
        setLoading(false);
      }
    };
    fetchPerformers();
  }, []);

  const serviceCards = [
    {
      id: 'cams',
      title: 'Live Cams',
      tagline: 'Watch stunning performers live, tip to interact',
      icon: '📹',
      stats: '🔴 340 online',
      path: '/cams',
      color: 'from-red-900/40'
    },
    {
      id: 'rooms',
      title: 'Naughty Rooms',
      tagline: 'Join themed group chat rooms, no limits',
      icon: '🔞',
      stats: '🔴 1.2K active',
      path: '/rooms',
      color: 'from-purple-900/40'
    },
    {
      id: 'sext',
      title: 'Private Sext',
      tagline: 'One-on-one explicit text & photo exchange',
      icon: '💬',
      stats: '🔴 3.4K chatting',
      path: '/sext',
      color: 'from-pink-900/40'
    },
    {
      id: 'random',
      title: 'Random Stranger',
      tagline: 'Matched with a random adult, no names needed',
      icon: '🎲',
      stats: '🔴 890 waiting',
      path: '/random',
      color: 'from-indigo-900/40'
    },
    {
      id: 'hookup',
      title: 'Hook Up Tonight',
      tagline: 'Find someone nearby for tonight',
      icon: '🌙',
      stats: '🔴 150 nearby',
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
      <section className="relative h-[80vh] flex items-center justify-center overflow-hidden px-4">
        {/* Animated Background Mesh */}
        <div className="absolute inset-0 z-0">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[var(--az-accent-primary)] rounded-full blur-[120px] opacity-20 animate-pulse" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[var(--az-accent-rose)] rounded-full blur-[120px] opacity-10" />
        </div>

        <div className="relative z-10 text-center max-w-4xl mx-auto">
          <div className="flex justify-center gap-4 mb-6">
            <span className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] text-[var(--az-text-secondary)] text-[10px] px-3 py-1 rounded-full uppercase tracking-widest font-bold">
              🔴 1,240 Live Now
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
            <button className="w-full sm:w-auto px-10 py-4 bg-[var(--az-accent-primary)] text-white font-bold uppercase tracking-widest rounded-full shadow-[0_0_20px_var(--az-glow)] hover:scale-105 active:scale-95 transition-all">
              Explore Now
            </button>
            <button className="w-full sm:w-auto px-10 py-4 border-2 border-[var(--az-accent-rose)] text-[var(--az-accent-rose)] font-bold uppercase tracking-widest rounded-full hover:bg-[var(--az-accent-rose)] hover:text-white transition-all">
              View Live Now
            </button>
          </div>

          <div className="mt-8">
            <Link
              to="/dating"
              className="inline-flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-pink-500 to-red-500 hover:from-pink-600 hover:to-red-600 text-white font-bold uppercase tracking-wider rounded-full shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-0.5"
            >
              <span>Want something deeper? Join the Dating App ❤️</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Service Cards Grid */}
      <section className="max-w-7xl mx-auto px-4 py-20 w-full">
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
            <Link to="/cams" className="text-[10px] font-bold uppercase tracking-widest text-[var(--az-accent-gold)] hover:underline">
              View All
            </Link>
          </div>

          <div className="flex gap-6 overflow-x-auto pb-8 no-scrollbar snap-x snap-mandatory">
            {loading ? (
              [1, 2, 3, 4].map(i => (
                <div key={i} className="min-w-[280px] h-96 bg-[var(--az-bg-secondary)] rounded-xl border border-[var(--az-border)] overflow-hidden snap-start flex-shrink-0 animate-pulse" />
              ))
            ) : (
              performers.map((p) => {
                const photoUrl = p.profilePhoto || p.photos?.[0]?.url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=600&auto=format&fit=crop";
                const isLiveNow = p.providerProfile?.isLive;
                const ratingVal = typeof p.providerProfile?.rating === 'object' ? p.providerProfile?.rating?.average : p.providerProfile?.rating;
                const displayName = p.displayName || p.providerProfile?.stageName || p.firstName;
                return (
                  <div key={p._id} className="min-w-[280px] h-96 bg-[var(--az-bg-secondary)] rounded-xl border border-[var(--az-border)] overflow-hidden snap-start flex-shrink-0 group">
                    <div className="h-2/3 relative">
                      <img src={photoUrl} alt={displayName} className="w-full h-full object-cover filter blur-[1px] group-hover:blur-0 transition-all duration-500" />
                      <div className="absolute top-3 left-3 flex gap-2">
                        {isLiveNow && (
                          <span className="bg-[var(--az-accent-primary)] text-white text-[8px] font-bold px-1.5 py-0.5 rounded uppercase">🔴 Live</span>
                        )}
                        <span className="bg-black/50 text-white text-[8px] font-bold px-1.5 py-0.5 rounded uppercase">New</span>
                      </div>
                    </div>
                    <div className="p-4 flex flex-col justify-between h-1/3">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-serif italic text-white text-lg">{displayName}</h4>
                          <p className="text-[10px] text-[var(--az-text-secondary)] uppercase tracking-tighter">{p.age || 23} • {p.country || 'London, UK'}</p>
                        </div>
                        <div className="text-[var(--az-accent-gold)] text-sm">⭐ {ratingVal || 4.9}</div>
                      </div>
                      <div className="flex items-center justify-between mt-4">
                        <div className="flex gap-2">
                          <button
                            data-testid="provider-card-message-btn"
                            disabled={messageLoading !== null}
                            onClick={() => handleMessageClick(p.userId || p._id)}
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
                            ${flashingTips[p.userId || p._id]
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
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default AdultHome;
