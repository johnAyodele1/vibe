import React, { useState } from 'react';

const HookUpTonight: React.FC = () => {
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');

  const profiles = Array.from({ length: 10 }, (_, i) => ({
    id: i,
    name: ['Sophie', 'Jessica', 'Chloe', 'Amber', 'Mia'][i % 5],
    age: 21 + (i % 8),
    distance: `${(Math.random() * 5).toFixed(1)} km`,
    intention: ['Tonight Only', 'FWB', 'Casual'][i % 3],
    isVerified: i % 3 === 0,
    isOnline: i % 2 === 0,
    photoUrl: [
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?q=80&w=600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=600&auto=format&fit=crop",
    ][i % 5]
  }));

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-6">
        <div>
          <h1 className="text-4xl font-serif italic text-[var(--az-text-primary)] mb-2">Hook Up Tonight</h1>
          <p className="text-[var(--az-text-secondary)] font-serif italic">Someone desires you right now.</p>
        </div>

        <div className="flex items-center gap-4 bg-[var(--az-bg-secondary)] p-1 rounded-full border border-[var(--az-border)]">
          <button
            onClick={() => setViewMode('grid')}
            className={`px-6 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${viewMode === 'grid' ? 'bg-[var(--az-accent-primary)] text-white' : 'text-[var(--az-text-secondary)]'}`}
          >
            Grid
          </button>
          <button
            onClick={() => setViewMode('map')}
            className={`px-6 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${viewMode === 'map' ? 'bg-[var(--az-accent-primary)] text-white' : 'text-[var(--az-text-secondary)]'}`}
          >
            Map
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Filters Sidebar */}
        <aside className="w-full lg:w-64 flex-shrink-0">
          <div className="az-glass border border-[var(--az-border)] rounded-2xl p-6 space-y-8 sticky top-24">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--az-text-muted)] mb-4 block">Distance:</label>
              <div className="grid grid-cols-2 gap-2">
                {['< 1km', '< 5km', '< 10km', 'Any'].map(d => (
                  <button key={d} className="py-2 bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-lg text-[10px] font-bold text-[var(--az-text-secondary)] hover:border-[var(--az-accent-primary)]">
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--az-text-muted)] mb-4 block">Online Now Only:</label>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--az-text-secondary)]">Show active users</span>
                <div className="w-10 h-5 bg-[var(--az-accent-primary)] rounded-full relative cursor-pointer">
                  <div className="absolute right-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow" />
                </div>
              </div>
            </div>

            <button className="w-full py-3 bg-[var(--az-bg-tertiary)] text-[var(--az-text-primary)] text-[10px] font-bold uppercase tracking-widest rounded-xl border border-[var(--az-border)] hover:bg-[var(--az-bg-secondary)] transition-colors">
              Reset All Filters
            </button>
          </div>
        </aside>

        {/* Profiles Grid */}
        <div className="flex-grow">
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
              {profiles.map((p) => (
                <div key={p.id} className="relative aspect-[2/3] rounded-xl overflow-hidden border border-[var(--az-border)] bg-[var(--az-bg-secondary)] group cursor-pointer az-card-hover">
                  <img src={p.photoUrl} className="w-full h-full object-cover filter blur-sm group-hover:blur-0 transition-all duration-500" />

                  {p.isOnline && (
                    <div className="absolute top-3 left-3 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-black shadow-[0_0_8px_green]" />
                  )}

                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent p-4 flex flex-col justify-end">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-lg font-serif italic text-white">{p.name}, {p.age}</h4>
                      {p.isVerified && <span className="text-[10px] text-[var(--az-accent-gold)]">⭐</span>}
                    </div>
                    <p className="text-[10px] text-[var(--az-text-secondary)] font-bold uppercase tracking-tighter mb-3">{p.distance} away</p>

                    <div className="flex gap-2">
                      <span className="bg-white/10 backdrop-blur-md text-white text-[8px] font-bold px-2 py-1 rounded uppercase tracking-widest border border-white/20">
                        {p.intention}
                      </span>
                    </div>

                    <div className="flex justify-between items-center mt-4 opacity-0 group-hover:opacity-100 transition-opacity translate-y-4 group-hover:translate-y-0 duration-300">
                      <button className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center hover:bg-[var(--az-accent-primary)] transition-colors">❤️</button>
                      <button className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center hover:bg-[var(--az-accent-rose)] transition-colors">💬</button>
                      <button className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center hover:bg-[var(--az-accent-gold)] transition-colors">⚡</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="w-full h-[600px] bg-[var(--az-bg-secondary)] rounded-2xl border border-[var(--az-border)] flex items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 opacity-20 grayscale filter invert az-grain" style={{ backgroundImage: 'url("https://www.google.com/maps/vt/pb=!1m4!1m3!1i12!2i1234!3i2345!2m3!1e0!2sm!3i123456789!3m8!2sen!3sus!5e1105!12m4!1e68!2m2!1sset!2sRoadmap!4e0!5m1!5f2!23i123456")' }} />
              <div className="relative z-10 text-center">
                <div className="text-4xl mb-4">📍</div>
                <h3 className="text-xl font-serif italic text-[var(--az-text-primary)]">Map view is loading...</h3>
                <p className="text-xs text-[var(--az-text-secondary)] mt-2">Discovering nearby desires</p>
              </div>

              {/* Fake Pulse Rings */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 border border-[var(--az-accent-primary)] rounded-full animate-ping opacity-20" />
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 border border-[var(--az-accent-primary)] rounded-full animate-ping-slow opacity-10" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HookUpTonight;
