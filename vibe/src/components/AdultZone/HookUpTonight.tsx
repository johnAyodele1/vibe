import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import LocationSelect from './LocationSelect';
import HookupMap from './HookupMap';
import { API_BASE_URL } from '../../config';

interface LocationValue {
  country?: { code: string; name: string };
  state?: { code: string; name: string };
  city?: { name: string; lat: number; lng: number };
}

const HookUpTonight: React.FC = () => {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);

  // Filter State
  const [location, setLocation] = useState<LocationValue>({});
  const [intention, setIntention] = useState<string>('');
  const [isOnlineOnly, setIsOnlineOnly] = useState<boolean>(false);

  // Providers lists
  const [providers, setProviders] = useState<any[]>([]);
  const [mapProviders, setMapProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Map state
  const [mapCenter, setMapCenter] = useState<[number, number]>([6.5244, 3.3792]); // default Lagos
  const [mapZoom, setMapZoom] = useState(12);

  // Fetch logged-in user profile to pre-populate filters on load
  useEffect(() => {
    const fetchMemberProfile = async () => {
      const token = localStorage.getItem('adultAccessToken');
      if (!token) return;
      try {
        const res = await fetch(`${API_BASE_URL}/v1/adult/profiles/me`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const json = await res.json();
        if (json.success && json.data?.location) {
          setLocation(json.data.location);
        }
      } catch (err) {
        console.error('Failed to load member profile location:', err);
      }
    };
    fetchMemberProfile();
  }, []);

  // Update map center and zoom level dynamically when location changes
  useEffect(() => {
    if (location.city?.lat && location.city?.lng) {
      setMapCenter([location.city.lat, location.city.lng]);
      setMapZoom(12);
    } else if (location.state) {
      const fetchFirstCity = async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/v1/shared/cities?country=${location.country?.code}&state=${location.state?.code}&q=`);
          const cities = await res.json();
          if (cities && cities[0] && cities[0].lat) {
            setMapCenter([cities[0].lat, cities[0].lng]);
            setMapZoom(10);
          }
        } catch (err) {
          console.error('Failed to center on state capital:', err);
        }
      };
      fetchFirstCity();
    } else if (location.country) {
      const centroids: Record<string, [number, number]> = {
        US: [37.0902, -95.7129],
        GB: [55.3781, -3.4360],
        NG: [9.0820, 8.6753],
        CA: [56.1304, -106.3468],
        AU: [-25.2744, 133.7751]
      };
      const code = location.country.code.toUpperCase();
      if (centroids[code]) {
        setMapCenter(centroids[code]);
        setMapZoom(5);
      }
    }
  }, [location]);

  // Debounced Provider search for Grid view
  const fetchProviders = useCallback(async () => {
    setLoading(true);
    const token = localStorage.getItem('adultAccessToken');
    try {
      const queryParams = new URLSearchParams();
      if (location.country?.code) queryParams.append('country', location.country.code);
      if (location.state?.code) queryParams.append('state', location.state.code);
      if (location.city?.name) queryParams.append('city', location.city.name);
      if (intention) queryParams.append('intention', intention);
      if (isOnlineOnly) queryParams.append('isOnline', 'true');
      queryParams.append('page', String(page));
      queryParams.append('limit', '12');

      const headers: any = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE_URL}/v1/adult/hookup/nearby?${queryParams.toString()}`, {
        headers
      });
      const json = await res.json();
      if (json.success && json.data) {
        setProviders(json.data.providers || []);
        setTotalPages(json.data.pages || 1);
      }
    } catch (err) {
      console.error('Error fetching grid providers:', err);
    } finally {
      setLoading(false);
    }
  }, [location, intention, isOnlineOnly, page]);

  // Debounced Provider search for Map view
  const fetchMapProviders = useCallback(async () => {
    const token = localStorage.getItem('adultAccessToken');
    try {
      const queryParams = new URLSearchParams();
      if (location.country?.code) queryParams.append('country', location.country.code);
      if (location.state?.code) queryParams.append('state', location.state.code);
      if (location.city?.name) queryParams.append('city', location.city.name);
      if (intention) queryParams.append('intention', intention);
      if (isOnlineOnly) queryParams.append('isOnline', 'true');
      queryParams.append('view', 'map');

      const headers: any = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE_URL}/v1/adult/hookup/nearby?${queryParams.toString()}`, {
        headers
      });
      const json = await res.json();
      if (json.success && json.providers) {
        setMapProviders(json.providers || []);
      }
    } catch (err) {
      console.error('Error fetching map providers:', err);
    }
  }, [location, intention, isOnlineOnly]);

  // Fetch triggering with 300ms debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProviders();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchProviders]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchMapProviders();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchMapProviders]);

  const handleMessageClick = async (providerId: string) => {
    if (!localStorage.getItem('adultAccessToken')) {
      window.dispatchEvent(new CustomEvent('open-adult-auth-modal'));
      return;
    }
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
    } catch (err) {
      console.error('Failed to initiate conversation:', err);
    }
  };

  const handleResetFilters = () => {
    setLocation({});
    setIntention('');
    setIsOnlineOnly(false);
    setPage(1);
  };

  const renderFilterFields = () => (
    <>
      {/* Location dropdown chain using LocationSelect */}
      <div>
        <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--az-text-muted)] mb-3 block">
          Location
        </label>
        <LocationSelect
          value={location}
          onChange={(newVal) => {
            setLocation(newVal);
            setPage(1);
          }}
        />
      </div>

      {/* Intention Chips */}
      <div>
        <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--az-text-muted)] mb-3 block">
          Intention
        </label>
        <div className="grid grid-cols-2 gap-2">
          {['Tonight Only', 'FWB', 'Casual', 'Any'].map((opt) => {
            const isSel = opt === 'Any' ? intention === '' : intention === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  setIntention(opt === 'Any' ? '' : opt);
                  setPage(1);
                }}
                className={`py-2 px-3 bg-[var(--az-bg-tertiary)] border rounded-lg text-xs font-semibold text-[var(--az-text-secondary)] transition-all flex items-center justify-center cursor-pointer ${
                  isSel
                    ? 'bg-red-950/20 border-[var(--az-accent-primary)] text-[var(--az-accent-primary)]'
                    : 'border-[var(--az-border)] hover:border-[var(--az-accent-primary)]'
                }`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>

      {/* Online Now Only toggle */}
      <div className="flex items-center justify-between py-2 border-t border-[var(--az-border)] pt-4">
        <span className="text-sm font-medium text-[var(--az-text-secondary)]">Show active users</span>
        <div
          onClick={() => {
            setIsOnlineOnly(!isOnlineOnly);
            setPage(1);
          }}
          className={`w-11 h-6 rounded-full p-1 cursor-pointer transition-colors ${
            isOnlineOnly ? 'bg-[var(--az-accent-primary)]' : 'bg-[var(--az-bg-tertiary)] border border-[var(--az-border)]'
          }`}
        >
          <div
            className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-transform ${
              isOnlineOnly ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </div>
      </div>

      {/* Reset button */}
      <button
        type="button"
        onClick={handleResetFilters}
        className="w-full py-3 bg-[var(--az-bg-tertiary)] text-[var(--az-text-primary)] text-[10px] font-bold uppercase tracking-widest rounded-xl border border-[var(--az-border)] hover:bg-[var(--az-bg-secondary)] hover:border-[var(--az-accent-primary)] hover:text-[var(--az-accent-primary)] transition-colors cursor-pointer"
      >
        Reset All Filters
      </button>
    </>
  );

  const hasLocationFilter = !!(location.country || location.state || location.city);

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-6">
        <div>
          <h1 className="text-4xl font-serif italic text-[var(--az-text-primary)] mb-2">Hook Up Tonight</h1>
          <p className="text-[var(--az-text-secondary)] font-serif italic">Someone desires you right now.</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Mobile Filter Button */}
          <button
            onClick={() => setIsMobileFilterOpen(true)}
            className="md:hidden px-4 py-2 rounded-full bg-[var(--az-bg-secondary)] border border-[var(--az-border)] text-white text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-[var(--az-bg-tertiary)] cursor-pointer"
          >
            ⚙️ Filter
          </button>

          {/* GRID / MAP Toggles */}
          <div className="flex items-center gap-2 bg-[var(--az-bg-secondary)] p-1 rounded-full border border-[var(--az-border)]">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-5 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-[var(--az-accent-primary)] text-white'
                  : 'text-[var(--az-text-secondary)] hover:text-white'
              }`}
            >
              Grid
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={`px-5 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all cursor-pointer ${
                viewMode === 'map'
                  ? 'bg-[var(--az-accent-primary)] text-white'
                  : 'text-[var(--az-text-secondary)] hover:text-white'
              }`}
            >
              Map
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Filters Sidebar (Desktop only) */}
        <aside className="hidden lg:block w-72 flex-shrink-0">
          <div className="az-glass border border-[var(--az-border)] rounded-2xl p-6 space-y-6 sticky top-24">
            {renderFilterFields()}
          </div>
        </aside>

        {/* Profiles Grid / Map Container */}
        <div className="flex-grow">
          {/* No Location Selected State */}
          {!hasLocationFilter ? (
            <div className="az-glass border border-[var(--az-border)] rounded-2xl p-16 text-center max-w-lg mx-auto">
              <div className="text-4xl mb-4 text-zinc-500">📍</div>
              <h3 className="text-xl font-serif italic text-white mb-2">Where are you looking?</h3>
              <p className="text-xs text-[var(--az-text-secondary)] mb-6">
                Select a country and city to find providers near you.
              </p>
              <div className="max-w-xs mx-auto text-left">
                <LocationSelect
                  value={location}
                  onChange={(newVal) => setLocation(newVal)}
                />
              </div>
            </div>
          ) : viewMode === 'grid' ? (
            <>
              {loading ? (
                /* Loading State */
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
                  {Array.from({ length: 8 }).map((_, idx) => (
                    <div
                      key={idx}
                      className="relative aspect-[2/3] rounded-xl overflow-hidden border border-[var(--az-border)] bg-[var(--az-bg-tertiary)] animate-pulse"
                    />
                  ))}
                </div>
              ) : providers.length === 0 ? (
                /* Empty State Grid */
                <div className="az-glass border border-[var(--az-border)] rounded-2xl p-16 text-center max-w-lg mx-auto">
                  <div className="text-5xl mb-4 text-zinc-500">🌙</div>
                  <h3 className="text-xl font-serif italic text-white mb-2">
                    No providers in {location.city?.name || 'this area'} right now
                  </h3>
                  <p className="text-xs text-[var(--az-text-secondary)] mb-6">
                    Try a nearby city or expand your search criteria.
                  </p>
                  <button
                    onClick={handleResetFilters}
                    className="px-6 py-2.5 bg-[var(--az-accent-primary)] hover:bg-red-700 text-white rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    Clear Location Filter
                  </button>
                </div>
              ) : (
                /* Providers Grid View */
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
                  {providers.map((p) => (
                    <div
                      key={p.id}
                      className="relative aspect-[2/3] rounded-xl overflow-hidden border border-[var(--az-border)] bg-[var(--az-bg-secondary)] group cursor-pointer az-card-hover"
                    >
                      <img
                        src={p.photoUrl}
                        alt={p.stageName}
                        className="w-full h-full object-cover filter blur-sm group-hover:blur-0 transition-all duration-500"
                      />

                      {p.isOnline && (
                        <div className="absolute top-3 left-3 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-black shadow-[0_0_8px_green]" />
                      )}

                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent p-4 flex flex-col justify-end">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-lg font-serif italic text-white">
                            {p.stageName}, {p.age}
                          </h4>
                          {p.isVerified && <span className="text-[10px] text-[var(--az-accent-gold)]">⭐</span>}
                        </div>
                        <p className="text-[10px] text-[var(--az-text-secondary)] font-bold uppercase tracking-tighter mb-3">
                          {p.location?.city?.name || 'Nearby'}
                        </p>

                        <div className="flex gap-2">
                          <span className="bg-white/10 backdrop-blur-md text-white text-[8px] font-bold px-2 py-1 rounded uppercase tracking-widest border border-white/20">
                            {p.intention}
                          </span>
                        </div>

                        <div className="flex justify-between items-center mt-4 opacity-0 group-hover:opacity-100 transition-opacity translate-y-4 group-hover:translate-y-0 duration-300">
                          <button
                            type="button"
                            className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center hover:bg-[var(--az-accent-primary)] transition-colors cursor-pointer"
                          >
                            ❤️
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMessageClick(p.id);
                            }}
                            className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center hover:bg-[var(--az-accent-rose)] transition-colors cursor-pointer"
                          >
                            💬
                          </button>
                          <button
                            type="button"
                            className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center hover:bg-[var(--az-accent-gold)] transition-colors cursor-pointer"
                          >
                            ⚡
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Grid Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-4 mt-8">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage(page - 1)}
                    className="px-4 py-2 bg-[var(--az-bg-secondary)] border border-[var(--az-border)] text-white text-xs rounded-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer hover:bg-[var(--az-bg-tertiary)]"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-[var(--az-text-secondary)]">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    disabled={page === totalPages}
                    onClick={() => setPage(page + 1)}
                    className="px-4 py-2 bg-[var(--az-bg-secondary)] border border-[var(--az-border)] text-white text-xs rounded-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer hover:bg-[var(--az-bg-tertiary)]"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          ) : (
            /* Map View */
            <div className="relative w-full h-[600px] rounded-2xl border border-[var(--az-border)] overflow-hidden">
              <HookupMap
                providers={mapProviders}
                center={mapCenter}
                zoom={mapZoom}
                openConversation={handleMessageClick}
              />

              {/* Providers Overlay Count */}
              <div className="absolute top-3 right-3 z-[1000] bg-black/85 backdrop-blur-md border border-[var(--az-border)] rounded-full px-4 py-1.5 text-xs font-medium text-[var(--az-text-secondary)] pointer-events-none">
                {mapProviders.length} providers in this area
              </div>

              {/* Map Empty Overlay when 0 providers are returned */}
              {mapProviders.length === 0 && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-[1001] flex items-center justify-center">
                  <div className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-2xl p-8 text-center max-w-sm mx-4 shadow-2xl">
                    <h3 className="text-lg font-serif italic text-white mb-2">No providers here yet</h3>
                    <p className="text-xs text-[var(--az-text-secondary)] mb-4">
                      Be the first to discover someone nearby.
                    </p>
                    <button
                      onClick={handleResetFilters}
                      className="px-5 py-2 bg-[var(--az-accent-primary)] hover:bg-red-700 text-white rounded-lg text-xs font-semibold cursor-pointer"
                    >
                      Browse All Providers →
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mobile Filter Bottom Sheet */}
      {isMobileFilterOpen && (
        <div className="fixed inset-0 z-[12000] flex items-end justify-center bg-black/80 backdrop-blur-md p-0">
          <div className="w-full bg-[var(--az-bg-secondary)] border-t border-[var(--az-border)] rounded-t-3xl p-6 max-h-[85vh] overflow-y-auto flex flex-col relative animate-slide-up">
            <button
              onClick={() => setIsMobileFilterOpen(false)}
              className="absolute top-4 right-4 text-[var(--az-text-muted)] hover:text-white cursor-pointer"
            >
              ✕
            </button>
            <h3 className="text-xl font-serif italic text-white mb-6">Filter Discoveries</h3>
            <div className="space-y-6 flex-grow">{renderFilterFields()}</div>
            <button
              onClick={() => setIsMobileFilterOpen(false)}
              className="w-full mt-6 py-4 bg-[var(--az-accent-primary)] text-white font-bold uppercase tracking-widest rounded-xl hover:bg-red-700 transition-colors cursor-pointer"
            >
              Apply Filters
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default HookUpTonight;
