import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../../config';

interface Party {
  _id: string;
  title: string;
  tagline?: string;
  coverImage: string;
  startDate: string;
  venueName: string;
  startingPrice?: number;
  isSoldOut?: boolean;
  location?: { city?: string };
  genres?: string[];
}

export const PartiesPage: React.FC = () => {
  const navigate = useNavigate();
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [cityFilter, setCityFilter] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('');

  const genresList = ['afrobeats', 'hip-hop', 'amapiano', 'reggae', 'rave', 'vip'];

  useEffect(() => {
    const fetchParties = async () => {
      setLoading(true);
      try {
        let url = `${API_BASE_URL}/parties?`;
        if (cityFilter) url += `city=${encodeURIComponent(cityFilter)}&`;
        if (selectedGenre) url += `genre=${encodeURIComponent(selectedGenre)}&`;

        const res = await fetch(url);
        const data = await res.json();
        if (data.success && Array.isArray(data.parties)) {
          setParties(data.parties);
        }
      } catch (err) {
        console.error('Error fetching parties:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchParties();
  }, [cityFilter, selectedGenre]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif italic text-white">Upcoming Parties & Events</h1>
          <p className="text-sm text-[var(--az-text-secondary)]">Buy official party tickets with QR entry check-in</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/me/tickets')}
            className="px-5 py-2.5 bg-neutral-800 border border-neutral-700 text-white text-xs font-bold rounded-full hover:bg-neutral-700 transition-colors"
          >
            🎟 My Tickets
          </button>
          <button
            onClick={() => navigate('/parties/create')}
            className="px-6 py-2.5 bg-[var(--az-accent-primary)] text-white text-xs font-bold uppercase tracking-wider rounded-full hover:scale-105 transition-transform"
          >
            + Host a Party
          </button>
        </div>
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

      {/* Parties Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-72 rounded-2xl bg-[var(--az-bg-secondary)] animate-pulse" />
          ))}
        </div>
      ) : parties.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {parties.map((party) => (
            <div
              key={party._id}
              onClick={() => navigate(`/parties/${party._id}`)}
              className="group rounded-2xl overflow-hidden bg-[var(--az-bg-secondary)] border border-[var(--az-border)] hover:border-[var(--az-accent-rose)] cursor-pointer transition-all flex flex-col justify-between"
            >
              <div className="relative aspect-[16/9] overflow-hidden bg-[#130b0e]">
                <img
                  src={party.coverImage}
                  alt={party.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                {party.isSoldOut && (
                  <span className="absolute top-3 right-3 px-3 py-1 rounded-full bg-red-600 text-white text-[10px] font-bold uppercase">
                    Sold Out
                  </span>
                )}
              </div>
              <div className="p-5 flex flex-col justify-between gap-4">
                <div>
                  <h3 className="font-serif italic text-xl text-white group-hover:text-[var(--az-accent-rose)] transition-colors line-clamp-2">
                    {party.title}
                  </h3>
                  <p className="text-xs text-[var(--az-text-secondary)] mt-1">
                    🗓 {new Date(party.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} • 📍 {party.venueName}
                  </p>
                </div>
                <div className="flex items-center justify-between text-xs pt-3 border-t border-[var(--az-border)]">
                  <span className="font-mono font-bold text-[var(--az-accent-gold)]">
                    {party.startingPrice ? `From ₦${party.startingPrice.toLocaleString()}` : 'Free'}
                  </span>
                  <span className="text-[var(--az-accent-rose)] font-bold">Buy Ticket →</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 text-[var(--az-text-muted)] italic font-serif">
          No upcoming parties found matching your search.
        </div>
      )}
    </div>
  );
};
export default PartiesPage;
