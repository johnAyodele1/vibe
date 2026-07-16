import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../../config';

const LiveCams: React.FC = () => {
  const filters = ['All', 'Girls', 'Guys', 'Couples', 'Trans', 'New', 'Top Rated', 'Free', 'HD'];
  const [performers, setPerformers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('All');

  useEffect(() => {
    const fetchPerformers = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${API_BASE_URL}/adult/providers?category=${activeFilter}`);
        const data = await response.json();
        if (data.success) {
          setPerformers(data.data.providers);
        }
      } catch (err) {
        console.error('Failed to fetch performers:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchPerformers();
  }, [activeFilter]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      {/* Filter Bar */}
      <div className="flex gap-3 overflow-x-auto pb-6 no-scrollbar mb-8">
        {filters.map((filter) => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            className={`px-6 py-2 rounded-full text-xs font-bold uppercase tracking-widest whitespace-nowrap border transition-all ${
              activeFilter === filter
                ? 'bg-[var(--az-accent-primary)] border-transparent text-white'
                : 'bg-[var(--az-bg-secondary)] border-[var(--az-border)] text-[var(--az-text-secondary)] hover:border-[var(--az-accent-rose)]'
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      <h2 className="text-3xl font-serif italic text-[var(--az-text-primary)] mb-8 flex items-center gap-3">
        <span className="w-2 h-2 rounded-full bg-[var(--az-accent-primary)] az-pulse-red" />
        Live Performers
      </h2>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {loading ? (
          [1,2,3,4].map(i => <div key={i} className="aspect-[3/4] bg-[var(--az-bg-secondary)] rounded-xl animate-pulse" />)
        ) : performers.length === 0 ? (
          <div className="col-span-full py-20 text-center">
            <p className="text-[var(--az-text-secondary)] font-serif italic">No performers found in this category.</p>
          </div>
        ) : performers.map((p) => (
          <div
            key={p._id}
            className={`group bg-[var(--az-bg-secondary)] rounded-xl border overflow-hidden az-card-hover ${
              p.providerProfile?.isLive ? 'border-[var(--az-accent-gold)]' : 'border-[var(--az-border)]'
            }`}
          >
            <div className="aspect-[3/4] relative overflow-hidden bg-black">
              <img
                src={p.photos?.[0]?.url || "/placeholder.svg"}
                alt={p.firstName}
                className="w-full h-full object-cover opacity-70 group-hover:scale-110 transition-transform duration-700"
              />

              <div className="absolute top-3 left-3 flex gap-2">
                {p.providerProfile?.isLive && (
                  <span className="bg-[var(--az-accent-primary)] text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-[0_0_8px_var(--az-glow)] az-pulse-red">
                    LIVE
                  </span>
                )}
                {p.providerProfile?.rating > 4.5 && (
                  <span className="bg-[var(--az-accent-gold)] text-black text-[10px] font-bold px-2 py-0.5 rounded shadow-[0_0_8px_var(--az-accent-gold)]">
                    TOP
                  </span>
                )}
              </div>

              <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded flex items-center gap-1">
                <span className="text-[10px] text-white font-mono">👁️ {p.providerProfile?.viewerCount || 0}</span>
              </div>

              <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black via-black/40 to-transparent">
                <h3 className="text-lg font-serif italic text-white flex items-center gap-2">
                  {p.firstName} <span className="text-sm">{p.providerProfile?.country || '🌍'}</span>
                </h3>
                <div className="flex flex-wrap gap-2 mt-2">
                  {p.providerProfile?.tags?.slice(0, 3).map((tag: string) => (
                    <span key={tag} className="text-[8px] text-[var(--az-text-secondary)] uppercase font-bold">#{tag}</span>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-3 flex items-center justify-between gap-2">
              <button className="flex-grow py-2 bg-[var(--az-bg-tertiary)] hover:bg-[var(--az-accent-primary)] text-[var(--az-text-primary)] text-[10px] font-bold uppercase tracking-widest rounded-lg transition-colors border border-[var(--az-border)]">
                Watch Now
              </button>
              <button className="p-2 aspect-square rounded-lg border border-[var(--az-border)] text-[var(--az-text-secondary)] hover:text-[var(--az-accent-rose)] transition-colors">
                ❤️
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LiveCams;
