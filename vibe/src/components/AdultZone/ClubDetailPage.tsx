import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../../config';

interface ClubDetail {
  _id: string;
  name: string;
  description?: string;
  tagline?: string;
  coverImage?: string;
  logoImage?: string;
  gallery?: Array<{ url: string; caption?: string }>;
  location?: { city?: string; address?: string; country?: { name?: string } };
  website?: string;
  instagram?: string;
  phone?: string;
  operatingHours?: Array<{ day: number; isOpen: boolean; openTime?: string; closeTime?: string }>;
  entryFee?: { hasEntryFee: boolean; amount?: number; description?: string };
  genres?: string[];
  vibes?: string[];
  isOpenTonight?: boolean;
}

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const ClubDetailPage: React.FC = () => {
  const { clubId } = useParams<{ clubId: string }>();
  const navigate = useNavigate();
  const [club, setClub] = useState<ClubDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchClub = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/clubs/${clubId}`);
        const data = await res.json();
        if (data.success && data.club) {
          setClub(data.club);
        }
      } catch (err) {
        console.error('Error fetching club detail:', err);
      } finally {
        setLoading(false);
      }
    };
    if (clubId) fetchClub();
  }, [clubId]);

  if (loading) {
    return <div className="max-w-4xl mx-auto px-4 py-16 text-center text-white font-serif">Loading venue detail...</div>;
  }

  if (!club) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
        <h2 className="text-2xl text-white font-serif">Venue Not Found</h2>
        <button onClick={() => navigate('/clubs')} className="px-6 py-2 bg-[var(--az-accent-rose)] text-white font-bold text-xs rounded-full">
          Back to Clubs
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Cover Banner */}
      <div className="relative aspect-[16/8] rounded-3xl overflow-hidden bg-[#150a0f] border border-[var(--az-border)]">
        <img
          src={club.coverImage || 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=1200&auto=format&fit=crop'}
          alt={club.name}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent flex flex-col justify-end p-6 md:p-8">
          <div className="flex flex-wrap items-center gap-3 mb-2">
            {club.isOpenTonight && (
              <span className="px-3 py-1 rounded-full bg-green-500/30 border border-green-500 text-green-400 text-xs font-bold">
                🟢 Open Tonight
              </span>
            )}
            {club.genres?.map((g) => (
              <span key={g} className="px-3 py-1 rounded-full bg-black/60 border border-white/20 text-white text-xs font-bold uppercase">
                {g}
              </span>
            ))}
          </div>
          <h1 className="text-3xl md:text-5xl font-serif italic text-white">{club.name}</h1>
          {club.tagline && <p className="text-sm md:text-base text-neutral-300 font-serif italic mt-1">{club.tagline}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] p-6 rounded-2xl space-y-4">
            <h2 className="text-xl font-serif italic text-white">About the Venue</h2>
            <p className="text-sm text-neutral-300 leading-relaxed whitespace-pre-line">
              {club.description || 'Welcome to ' + club.name + '. Experience premium vibes, amazing music, and energetic nightlife.'}
            </p>
          </div>

          {/* Gallery */}
          {club.gallery && club.gallery.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-serif italic text-white">Gallery</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {club.gallery.map((img, i) => (
                  <div key={i} className="aspect-square rounded-xl overflow-hidden bg-[#180e12] border border-[var(--az-border)]">
                    <img src={img.url} alt={img.caption || club.name} className="w-full h-full object-cover hover:scale-105 transition-transform" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Info */}
        <div className="space-y-6">
          {/* Location & Contact */}
          <div className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] p-6 rounded-2xl space-y-4">
            <h3 className="text-base font-bold text-white uppercase tracking-wider">Location & Info</h3>
            <div className="space-y-3 text-xs text-neutral-300">
              <div className="flex items-start gap-2">
                <span>📍</span>
                <div>
                  <p className="font-bold text-white">{club.location?.address || 'City Address'}</p>
                  <p>{club.location?.city || 'Lagos'}</p>
                </div>
              </div>
              {club.phone && (
                <div className="flex items-center gap-2">
                  <span>📞</span>
                  <span>{club.phone}</span>
                </div>
              )}
              {club.instagram && (
                <div className="flex items-center gap-2">
                  <span>📷</span>
                  <a href={`https://instagram.com/${club.instagram.replace('@', '')}`} target="_blank" rel="noreferrer" className="text-[var(--az-accent-rose)] hover:underline">
                    {club.instagram}
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Operating Hours */}
          <div className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] p-6 rounded-2xl space-y-4">
            <h3 className="text-base font-bold text-white uppercase tracking-wider">Opening Hours</h3>
            <div className="space-y-2 text-xs">
              {dayNames.map((dayName, idx) => {
                const hour = club.operatingHours?.find((h) => h.day === idx);
                return (
                  <div key={dayName} className="flex justify-between py-1 border-b border-white/5 last:border-0">
                    <span className="text-neutral-400 font-semibold">{dayName}</span>
                    <span className={hour?.isOpen ? 'text-green-400 font-bold' : 'text-neutral-500'}>
                      {hour?.isOpen ? `${hour.openTime || '22:00'} - ${hour.closeTime || '04:00'}` : 'Closed'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
export default ClubDetailPage;
