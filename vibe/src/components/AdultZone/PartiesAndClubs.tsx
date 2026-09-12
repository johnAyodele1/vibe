import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../../config';

interface ClubItem {
  _id: string;
  name: string;
  slug: string;
  coverImage?: string;
  location?: { city?: string; address?: string };
  isOpenTonight?: boolean;
  genres?: string[];
}

interface PartyItem {
  _id: string;
  title: string;
  coverImage: string;
  startDate: string;
  venueName: string;
  startingPrice?: number;
  isSoldOut?: boolean;
  location?: { city?: string };
}

export const PartiesAndClubs: React.FC = () => {
  const navigate = useNavigate();
  const [openClubs, setOpenClubs] = useState<ClubItem[]>([]);
  const [upcomingParties, setUpcomingParties] = useState<PartyItem[]>([]);
  const [loadingClubs, setLoadingClubs] = useState(true);
  const [loadingParties, setLoadingParties] = useState(true);

  useEffect(() => {
    const fetchClubs = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/clubs?openToday=true&limit=10`);
        const data = await res.json();
        if (data.success && Array.isArray(data.clubs)) {
          setOpenClubs(data.clubs);
        }
      } catch (err) {
        console.error('Failed to fetch open clubs:', err);
      } finally {
        setLoadingClubs(false);
      }
    };

    const fetchParties = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/parties?limit=10`);
        const data = await res.json();
        if (data.success && Array.isArray(data.parties)) {
          setUpcomingParties(data.parties);
        }
      } catch (err) {
        console.error('Failed to fetch upcoming parties:', err);
      } finally {
        setLoadingParties(false);
      }
    };

    fetchClubs();
    fetchParties();
  }, []);

  return (
    <section className="w-full py-8 space-y-8">
      {/* ── CLUBS SECTION ────────────────────────────────────────── */}
      {(!loadingClubs && openClubs.length > 0) && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <div>
              <h2 className="text-2xl font-serif italic text-white flex items-center gap-2">
                Open Tonight 🎉
              </h2>
              <p className="text-xs text-[var(--az-text-secondary)]">Clubs and venues open right now</p>
            </div>
            <button
              onClick={() => navigate('/clubs')}
              className="text-xs font-bold text-[var(--az-accent-rose)] hover:underline"
            >
              See all →
            </button>
          </div>

          <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar snap-x snap-mandatory">
            {openClubs.map((club) => (
              <div
                key={club._id}
                onClick={() => navigate(`/clubs/${club._id}`)}
                className="flex-shrink-0 w-44 rounded-2xl overflow-hidden bg-[var(--az-bg-secondary)] border border-[var(--az-border)] cursor-pointer snap-start hover:scale-[0.98] transition-transform"
              >
                <div className="relative aspect-[16/10] bg-[#1a0f14] overflow-hidden">
                  <img
                    src={club.coverImage || 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=600&auto=format&fit=crop'}
                    alt={club.name}
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-green-500/20 border border-green-500/40 text-[10px] font-bold text-green-400">
                    🟢 Open Tonight
                  </span>
                </div>
                <div className="p-3">
                  <h3 className="font-semibold text-sm text-white truncate">{club.name}</h3>
                  <p className="text-xs text-[var(--az-text-muted)] truncate">{club.location?.city || 'Lagos'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── PARTIES SECTION ──────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <div>
            <h2 className="text-2xl font-serif italic text-white flex items-center gap-2">
              Upcoming Parties 🎟
            </h2>
            <p className="text-xs text-[var(--az-text-secondary)]">Buy tickets before they sell out</p>
          </div>
          <button
            onClick={() => navigate('/parties')}
            className="text-xs font-bold text-[var(--az-accent-rose)] hover:underline"
          >
            See all →
          </button>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar snap-x snap-mandatory">
          {loadingParties ? (
            [1, 2, 3].map((i) => (
              <div key={i} className="flex-shrink-0 w-56 aspect-[16/9] bg-[var(--az-bg-secondary)] rounded-2xl animate-pulse" />
            ))
          ) : upcomingParties.length > 0 ? (
            upcomingParties.map((party) => (
              <div
                key={party._id}
                onClick={() => navigate(`/parties/${party._id}`)}
                className="flex-shrink-0 w-56 rounded-2xl overflow-hidden bg-[var(--az-bg-secondary)] border border-[var(--az-border)] cursor-pointer snap-start hover:scale-[0.98] transition-transform flex flex-col justify-between"
              >
                <div className="relative aspect-[16/9] bg-[#1a0f14] overflow-hidden">
                  <img
                    src={party.coverImage}
                    alt={party.title}
                    className="w-full h-full object-cover"
                  />
                  {party.isSoldOut && (
                    <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-bold uppercase">
                      Sold Out
                    </span>
                  )}
                </div>
                <div className="p-3 flex flex-col gap-1">
                  <h3 className="font-semibold text-sm text-white line-clamp-2 leading-snug">{party.title}</h3>
                  <p className="text-xs text-[var(--az-text-muted)]">
                    {new Date(party.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs font-bold font-mono text-[var(--az-accent-gold)]">
                      {party.startingPrice ? `From ₦${party.startingPrice.toLocaleString()}` : 'Free Entry'}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider font-bold text-[var(--az-accent-rose)]">
                      Get Ticket →
                    </span>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-xs text-[var(--az-text-muted)] italic py-4">No upcoming parties listed yet.</div>
          )}

          {/* Create Party CTA Card */}
          <div
            onClick={() => navigate('/parties/create')}
            className="flex-shrink-0 w-36 aspect-[16/9] h-full min-h-[160px] rounded-2xl border-2 border-dashed border-[var(--az-border)] hover:border-[var(--az-accent-crimson)] flex flex-col items-center justify-center gap-2 cursor-pointer text-[var(--az-text-muted)] hover:text-[var(--az-accent-crimson)] transition-colors snap-start"
          >
            <span className="text-3xl font-light">+</span>
            <span className="text-xs font-bold uppercase tracking-wider">Host a party</span>
          </div>
        </div>
      </div>
    </section>
  );
};
