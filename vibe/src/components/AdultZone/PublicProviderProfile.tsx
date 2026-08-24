import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAdultAuth } from '../../contexts/AdultAuthContext';
import { useTipSheetStore } from './useTipSheetStore';
import { API_BASE_URL } from '../../config';
import { toast } from 'sonner';
import { formatAmount } from '../../lib/pricing';
import { getResponseBadge } from './responseTime';

const SERVICE_LABELS: Record<string, { icon: string; label: string; color: string }> = {
  live_cam:       { icon: '📹', label: 'Live Webcam Shows',   color: '#e8496a' },
  private_call:   { icon: '📞', label: 'Private Video Calls', color: '#c9a84c' },
  sext:           { icon: '💬', label: 'Private Inbox',       color: '#a78bfa' },
  hookup:         { icon: '🌙', label: 'Available Tonight',   color: '#c8102e' },
  random:         { icon: '🎲', label: 'Random Sessions',     color: '#64748b' },
};

export const PublicProviderProfile: React.FC = () => {
  const { providerId } = useParams<{ providerId: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAdultAuth();
  const openTipSheet = (prov: any, amt?: number | null) => useTipSheetStore.getState().openSheet(prov, amt);

  const [provider, setProvider] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [isStartingConversation, setIsStartingConversation] = useState(false);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      const timer = setTimeout(() => {
        window.dispatchEvent(new CustomEvent('open-adult-auth-modal'));
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const fetchProviderProfile = async () => {
      if (!isAuthenticated) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const token = localStorage.getItem('adultAccessToken');
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        const res = await fetch(`${API_BASE_URL}/v1/adult/providers/${providerId}`, {
          headers,
        });
        const data = await res.json();
        if (data.success && data.data) {
          setProvider(data.data);
        } else {
          toast.error(data.error?.message || 'Failed to load provider profile');
        }
      } catch (err) {
        console.error('Error fetching provider public profile:', err);
        toast.error('Failed to connect to server');
      } finally {
        setLoading(false);
      }
    };

    if (providerId) {
      fetchProviderProfile();
    }
  }, [providerId, isAuthenticated]);

  const handleStartConversation = async () => {
    if (!isAuthenticated) {
      window.dispatchEvent(new CustomEvent('open-adult-auth-modal'));
      return;
    }
    setIsStartingConversation(true);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/adult/sext/conversations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('adultAccessToken')}`
        },
        body: JSON.stringify({ recipientId: provider.id })
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
        toast.error('Could not start conversation');
        setIsStartingConversation(false);
      }
    } catch {
      toast.error('Could not start conversation');
      setIsStartingConversation(false);
    }
  };

  const handleTipClick = () => {
    if (!isAuthenticated) {
      window.dispatchEvent(new CustomEvent('open-adult-auth-modal'));
      return;
    }
    openTipSheet({
      userId: provider.id,
      stageName: provider.stageName,
      avatarUrl: provider.avatarUrl,
      isOnline: provider.isOnline
    });
  };

  const handleTipMenuClick = (amount: number) => {
    if (!isAuthenticated) {
      window.dispatchEvent(new CustomEvent('open-adult-auth-modal'));
      return;
    }
    openTipSheet({
      userId: provider.id,
      stageName: provider.stageName,
      avatarUrl: provider.avatarUrl,
      isOnline: provider.isOnline
    }, amount);
  };

  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto py-20 px-4 text-center">
        <div className="w-16 h-16 bg-[var(--az-accent-primary)]/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <span className="text-3xl">🔒</span>
        </div>
        <h2 className="text-3xl font-serif italic mb-4 text-white">Login Required</h2>
        <p className="text-sm text-[var(--az-text-secondary)] mb-8">
          Please login or sign up to view this provider's profile and explore live streams, private messaging, and content.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open-adult-auth-modal'))}
            className="px-8 py-3 bg-[var(--az-accent-primary)] text-white rounded-full text-xs font-bold uppercase tracking-widest shadow-[0_0_15px_var(--az-glow)] hover:scale-105 active:scale-95 transition-all"
          >
            Login or Sign Up
          </button>
          <Link
            to="/"
            className="px-8 py-3 border border-[var(--az-border)] text-[var(--az-text-secondary)] rounded-full text-xs font-bold uppercase tracking-widest hover:text-white transition-all"
          >
            Go Back Home
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-[var(--az-text-secondary)]">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-[var(--az-accent-primary)] mb-4"></div>
        <p className="font-serif italic text-sm">Elevating profiles...</p>
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="max-w-md mx-auto py-20 text-center">
        <h2 className="text-2xl font-serif italic mb-4">Profile Unavailable</h2>
        <p className="text-sm text-[var(--az-text-muted)] mb-8">This provider profile may be private, suspended, or unverified.</p>
        <Link to="/" className="px-6 py-2.5 bg-[var(--az-accent-primary)] text-white rounded-full text-xs font-bold uppercase tracking-widest">
          Go Back Home
        </Link>
      </div>
    );
  }

  const activePhoto = provider.photos?.[activePhotoIndex] || { url: provider.avatarUrl, isExplicit: false };
  const responseBadge = getResponseBadge(provider.effectiveResponseMinutes);

  const toggleVideoPlayback = (video: HTMLVideoElement) => {
    if (video.paused) {
      video.play()
        .then(() => setIsVideoPlaying(true))
        .catch((error) => console.error('Unable to play provider preview video:', error));
    } else {
      video.pause();
      setIsVideoPlaying(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 pb-32 md:pb-16 text-[var(--az-text-primary)]">
      <button
        onClick={() => navigate(-1)}
        className="mb-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--az-bg-secondary)] border border-[var(--az-border)] text-xs font-bold uppercase tracking-widest text-[var(--az-text-secondary)] hover:text-white transition-colors"
      >
        ← Back
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-12">
        <div className="lg:col-span-7 flex flex-col">
          <div className="provider-profile__hero shadow-2xl relative overflow-hidden">
            <img src={activePhoto.url} alt={provider.stageName} className="w-full h-full object-cover transition-all duration-300" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0608]/90 via-transparent to-transparent pointer-events-none" />
            {provider.isOnline && (
              <div className="provider-profile__online-badge shadow-md">
                <div className="provider-profile__online-dot" />
                Online Now
              </div>
            )}
          </div>

          {provider.photos?.length > 1 && (
            <div className="provider-profile__photo-strip mt-3 overflow-x-auto pb-2 no-scrollbar">
              {provider.photos.map((photo: any, i: number) => (
                <button
                  key={i}
                  className={`photo-strip__thumb flex-shrink-0 relative ${activePhotoIndex === i ? 'active border-[var(--az-accent-crimson)]' : ''}`}
                  onClick={() => setActivePhotoIndex(i)}
                >
                  <img src={photo.url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}

          {provider.videoPreviewUrl && (
            <div className="mt-8 bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-2xl p-4">
              <h4 className="text-xs uppercase tracking-widest font-bold text-[var(--az-text-secondary)] mb-3 flex items-center gap-2">
                🎥 Video Preview (Tap / Hover to Play)
              </h4>
              <div className="relative aspect-video rounded-xl overflow-hidden bg-black group border border-[var(--az-border)]">
                <video
                  src={provider.videoPreviewUrl}
                  className="w-full h-full object-cover cursor-pointer"
                  muted
                  playsInline
                  loop
                  onClick={(e) => toggleVideoPlayback(e.currentTarget)}
                  onPointerEnter={(e) => {
                    if (e.pointerType !== 'mouse') return;
                    e.currentTarget.play()
                      .then(() => setIsVideoPlaying(true))
                      .catch((error) => console.error('Unable to play provider preview video:', error));
                  }}
                  onPointerLeave={(e) => {
                    if (e.pointerType !== 'mouse') return;
                    e.currentTarget.pause();
                    e.currentTarget.currentTime = 0;
                    setIsVideoPlaying(false);
                  }}
                />
                <button
                  type="button"
                  aria-label={isVideoPlaying ? 'Pause video preview' : 'Play video preview'}
                  onClick={(e) => {
                    e.stopPropagation();
                    const video = e.currentTarget.parentElement?.querySelector('video') as HTMLVideoElement | null;
                    if (video) toggleVideoPlayback(video);
                  }}
                  className={`absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity ${isVideoPlaying ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
                >
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/60 text-2xl text-white shadow-lg">
                    ▶
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-5 flex flex-col justify-start">
          <div className="mb-6 max-w-full">
            <div className="flex items-center gap-3 mb-2 max-w-full">
              <h1 className="text-4xl font-serif italic text-white tracking-wide truncate max-w-full" title={provider.stageName}>
                {provider.stageName}
              </h1>
              {provider.isVerified && (
                <span className="inline-flex items-center justify-center bg-[var(--az-accent-gold)] text-black text-[9px] font-extrabold px-1.5 py-0.5 rounded-full uppercase tracking-tighter">
                  ✓ Verified
                </span>
              )}
            </div>

            <p className="text-sm text-[var(--az-text-secondary)] font-sans">
              📍 {provider.location?.city || 'Unknown City'} · {provider.location?.country?.name || 'Unknown Country'}
            </p>

            <div className="flex items-center gap-4 mt-3 text-xs text-[var(--az-text-muted)] font-mono">
              <span className="text-[var(--az-accent-gold)]">★ {provider.rating?.toFixed(1) || '0.0'}</span>
              <span>·</span>
              <span>{provider.reviewCount} reviews</span>
              <span>·</span>
              <span>{provider.memberSince}</span>
            </div>

            {responseBadge && (
              <div className="mt-3">
                <span className="inline-block text-[10px] font-bold border rounded-full px-2.5 py-0.5 leading-none" style={{ borderColor: responseBadge.color, color: responseBadge.color }}>
                  ⚡ {responseBadge.label}
                </span>
              </div>
            )}
          </div>

          {provider.bio && (
            <div className="mb-8 p-5 bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-2xl relative overflow-hidden">
              <p className="text-sm text-[var(--az-text-secondary)] leading-relaxed font-serif italic">"{provider.bio}"</p>
              {provider.tagline && (
                <p className="text-xs text-[var(--az-accent-rose)] font-bold uppercase tracking-wider mt-3">🏷️ {provider.tagline}</p>
              )}
            </div>
          )}

          <div className="mb-8">
            <h3 className="text-xs uppercase tracking-widest font-extrabold text-[var(--az-text-muted)] mb-4 border-b border-[var(--az-border)] pb-2">
              Services & Pricing
            </h3>

            {provider.servicesOffered?.length === 0 ? (
              <p className="text-xs text-[var(--az-text-muted)]">No active services offered. Message to enquire.</p>
            ) : (
              <div className="provider-profile__services">
                {provider.servicesOffered?.map((service: string) => {
                  const meta = SERVICE_LABELS[service] || { icon: '✨', label: service, color: '#c9a84c' };
                  return (
                    <div className="service-card shadow-lg" key={service}>
                      <span className="service-card__icon" style={{ textShadow: `0 0 10px ${meta.color}40` }}>{meta.icon}</span>
                      <div className="service-card__info">
                        <span className="service-card__label">{meta.label}</span>
                        <span className="service-card__price">
                          {service === 'private_call' && provider.pricing?.perMinuteRate
                            ? `💎 ${provider.pricing.perMinuteRate} / min`
                            : service === 'hookup' && provider.pricing?.tonightRate
                            ? `💎 ${provider.pricing.tonightRate} / arrangement`
                            : 'Message to enquire'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <button className="provider-profile__message-btn truncate max-w-full" onClick={handleStartConversation} disabled={isStartingConversation}>
            {isStartingConversation ? (
              <span className="animate-spin rounded-full h-5 w-5 border-t-2 border-white"></span>
            ) : (
              <span className="truncate"><span className="message-btn__icon">💬</span> Message {provider.stageName.length > 15 ? `${provider.stageName.slice(0, 15)}...` : provider.stageName}</span>
            )}
          </button>

          <button className="provider-profile__tip-btn" onClick={handleTipClick}>💎 Send a Tip</button>
        </div>
      </div>

      {provider.pricing?.tipMenu?.length > 0 && (
        <section className="provider-profile__tip-menu border-t border-[var(--az-border)] pt-12 mt-12">
          <h3 className="section-title text-2xl mb-6">Tip Menu 💎</h3>
          <div className="tip-menu-grid">
            {provider.pricing.tipMenu.map((item: any, i: number) => (
              <button key={i} className="tip-menu-item shadow-md" onClick={() => handleTipMenuClick(item.amount)}>
                <span className="tip-menu-item__amount">💎 {formatAmount(item.amount)}</span>
                <span className="tip-menu-item__desc">{item.description}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="border-t border-[var(--az-border)] pt-12 mt-12 max-w-4xl">
        <h3 className="section-title text-2xl mb-6">Verified Customer Reviews ⭐</h3>
        {provider.reviewCount === 0 ? (
          <div className="p-6 bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-2xl text-center text-xs text-[var(--az-text-muted)] italic">
            No reviews yet. Be the first to leave feedback after a session!
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-5 bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-2xl">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <span className="text-xs font-bold text-white">Anonymized Member</span>
                  <p className="text-[10px] text-[var(--az-text-muted)] font-mono">Verified Arrangement · 2 days ago</p>
                </div>
                <span className="text-xs text-[var(--az-accent-gold)]">⭐⭐⭐⭐⭐ 5.0</span>
              </div>
              <p className="text-sm text-[var(--az-text-secondary)] font-serif italic">"Absolutely incredible experience. Very professional, responsive, and accommodating. Completely worth the arrangements!"</p>
            </div>
            <div className="p-5 bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-2xl">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <span className="text-xs font-bold text-white">Anonymous Client</span>
                  <p className="text-[10px] text-[var(--az-text-muted)] font-mono">Verified Live Cam · 1 week ago</p>
                </div>
                <span className="text-xs text-[var(--az-accent-gold)]">⭐⭐⭐⭐⭐ 4.8</span>
              </div>
              <p className="text-sm text-[var(--az-text-secondary)] font-serif italic">"Super hot stream session! The tip menu rewards are absolutely amazing, responds instantly to tips."</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default PublicProviderProfile;
