import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import LocationSelect from './LocationSelect';
import { API_BASE_URL } from '../../config';
import L from 'leaflet';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// Override default marker icons to avoid Next.js / dev server icon load failures
if (typeof window !== 'undefined' && L && L.Icon && L.Icon.Default) {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: '/leaflet/marker-icon-2x.png',
    iconUrl: '/leaflet/marker-icon.png',
    shadowUrl: '/leaflet/marker-shadow.png',
  });
}

const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  US: [37.0902, -95.7129],
  GB: [55.3781, -3.4360],
  CA: [56.1304, -106.3468],
  AU: [-25.2744, 133.7751],
  NG: [9.0820, 8.6753],
  IN: [20.5937, 78.9629],
  ZA: [-30.5595, 22.9375],
  DE: [51.1657, 10.4515],
  FR: [46.2276, 2.2137],
  ES: [40.4637, -3.7492],
  IT: [41.8719, 12.5674],
};

const HookUpTonight: React.FC = () => {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);

  // Filter States
  const [locationValue, setLocationValue] = useState<any>({});
  const [intention, setIntention] = useState<string>('Any');
  const [isOnline, setIsOnline] = useState<boolean>(false);

  // Data Loading States
  const [memberLocation, setMemberLocation] = useState<any>(null);

  const [providers, setProviders] = useState<any[]>([]);
  const [mapProviders, setMapProviders] = useState<any[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Map Centroid / Zoom States
  const [mapCenter, setMapCenter] = useState<[number, number]>([6.5244, 3.3792]); // Default Lagos
  const [mapZoom, setMapZoom] = useState(12);

  const [messageLoading, setMessageLoading] = useState<string | null>(null);

  // Fetch Member's profile and pre-populate
  useEffect(() => {
    const fetchMemberProfile = async () => {
      try {
        const token = localStorage.getItem('adultAccessToken');
        if (!token) return;
        const res = await fetch(`${API_BASE_URL}/v1/adult/profiles/me`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const result = await res.json();
          const profile = result.data || result;
          if (profile && profile.location) {
            setMemberLocation(profile.location);
          }
        }
      } catch (e) {
        console.error('Failed to fetch user profile:', e);
      }
    };
    fetchMemberProfile();
  }, []);

  // Pre-populate selections from member profile once loaded
  useEffect(() => {
    if (memberLocation) {
      setLocationValue({
        country: memberLocation.country,
        state: memberLocation.state,
        city: memberLocation.city
      });
    }
  }, [memberLocation]);

  // Dynamically update map centroid as location changes
  useEffect(() => {
    const updateCentroid = async () => {
      if (locationValue.city?.lat && locationValue.city?.lng) {
        setMapCenter([locationValue.city.lat, locationValue.city.lng]);
        setMapZoom(12);
      } else if (locationValue.state?.code && locationValue.country?.code) {
        try {
          const url = `${API_BASE_URL}/v1/shared/cities?country=${locationValue.country.code}&state=${locationValue.state.code}`;
          const res = await fetch(url);
          if (res.ok) {
            const cities = await res.json();
            if (cities && cities[0]) {
              setMapCenter([cities[0].lat, cities[0].lng]);
              setMapZoom(8);
            }
          }
        } catch (e) {
          console.error("Centroid resolution error:", e);
        }
      } else if (locationValue.country?.code) {
        const code = locationValue.country.code.toUpperCase();
        const centroid = COUNTRY_CENTROIDS[code] || [20, 0];
        setMapCenter(centroid);
        setMapZoom(4);
      }
    };
    updateCentroid();
  }, [locationValue.city, locationValue.state, locationValue.country]);

  // Debounced query on filter selection changes
  useEffect(() => {
    const timer = setTimeout(() => {
      const fetchProviders = async () => {
        setLoadingProviders(true);
        try {
          const token = localStorage.getItem('adultAccessToken');
          const headers: any = {};
          if (token) headers['Authorization'] = `Bearer ${token}`;

          const countryCode = locationValue.country?.code || '';
          const stateCode = locationValue.state?.code || '';
          const cityName = locationValue.city?.name || '';

          // Grid View fetch (paginated)
          let gridUrl = `${API_BASE_URL}/v1/adult/hookup/nearby?page=${currentPage}&limit=12`;
          if (countryCode) gridUrl += `&country=${countryCode}`;
          if (stateCode) gridUrl += `&state=${stateCode}`;
          if (cityName) gridUrl += `&city=${encodeURIComponent(cityName)}`;
          if (intention && intention !== 'Any') gridUrl += `&intention=${encodeURIComponent(intention)}`;
          if (isOnline) gridUrl += `&isOnline=true`;

          const resGrid = await fetch(gridUrl, { headers });
          if (resGrid.ok) {
            const result = await resGrid.json();
            setProviders(result.data?.providers || []);
            setTotalPages(result.data?.pages || 1);
          }

          // Map View fetch (unpaginated with ?view=map)
          let mapUrl = `${API_BASE_URL}/v1/adult/hookup/nearby?view=map`;
          if (countryCode) mapUrl += `&country=${countryCode}`;
          if (stateCode) mapUrl += `&state=${stateCode}`;
          if (cityName) mapUrl += `&city=${encodeURIComponent(cityName)}`;
          if (intention && intention !== 'Any') mapUrl += `&intention=${encodeURIComponent(intention)}`;
          if (isOnline) mapUrl += `&isOnline=true`;

          const resMap = await fetch(mapUrl, { headers });
          if (resMap.ok) {
            const result = await resMap.json();
            setMapProviders(result.providers || []);
          }
        } catch (error) {
          console.error('Failed to search providers:', error);
        } finally {
          setLoadingProviders(false);
        }
      };
      fetchProviders();
    }, 300);

    return () => clearTimeout(timer);
  }, [locationValue, intention, isOnline, currentPage]);

  const handleReset = () => {
    setLocationValue({});
    setIntention('Any');
    setIsOnline(false);
    setCurrentPage(1);
  };

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
      }
    } catch (e) {
      console.error('Failed to initiate conversation:', e);
    } finally {
      setMessageLoading(null);
    }
  };

  // Check if any location filter is selected
  const hasSelectedLocation = !!(locationValue.country || locationValue.state || locationValue.city);

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <style>{`
        .filter-panel {
          background: var(--az-bg-secondary);
          border: 1px solid var(--az-border);
          border-radius: 16px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .filter-section-label {
          font: 600 10px/1 'DM Sans', sans-serif;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--az-text-muted);
          margin-bottom: 10px;
        }

        .location-select-wrapper {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .intention-chips {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .intention-chip {
          height: 36px;
          border-radius: 8px;
          border: 1px solid var(--az-border);
          background: var(--az-bg-tertiary);
          color: var(--az-text-secondary);
          font: 500 12px/1 'DM Sans', sans-serif;
          cursor: pointer;
          transition: all 0.15s;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .intention-chip--selected {
          background: rgba(200, 16, 46, 0.12);
          border-color: var(--az-accent-crimson);
          color: var(--az-accent-crimson);
        }

        .online-toggle-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .online-toggle-label {
          font: 400 14px/1 'DM Sans', sans-serif;
          color: var(--az-text-secondary);
        }

        .reset-filters-btn {
          width: 100%;
          height: 40px;
          border-radius: 10px;
          background: transparent;
          border: 1px solid var(--az-border);
          color: var(--az-text-muted);
          font: 500 12px/1 'DM Sans', sans-serif;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.15s;
        }

        .reset-filters-btn:hover {
          border-color: var(--az-accent-crimson);
          color: var(--az-accent-crimson);
        }

        .map-container {
          position: relative;
          flex: 1;
          border-radius: 12px;
          overflow: hidden;
          min-height: 500px;
        }

        @media (max-width: 767px) {
          .map-container {
            height: 60vh;
            min-height: 300px;
          }
        }

        .map-overlay-count {
          position: absolute;
          top: 12px;
          right: 12px;
          z-index: 1000;
          background: rgba(10, 6, 8, 0.85);
          backdrop-filter: blur(8px);
          border: 1px solid var(--az-border);
          border-radius: 100px;
          padding: 6px 14px;
          font: 500 12px/1 'DM Sans', sans-serif;
          color: var(--az-text-secondary);
          pointer-events: none;
        }

        /* Override Leaflet popup styles */
        .leaflet-popup-content-wrapper {
          background: var(--az-bg-secondary) !important;
          border: 1px solid var(--az-border) !important;
          border-radius: 12px !important;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5) !important;
          padding: 0 !important;
        }

        .leaflet-popup-tip {
          background: var(--az-bg-secondary) !important;
        }

        .leaflet-popup-content {
          margin: 0 !important;
          width: auto !important;
        }

        .map-popup-content {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 14px;
          min-width: 220px;
        }

        .map-popup-avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          object-fit: cover;
          flex-shrink: 0;
        }

        .map-popup-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .map-popup-name {
          font: 600 14px/1 'DM Sans', sans-serif;
          color: var(--az-text-primary);
        }

        .map-popup-status {
          font: 400 11px/1 'DM Sans', sans-serif;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .map-popup-status.online {
          color: #22c55e;
        }

        .map-popup-status.offline {
          color: var(--az-text-muted);
        }

        .map-popup-rate {
          font: 500 12px/1 'JetBrains Mono', monospace;
          color: var(--az-accent-gold);
        }

        .map-popup-btn {
          padding: 6px 12px;
          border-radius: 8px;
          background: var(--az-accent-crimson);
          border: none;
          color: white;
          font: 600 12px/1 'DM Sans', sans-serif;
          cursor: pointer;
          flex-shrink: 0;
          transition: opacity 0.15s;
        }

        .map-popup-btn:hover {
          opacity: 0.9;
        }
      `}</style>

      {/* Header View */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-6">
        <div>
          <h1 className="text-4xl font-serif italic text-[var(--az-text-primary)] mb-2">Hook Up Tonight</h1>
          <p className="text-[var(--az-text-secondary)] font-serif italic">Someone desires you right now.</p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-4">
          {/* Mobile view controls */}
          <button
            onClick={() => setIsMobileFilterOpen(true)}
            className="md:hidden px-4 py-2 bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-full text-xs font-bold text-white flex items-center gap-2"
          >
            ⚙️ Filter
          </button>

          <div className="flex items-center gap-2 bg-[var(--az-bg-secondary)] p-1 rounded-full border border-[var(--az-border)]">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-5 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${viewMode === 'grid' ? 'bg-[var(--az-accent-primary)] text-white' : 'text-[var(--az-text-secondary)]'}`}
            >
              Grid
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={`px-5 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${viewMode === 'map' ? 'bg-[var(--az-accent-primary)] text-white' : 'text-[var(--az-text-secondary)]'}`}
            >
              Map
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Desktop Sidebar Filter Panel */}
        <aside className="hidden md:block w-full lg:w-72 flex-shrink-0">
          <div className="filter-panel sticky top-24">
            <div>
              <span className="filter-section-label block mb-3">Location</span>
              <LocationSelect
                value={locationValue}
                onChange={(val) => {
                  setLocationValue(val);
                  setCurrentPage(1);
                }}
              />
            </div>

            <div>
              <span className="filter-section-label block mb-3">Intention</span>
              <div className="intention-chips">
                {['Tonight Only', 'FWB', 'Casual', 'Any'].map(opt => (
                  <button
                    key={opt}
                    onClick={() => {
                      setIntention(opt);
                      setCurrentPage(1);
                    }}
                    className={`intention-chip ${intention === opt ? 'intention-chip--selected' : ''}`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="filter-section-label block mb-3">Online Status</span>
              <div className="online-toggle-row">
                <span className="online-toggle-label">Show active users</span>
                <button
                  onClick={() => {
                    setIsOnline(!isOnline);
                    setCurrentPage(1);
                  }}
                  className={`w-12 h-6 rounded-full relative transition-colors duration-200 ${isOnline ? 'bg-[var(--az-accent-crimson)]' : 'bg-[var(--az-bg-tertiary)]'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 shadow ${isOnline ? 'translate-x-7' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>

            <button
              onClick={handleReset}
              className="reset-filters-btn"
            >
              Reset All Filters
            </button>
          </div>
        </aside>

        {/* Providers Content Area */}
        <div className="flex-grow min-h-[500px]">
          {/* Check for active location selection */}
          {!hasSelectedLocation ? (
            <div className="w-full flex flex-col items-center justify-center py-24 text-center bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-2xl">
              <span className="text-5xl mb-6 opacity-60">📍</span>
              <h3 className="text-2xl font-serif italic text-[var(--az-text-primary)] mb-2">Where are you looking?</h3>
              <p className="text-sm text-[var(--az-text-secondary)] mb-6 max-w-sm">
                Select a country and city to find providers near you.
              </p>
              <div className="w-full max-w-xs px-4">
                <LocationSelect
                  value={locationValue}
                  onChange={(val) => {
                    setLocationValue(val);
                    setCurrentPage(1);
                  }}
                />
              </div>
            </div>
          ) : loadingProviders ? (
            <div className="w-full flex items-center justify-center py-40">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-[var(--az-accent-primary)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-[var(--az-text-secondary)] italic font-serif">Discovering desires nearby...</p>
              </div>
            </div>
          ) : viewMode === 'grid' ? (
            // Grid View
            providers.length === 0 ? (
              <div className="w-full flex flex-col items-center justify-center py-24 text-center bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-2xl">
                <span className="text-6xl mb-6 opacity-40">🌙</span>
                <h3 className="text-xl font-serif italic text-[var(--az-text-primary)] mb-2">
                  No providers in {locationValue.city?.name || 'this area'} right now
                </h3>
                <p className="text-sm text-[var(--az-text-secondary)] mb-6">
                  Try a nearby city or expand your search.
                </p>
                <button
                  onClick={handleReset}
                  className="px-6 py-2 border border-[var(--az-border)] hover:border-[var(--az-accent-crimson)] rounded-xl text-xs font-bold text-white uppercase tracking-wider transition-colors"
                >
                  Clear Location Filter
                </button>
              </div>
            ) : (
              <div>
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
                  {providers.map((p) => {
                    const isOnlinePerformer = p.providerProfile?.isLive || false;
                    const tonightRate = p.providerProfile?.tonightRate || 0;
                    const stageName = p.providerProfile?.stageName || p.displayName || p.username;
                    const primaryPhoto = p.profilePhoto || p.providerProfile?.photos?.[0] || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=600&auto=format&fit=crop';
                    const ageVal = p.dateOfBirth ? new Date().getFullYear() - new Date(p.dateOfBirth).getFullYear() : 23;

                    return (
                      <div key={p._id} className="relative aspect-[2/3] rounded-xl overflow-hidden border border-[var(--az-border)] bg-[var(--az-bg-secondary)] group cursor-pointer az-card-hover">
                        <img src={primaryPhoto} className="w-full h-full object-cover filter blur-sm group-hover:blur-0 transition-all duration-500" alt={stageName} />

                        {isOnlinePerformer && (
                          <div className="absolute top-3 left-3 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-black shadow-[0_0_8px_green]" />
                        )}

                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent p-4 flex flex-col justify-end">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-lg font-serif italic text-white">{stageName}, {ageVal}</h4>
                            {p.isVerified && <span className="text-[10px] text-[var(--az-accent-gold)]">⭐</span>}
                          </div>

                          <p className="text-[10px] text-[var(--az-text-secondary)] font-bold uppercase tracking-tighter mb-2">
                            {p.providerProfile?.location?.city?.name || p.providerProfile?.location?.city || 'Local'}
                          </p>

                          {tonightRate > 0 && (
                            <p className="text-[11px] text-[var(--az-accent-gold)] font-mono mb-2">
                              💎 {tonightRate} tonight
                            </p>
                          )}

                          <div className="flex gap-2">
                            {(p.providerProfile?.categories || ['Casual']).slice(0, 2).map((cat: string) => (
                              <span key={cat} className="bg-white/10 backdrop-blur-md text-white text-[8px] font-bold px-2 py-1 rounded uppercase tracking-widest border border-white/20">
                                {cat}
                              </span>
                            ))}
                          </div>

                          <div className="flex justify-between items-center mt-4 opacity-0 group-hover:opacity-100 transition-opacity translate-y-4 group-hover:translate-y-0 duration-300">
                            <button className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center hover:bg-[var(--az-accent-primary)] transition-colors">❤️</button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleMessageClick(p._id); }}
                              disabled={messageLoading === p._id}
                              className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center hover:bg-[var(--az-accent-rose)] transition-colors text-white text-xs font-bold"
                            >
                              {messageLoading === p._id ? '...' : '💬'}
                            </button>
                            <button className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center hover:bg-[var(--az-accent-gold)] transition-colors">⚡</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-4 mt-12">
                    <button
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      className="px-4 py-2 rounded-xl bg-[var(--az-bg-secondary)] border border-[var(--az-border)] text-xs text-white disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <span className="text-xs text-[var(--az-text-secondary)]">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      className="px-4 py-2 rounded-xl bg-[var(--az-bg-secondary)] border border-[var(--az-border)] text-xs text-white disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            )
          ) : (
            // Map View
            <div className="w-full h-[600px] bg-[var(--az-bg-secondary)] rounded-2xl border border-[var(--az-border)] overflow-hidden relative">
              <MapContainer
                center={mapCenter}
                zoom={mapZoom}
                style={{ width: '100%', height: '100%' }}
                zoomControl={true}
                scrollWheelZoom={true}
              >
                <TileLayer
                  url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org">OpenStreetMap</a> &copy; <a href="https://carto.com">CARTO</a>'
                  maxZoom={19}
                />

                {mapProviders.map((p) => {
                  return (
                    <CircleMarker
                      key={p.id}
                      center={p.coordinates}
                      radius={10}
                      pathOptions={{
                        color: p.isOnline ? '#22c55e' : '#c8102e',
                        fillColor: p.isOnline ? '#22c55e' : '#c8102e',
                        fillOpacity: 0.85,
                        weight: 2,
                        opacity: 1,
                      }}
                    >
                      <Popup className="hookup-map-popup">
                        <div className="map-popup-content">
                          <img
                            src={p.avatarUrl}
                            alt={p.stageName}
                            className="map-popup-avatar"
                          />
                          <div className="map-popup-info">
                            <span className="map-popup-name">{p.stageName}</span>
                            <span className={`map-popup-status ${p.isOnline ? 'online' : 'offline'}`}>
                              {p.isOnline ? '● Online Now' : '● Offline'}
                            </span>
                            {p.tonightRate && (
                              <span className="map-popup-rate">
                                💎 {p.tonightRate} tonight
                              </span>
                            )}
                          </div>
                          <button
                            className="map-popup-btn"
                            onClick={() => handleMessageClick(p.id)}
                          >
                            Message
                          </button>
                        </div>
                      </Popup>
                    </CircleMarker>
                  );
                })}
              </MapContainer>

              {/* Provider Count Overlay */}
              <div className="map-overlay-count">
                {mapProviders.length} providers in this area
              </div>

              {/* Map Empty Centered Card */}
              {mapProviders.length === 0 && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] p-6 bg-black/90 border border-[var(--az-border)] rounded-2xl text-center max-w-sm backdrop-blur-md">
                  <span className="text-4xl mb-4 block">📍</span>
                  <h4 className="text-lg font-serif italic text-white mb-2">No providers here yet</h4>
                  <p className="text-xs text-[var(--az-text-secondary)] mb-4">
                    Be the first to discover someone nearby.
                  </p>
                  <button
                    onClick={handleReset}
                    className="px-4 py-2 bg-[var(--az-accent-primary)] text-white text-[10px] font-bold uppercase tracking-widest rounded-xl"
                  >
                    Browse All Providers →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mobile Filter Slide-up Bottom Sheet */}
      {isMobileFilterOpen && (
        <div className="fixed inset-0 z-[12000] flex items-end justify-center bg-black/85 backdrop-blur-md">
          <div className="w-full max-h-[85vh] overflow-y-auto bg-[var(--az-bg-secondary)] border-t border-[var(--az-border)] rounded-t-3xl p-6 relative animate-slide-up">
            <button
              onClick={() => setIsMobileFilterOpen(false)}
              className="absolute top-4 right-4 text-white text-lg font-bold"
            >
              ✕
            </button>

            <h3 className="text-xl font-serif italic text-white mb-6">Filter Nearby</h3>

            <div className="space-y-6">
              <div>
                <span className="filter-section-label block mb-3">Location</span>
                <LocationSelect
                  value={locationValue}
                  onChange={(val) => {
                    setLocationValue(val);
                    setCurrentPage(1);
                  }}
                />
              </div>

              <div>
                <span className="filter-section-label block mb-3">Intention</span>
                <div className="intention-chips">
                  {['Tonight Only', 'FWB', 'Casual', 'Any'].map(opt => (
                    <button
                      key={opt}
                      onClick={() => {
                        setIntention(opt);
                        setCurrentPage(1);
                      }}
                      className={`intention-chip ${intention === opt ? 'intention-chip--selected' : ''}`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="filter-section-label block mb-3">Online Status</span>
                <div className="online-toggle-row">
                  <span className="online-toggle-label">Show active users</span>
                  <button
                    onClick={() => {
                      setIsOnline(!isOnline);
                      setCurrentPage(1);
                    }}
                    className={`w-12 h-6 rounded-full relative transition-colors duration-200 ${isOnline ? 'bg-[var(--az-accent-crimson)]' : 'bg-[var(--az-bg-tertiary)]'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 shadow ${isOnline ? 'translate-x-7' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  onClick={() => { handleReset(); setIsMobileFilterOpen(false); }}
                  className="flex-1 py-3 border border-[var(--az-border)] rounded-xl text-xs font-bold uppercase tracking-widest text-white hover:border-[var(--az-accent-crimson)]"
                >
                  Reset
                </button>
                <button
                  onClick={() => setIsMobileFilterOpen(false)}
                  className="flex-1 py-3 bg-[var(--az-accent-primary)] rounded-xl text-xs font-bold uppercase tracking-widest text-white"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HookUpTonight;
