import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../../config';

interface Club {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  tagline?: string;
  coverImage?: string;
  logoImage?: string;
  location?: { city?: string; address?: string };
  isOpenTonight?: boolean;
  genres?: string[];
  vibes?: string[];
}

export const ClubsPage: React.FC = () => {
  const navigate = useNavigate();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [cityFilter, setCityFilter] = useState('');
  const [openTodayOnly, setOpenTodayOnly] = useState(false);
  const [selectedGenre, setSelectedGenre] = useState('');

  const genresList = ['afrobeats', 'hip-hop', 'amapiano', 'highlife', 'dancehall'];

  useEffect(() => {
    const fetchClubs = async () => {
      setLoading(true);
      try {
        let url = `${API_BASE_URL}/clubs?`;
        if (openTodayOnly) url += `openToday=true&`;
        if (cityFilter) url += `city=${encodeURIComponent(cityFilter)}&`;
        if (selectedGenre) url += `genre=${encodeURIComponent(selectedGenre)}&`;

        const res = await fetch(url);
        const data = await res.json();
        if (data.success && Array.isArray(data.clubs)) {
          setClubs(data.clubs);
        }
      } catch (err) {
        console.error('Error fetching clubs:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchClubs();
  }, [openTodayOnly, cityFilter, selectedGenre]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif italic text-white">Clubs & Venues</h1>
          <p className="text-sm text-[var(--az-text-secondary)]">Discover top lounges, nightclubs, and bars</p>
        </div>
        <button
          onClick={() => navigate('/parties/create')}
          className="px-6 py-2.5 bg-[var(--az-accent-primary)] text-white text-xs font-bold uppercase tracking-wider rounded-full hover:scale-105 transition-transform"
        >
          Submit Venue / Party
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 bg-[var(--az-bg-secondary)] border border-[var(--az-border)] p-4 rounded-2xl">
        <input
          type="text"
          placeholder="Search by city (e.g. Lagos, Abuja)..."
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          className="bg-[var(--az-bg-primary)] border border-[var(--az-border)] text-white text-xs px-4 py-2 rounded-xl outline-none focus:border-[var(--az-accent-rose)]"
        />

        <button
          onClick={() => setOpenTodayOnly(!openTodayOnly)}
          className={`px-4 py-2 rounded-xl text-xs font-bold border transition-colors flex items-center gap-2 ${
            openTodayOnly
              ? 'bg-green-500/20 border-green-500 text-green-400'
              : 'bg-[var(--az-bg-primary)] border-[var(--az-border)] text-[var(--az-text-secondary)]'
          }`}
        >
          <span>🟢 Open Tonight Only</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {genresList.map((genre) => (
            <button
              key={genre}
              onClick={() => setSelectedGenre(selectedGenre === genre ? '' : genre)}
              className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-colors ${
                selectedGenre === genre
                  ? 'bg-[var(--az-accent-rose)] border-[var(--az-accent-rose)] text-white'
                  : 'bg-[var(--az-bg-primary)] border-[var(--az-border)] text-[var(--az-text-muted)] hover:text-white'
              }`}
            >
              {genre}
            </button>
          ))}
        </div>
      </div>

      {/* Clubs Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-64 rounded-2xl bg-[var(--az-bg-secondary)] animate-pulse" />
          ))}
        </div>
      ) : clubs.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {clubs.map((club) => (
            <div
              key={club._id}
              onClick={() => navigate(`/clubs/${club._id}`)}
              className="group rounded-2xl overflow-hidden bg-[var(--az-bg-secondary)] border border-[var(--az-border)] hover:border-[var(--az-accent-rose)] cursor-pointer transition-all"
            >
              <div className="relative aspect-[16/9] overflow-hidden bg-[#130b0e]">
                <img
                  src={club.coverImage || 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=600&auto=format&fit=crop'}
                  alt={club.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                {club.isOpenTonight && (
                  <span className="absolute top-3 left-3 px-3 py-1 rounded-full bg-green-500/20 border border-green-500/40 text-[10px] font-bold text-green-400">
                    🟢 Open Tonight
                  </span>
                )}
              </div>
              <div className="p-5 flex flex-col justify-between gap-3">
                <div>
                  <h3 className="font-serif italic text-xl text-white group-hover:text-[var(--az-accent-rose)] transition-colors">
                    {club.name}
                  </h3>
                  <p className="text-xs text-[var(--az-text-secondary)] mt-1">{club.tagline || club.location?.address || 'Lounge & Bar'}</p>
                </div>
                <div className="flex items-center justify-between text-xs text-[var(--az-text-muted)] pt-3 border-t border-[var(--az-border)]">
                  <span>📍 {club.location?.city || 'Lagos'}</span>
                  <span className="text-[var(--az-accent-rose)] font-bold">View Venue →</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 text-[var(--az-text-muted)] italic font-serif">
          No clubs found matching your filter criteria.
        </div>
      )}
    </div>
  );
};
export default ClubsPage;
