import React from 'react';
import { Link } from 'react-router-dom';

const AdultHome: React.FC = () => {
  const serviceCards = [
    {
      id: 'cams',
      title: 'Live Cams',
      tagline: 'Watch stunning performers live, tip to interact',
      icon: '📹',
      stats: '🔴 340 online',
      path: '/adult/cams',
      color: 'from-red-900/40'
    },
    {
      id: 'rooms',
      title: 'Naughty Rooms',
      tagline: 'Join themed group chat rooms, no limits',
      icon: '🔞',
      stats: '🔴 1.2K active',
      path: '/adult/rooms',
      color: 'from-purple-900/40'
    },
    {
      id: 'sext',
      title: 'Private Sext',
      tagline: 'One-on-one explicit text & photo exchange',
      icon: '💬',
      stats: '🔴 3.4K chatting',
      path: '/adult/sext',
      color: 'from-pink-900/40'
    },
    {
      id: 'random',
      title: 'Random Stranger',
      tagline: 'Matched with a random adult, no names needed',
      icon: '🎲',
      stats: '🔴 890 waiting',
      path: '/adult/random',
      color: 'from-indigo-900/40'
    },
    {
      id: 'hookup',
      title: 'Hook Up Tonight',
      tagline: 'Find someone nearby for tonight',
      icon: '🌙',
      stats: '🔴 150 nearby',
      path: '/adult/hookup',
      color: 'from-orange-900/40'
    },
    {
      id: 'vip',
      title: 'VIP Lounge',
      tagline: 'Premium members only — exclusive content',
      icon: '⭐',
      stats: '🔴 Elite access',
      path: '/adult/vip',
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
            <Link to="/adult/cams" className="text-[10px] font-bold uppercase tracking-widest text-[var(--az-accent-gold)] hover:underline">
              View All
            </Link>
          </div>

          <div className="flex gap-6 overflow-x-auto pb-8 no-scrollbar snap-x snap-mandatory">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="min-w-[280px] h-96 bg-[var(--az-bg-secondary)] rounded-xl border border-[var(--az-border)] overflow-hidden snap-start flex-shrink-0 group">
                <div className="h-2/3 relative">
                  <img src="/placeholder.svg" alt="Performer" className="w-full h-full object-cover filter blur-[2px] group-hover:blur-0 transition-all duration-500" />
                  <div className="absolute top-3 left-3 flex gap-2">
                    <span className="bg-[var(--az-accent-primary)] text-white text-[8px] font-bold px-1.5 py-0.5 rounded uppercase">🔴 Live</span>
                    <span className="bg-black/50 text-white text-[8px] font-bold px-1.5 py-0.5 rounded uppercase">New</span>
                  </div>
                </div>
                <div className="p-4 flex flex-col justify-between h-1/3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-serif italic text-white text-lg">Amara Lux {i}</h4>
                      <p className="text-[10px] text-[var(--az-text-secondary)] uppercase tracking-tighter">23 • London, UK</p>
                    </div>
                    <div className="text-[var(--az-accent-gold)] text-sm">⭐ 4.9</div>
                  </div>
                  <div className="flex items-center justify-between mt-4">
                    <div className="flex gap-2">
                      <button className="w-8 h-8 rounded-full border border-[var(--az-border)] flex items-center justify-center hover:bg-[var(--az-accent-primary)] transition-colors">💬</button>
                      <button className="w-8 h-8 rounded-full border border-[var(--az-border)] flex items-center justify-center hover:bg-[var(--az-accent-rose)] transition-colors">❤️</button>
                    </div>
                    <button className="px-4 py-1.5 bg-[var(--az-bg-tertiary)] text-[var(--az-text-primary)] text-[10px] font-bold rounded-full border border-[var(--az-border)] hover:border-[var(--az-accent-gold)] transition-colors">
                      Send Tip
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default AdultHome;
