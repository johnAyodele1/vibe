import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CustomSelect } from './CustomSelect';
import HookupMap from './HookupMap';
import { useCountries, useStates, useCities } from '../../hooks/useLocation';
import { API_BASE_URL, SOCKET_URL } from '../../config';
import { io } from 'socket.io-client';

interface LocationValue {
  country?: { code: string; name: string };
  state?: { code: string; name: string };
  city?: { name: string; lat: number; lng: number };
}

interface HookupProviderItem {
  id: string;
  stageName: string;
  photoUrl: string;
  avatarUrl: string;
  age: number;
  isOnline: boolean;
  isVerified?: boolean;
  intention: string;
  tonightRate?: number;
  coordinates: [number, number];
  location?: {
    city?: { name: string };
  };
}

// Optimization (⚡ Bolt): Extract and memoize card component to skip DOM diffing and re-renders when parent state changes.
const HookupProviderCard: React.FC<{
  provider: HookupProviderItem;
  onNavigate: (id: string) => void;
  onMessageClick: (id: string) => void;
}> = React.memo(({ provider, onNavigate, onMessageClick }) => {
  return (
    <div
      onClick={() => onNavigate(provider.id)}
      className="relative aspect-[3/4] rounded-2xl overflow-hidden border border-[var(--az-border)] bg-[var(--az-bg-secondary)] group cursor-pointer az-card-hover"
    >
      <img
        src={provider.photoUrl}
        alt={provider.stageName}
        className="absolute inset-0 w-full h-full object-cover object-top filter blur-[1px] group-hover:blur-0 transition-all duration-500"
      />

      {provider.isOnline && (
        <div className="absolute top-3 left-3 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-black shadow-[0_0_8px_green]" />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent p-4 flex flex-col justify-end min-w-0">
        <div className="flex items-center gap-2 mb-1 min-w-0 max-w-full">
          <h4
            className="text-lg font-serif italic text-white truncate flex-1 min-w-0"
            title={`${provider.stageName}, ${provider.age}`}
          >
            {provider.stageName}, {provider.age}
          </h4>
          {provider.isVerified && <span className="text-[10px] text-[var(--az-accent-gold)]">⭐</span>}
        </div>
        <p className="text-[10px] text-[var(--az-text-secondary)] font-bold uppercase tracking-tighter mb-3">
          {provider.location?.city?.name || 'Nearby'}
        </p>

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
              onMessageClick(provider.id);
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
  );
});

HookupProviderCard.displayName = 'HookupProviderCard';

const HookUpTonight: React.FC = () => {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);

  const [location, setLocation] = useState<LocationValue>({});
  const [isOnlineOnly, setIsOnlineOnly] = useState<boolean>(false);

  const [providers, setProviders] = useState<HookupProviderItem[]>([]);
  const [mapProviders, setMapProviders] = useState<HookupProviderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [mapCenter, setMapCenter] = useState<[number, number]>([6.5244, 3.3792]);
  const [mapZoom, setMapZoom] = useState(12);

  const { data: countries, loading: countriesLoading } = useCountries();
  const { data: states, loading: statesLoading } = useStates(location.country?.code || null);
  const [cityQuery, setCityQuery] = useState('');
  const { data: cities, loading: citiesLoading } = useCities(
    location.country?.code || null,
    location.state?.code || null,
    cityQuery
  );

  useEffect(() => {
    const token = localStorage.getItem('adultAccessToken');
    if (!token) return;

    const socketUrl = SOCKET_URL || window.location.origin;
    const socket = io(`${socketUrl}/adult`, {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    socket.on('provider:online', ({ providerId }: { providerId: string }) => {
      setProviders(prev => prev.map(p => p.id === providerId ? { ...p, isOnline: true } : p));
      setMapProviders(prev => prev.map(p => p.id === providerId ? { ...p, isOnline: true } : p));
    });

    socket.on('provider:offline', ({ providerId }: { providerId: string }) => {
      setProviders(prev => prev.map(p => p.id === providerId ? { ...p, isOnline: false } : p));
      setMapProviders(prev => prev.map(p => p.id === providerId ? { ...p, isOnline: false } : p));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    const fetchMemberProfile = async () => {
      const token = localStorage.getItem('adultAccessToken');
      if (!token) return;
      try {
        const res = await fetch(`${API_BASE_URL}/v1/adult/profiles/me`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const json = await res.json();
        if (json.success && json.data?.location) setLocation(json.data.location);
      } catch (err) {
        console.error('Failed to load member profile location:', err);
      }
    };
    fetchMemberProfile();
  }, []);

  useEffect(() => {
    let isMounted = true;
    const updateCenter = async () => {
      if (location.city?.lat && location.city?.lng) {
        setMapCenter([location.city.lat, location.city.lng]);
        setMapZoom(12);
      } else if (location.state) {
        try {
          const res = await fetch(`${API_BASE_URL}/v1/shared/cities?country=${location.country?.code}&state=${location.state?.code}&q=`);
          const citiesData = await res.json();
          if (isMounted && citiesData && citiesData[0] && citiesData[0].lat) {
            setMapCenter([citiesData[0].lat, citiesData[0].lng]);
            setMapZoom(10);
          }
        } catch (err) {
          console.error('Failed to center on state capital:', err);
        }
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
    };
    void updateCenter();
    return () => { isMounted = false; };
  }, [location]);

  const fetchProviders = useCallback(async () => {
    setLoading(true);
    const token = localStorage.getItem('adultAccessToken');
    try {
      const queryParams = new URLSearchParams();
      if (location.country?.code) queryParams.append('country', location.country.code);
      if (location.state?.code) queryParams.append('state', location.state.code);
      if (location.city?.name) queryParams.append('city', location.city.name);
      if (isOnlineOnly) queryParams.append('isOnline', 'true');
      queryParams.append('page', String(page));
      queryParams.append('limit', '12');

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE_URL}/v1/adult/hookup/recommended?${queryParams.toString()}`, { headers });
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
  }, [location, isOnlineOnly, page]);

  const fetchMapProviders = useCallback(async () => {
    const token = localStorage.getItem('adultAccessToken');
    try {
      const queryParams = new URLSearchParams();
      if (location.country?.code) queryParams.append('country', location.country.code);
      if (location.state?.code) queryParams.append('state', location.state.code);
      if (location.city?.name) queryParams.append('city', location.city.name);
      if (isOnlineOnly) queryParams.append('isOnline', 'true');
      queryParams.append('view', 'map');

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE_URL}/v1/adult/hookup/nearby?${queryParams.toString()}`, { headers });
      const json = await res.json();
      if (json.success && json.providers) setMapProviders(json.providers || []);
    } catch (err) {
      console.error('Error fetching map providers:', err);
    }
  }, [location, isOnlineOnly]);

  useEffect(() => {
    const timer = setTimeout(() => { fetchProviders(); }, 300);
    return () => clearTimeout(timer);
  }, [fetchProviders]);

  useEffect(() => {
    const timer = setTimeout(() => { fetchMapProviders(); }, 300);
    return () => clearTimeout(timer);
  }, [fetchMapProviders]);

  // Optimization (⚡ Bolt): Stable callbacks for memoized card component to preserve React.memo efficiency across parent re-renders.
  const handleProviderNavigate = useCallback((providerId: string) => {
    navigate(`/adult/providers/${providerId}`);
  }, [navigate]);

  const handleMessageClick = useCallback(async (providerId: string) => {
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
        if (isMobile) navigate(`/adult/sext/${data.conversationId}`);
        else navigate(`/adult/sext?conversation=${data.conversationId}`);
      }
    } catch (err) {
      console.error('Failed to initiate conversation:', err);
    }
  }, [navigate]);

  const handleResetFilters = () => {
    setLocation({});
    setIsOnlineOnly(false);
    setPage(1);
  };

  // Optimization (⚡ Bolt): Memoize select options to avoid re-allocating arrays and objects on every render.
  const countryOptions = useMemo(
    () => countries?.map((c) => ({ value: c.code || '', label: `${c.flag || '🌍'} ${c.name}`, extra: c })) || [],
    [countries]
  );
  const stateOptions = useMemo(
    () => states?.map((s) => ({ value: s.code || '', label: s.name, extra: s })) || [],
    [states]
  );
  const cityOptions = useMemo(
    () => cities?.map((ct, idx) => ({ value: (ct.name || '') + '_' + idx, label: ct.name, extra: ct })) || [],
    [cities]
  );

  const renderFilterFields = (isMobileSheet: boolean) => (
    <div className={`${isMobileSheet ? 'space-y-6' : 'flex flex-col md:flex-row md:items-end gap-4 w-full'}`}>
      <div className={`${isMobileSheet ? 'w-full' : 'w-full md:w-56'}`}>
        <CustomSelect
          label="Country"
          value={location.country?.code || null}
          options={countryOptions}
          placeholder="Select Country"
          loading={countriesLoading}
          icon="🌍"
          searchPlaceholder="Search Country..."
          onSelect={(_val, _label, extra) => {
            const ext = extra as { code: string; name: string };
            setLocation({ country: { code: ext.code, name: ext.name }, state: undefined, city: undefined });
            setPage(1);
          }}
        />
      </div>

      <div className={`${isMobileSheet ? 'w-full' : 'w-full md:w-56'}`}>
        <CustomSelect
          label="State/Region"
          value={location.state?.code || null}
          options={stateOptions}
          placeholder="Select State/Region"
          disabled={!location.country}
          loading={statesLoading}
          icon="📍"
          searchPlaceholder="Search State/Region..."
          onSelect={(_val, _label, extra) => {
            const ext = extra as { code: string; name: string };
            setLocation((prev) => ({ ...prev, state: { code: ext.code, name: ext.name }, city: undefined }));
            setPage(1);
          }}
        />
      </div>

      <div className={`${isMobileSheet ? 'w-full' : 'w-full md:w-56'}`}>
        <CustomSelect
          label="City"
          value={location.city ? `${location.city.name}` : null}
          options={cityOptions}
          placeholder="Select City"
          disabled={!location.state}
          loading={citiesLoading}
          icon="🏙"
          searchPlaceholder="Type city name..."
          onSearchChange={(q) => setCityQuery(q)}
          onSelect={(_val, _label, extra) => {
            const ext = extra as { name: string; lat: number; lng: number };
            setLocation((prev) => ({ ...prev, city: { name: ext.name, lat: ext.lat, lng: ext.lng } }));
            setPage(1);
          }}
        />
      </div>

      {isMobileSheet ? (
        <div className="space-y-6 pt-4 border-t border-[var(--az-border)]">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[var(--az-text-secondary)]">Show active users</span>
            <div
              onClick={() => { setIsOnlineOnly(!isOnlineOnly); setPage(1); }}
              className={`w-11 h-6 rounded-full p-1 cursor-pointer transition-colors ${isOnlineOnly ? 'bg-[var(--az-accent-primary)]' : 'bg-[var(--az-bg-tertiary)] border border-[var(--az-border)]'}`}
            >
              <div className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-transform ${isOnlineOnly ? 'translate-x-5' : 'translate-x-0'}`} />
            </div>
          </div>

          <button type="button" onClick={handleResetFilters} className="w-full py-3 bg-[var(--az-bg-tertiary)] text-[var(--az-text-primary)] text-[10px] font-bold uppercase tracking-widest rounded-xl border border-[var(--az-border)] hover:bg-[var(--az-bg-secondary)] hover:border-[var(--az-accent-primary)] hover:text-[var(--az-accent-primary)] transition-colors cursor-pointer">
            Reset All Filters
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-4 h-11 mb-0.5 shrink-0">
          <div className="flex items-center gap-2.5 bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] h-11 px-4 rounded-xl">
            <span className="text-xs font-semibold text-[var(--az-text-secondary)] uppercase tracking-wider">Online</span>
            <div onClick={() => { setIsOnlineOnly(!isOnlineOnly); setPage(1); }} className={`w-9 h-5 rounded-full p-0.5 cursor-pointer transition-colors ${isOnlineOnly ? 'bg-[var(--az-accent-primary)]' : 'bg-neutral-800'}`}>
              <div className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-transform ${isOnlineOnly ? 'translate-x-4' : 'translate-x-0'}`} />
            </div>
          </div>
          <button type="button" onClick={handleResetFilters} className="h-11 px-4 bg-[var(--az-bg-tertiary)] text-[var(--az-text-muted)] text-[10px] font-bold uppercase tracking-widest rounded-xl border border-[var(--az-border)] hover:bg-[var(--az-bg-secondary)] hover:border-[var(--az-accent-primary)] hover:text-[var(--az-accent-primary)] transition-colors cursor-pointer">
            Reset
          </button>
        </div>
      )}
    </div>
  );

  const isLoggedIn = !!localStorage.getItem('adultAccessToken');
  const hasLocationFilter = !isLoggedIn || !!(location.country || location.state || location.city);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-col gap-6 mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif italic text-[var(--az-text-primary)] leading-tight">Hook Up Tonight</h1>
            <p className="text-sm text-[var(--az-text-secondary)] font-serif italic">Someone desires you right now.</p>
          </div>

          <div className="flex items-center gap-3 self-end md:self-auto shrink-0">
            <button onClick={() => setIsMobileFilterOpen(true)} className="md:hidden px-4 h-10 rounded-full bg-[var(--az-bg-secondary)] border border-[var(--az-border)] text-white text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-[var(--az-bg-tertiary)] cursor-pointer">
              ⚙️ Filter
            </button>

            <div className="flex items-center gap-1.5 bg-[var(--az-bg-secondary)] p-1 rounded-full border border-[var(--az-border)]">
              <button onClick={() => setViewMode('grid')} className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all cursor-pointer ${viewMode === 'grid' ? 'bg-[var(--az-accent-primary)] text-white' : 'text-[var(--az-text-secondary)] hover:text-white'}`}>
                Grid
              </button>
              <button onClick={() => setViewMode('map')} className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all cursor-pointer ${viewMode === 'map' ? 'bg-[var(--az-accent-primary)] text-white' : 'text-[var(--az-text-secondary)] hover:text-white'}`}>
                Map
              </button>
            </div>
          </div>
        </div>

        <div className="hidden md:flex bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-2xl p-5 shadow-xl w-full">
          {renderFilterFields(false)}
        </div>
      </div>

      <div className="w-full">
        {!hasLocationFilter ? (
          <div className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-2xl p-12 text-center max-w-lg mx-auto shadow-2xl">
            <div className="text-4xl mb-4 text-zinc-500">📍</div>
            <h3 className="text-xl font-serif italic text-white mb-2">Where are you looking?</h3>
            <p className="text-xs text-[var(--az-text-secondary)] mb-6">Select a country and city to find providers near you.</p>
            <div className="max-w-xs mx-auto text-left space-y-4">
              <CustomSelect
                label="Country"
                value={location.country?.code || null}
                options={countryOptions}
                placeholder="Select Country"
                loading={countriesLoading}
                icon="🌍"
                searchPlaceholder="Search Country..."
                onSelect={(_val, _label, extra) => {
                  const ext = extra as { code: string; name: string };
                  setLocation({ country: { code: ext.code, name: ext.name }, state: undefined, city: undefined });
                }}
              />
            </div>
          </div>
        ) : viewMode === 'grid' ? (
          <>
            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
                {Array.from({ length: 8 }).map((_, idx) => <div key={idx} className="relative aspect-[3/4] rounded-2xl overflow-hidden border border-[var(--az-border)] bg-[var(--az-bg-tertiary)] animate-pulse" />)}
              </div>
            ) : providers.length === 0 ? (
              <div className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-2xl p-16 text-center max-w-lg mx-auto shadow-2xl">
                <div className="text-5xl mb-4 text-zinc-500">🌙</div>
                <h3 className="text-xl font-serif italic text-white mb-2">No providers in {location.city?.name || 'this area'} right now</h3>
                <p className="text-xs text-[var(--az-text-secondary)] mb-6">Try a nearby city or expand your search criteria.</p>
                <button onClick={handleResetFilters} className="px-6 py-2.5 bg-[var(--az-accent-primary)] hover:bg-red-700 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors">Clear Location Filter</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
                {providers.map((p) => (
                  <HookupProviderCard
                    key={p.id}
                    provider={p}
                    onNavigate={handleProviderNavigate}
                    onMessageClick={handleMessageClick}
                  />
                ))}
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 mt-8">
                <button disabled={page === 1} onClick={() => setPage(page - 1)} className="px-4 py-2 bg-[var(--az-bg-secondary)] border border-[var(--az-border)] text-white text-xs rounded-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer hover:bg-[var(--az-bg-tertiary)] transition-colors">Previous</button>
                <span className="text-xs text-[var(--az-text-secondary)]">Page {page} of {totalPages}</span>
                <button disabled={page === totalPages} onClick={() => setPage(page + 1)} className="px-4 py-2 bg-[var(--az-bg-secondary)] border border-[var(--az-border)] text-white text-xs rounded-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer hover:bg-[var(--az-bg-tertiary)] transition-colors">Next</button>
              </div>
            )}
          </>
        ) : (
          <div className="relative w-full h-[600px] rounded-2xl border border-[var(--az-border)] overflow-hidden">
            <HookupMap providers={mapProviders} center={mapCenter} zoom={mapZoom} openConversation={handleMessageClick} />

            <div className="absolute top-3 right-3 z-[1000] bg-black/85 backdrop-blur-md border border-[var(--az-border)] rounded-full px-4 py-1.5 text-xs font-medium text-[var(--az-text-secondary)] pointer-events-none">
              {mapProviders.length} providers in this area
            </div>

            {mapProviders.length === 0 && (
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-[1001] flex items-center justify-center">
                <div className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-2xl p-8 text-center max-w-sm mx-4 shadow-2xl">
                  <h3 className="text-lg font-serif italic text-white mb-2">No providers here yet</h3>
                  <p className="text-xs text-[var(--az-text-secondary)] mb-4">Be the first to discover someone nearby.</p>
                  <button onClick={handleResetFilters} className="px-5 py-2 bg-[var(--az-accent-primary)] hover:bg-red-700 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors">Browse All Providers →</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {isMobileFilterOpen && (
        <div className="fixed inset-0 z-[12000] flex items-end justify-center bg-black/80 backdrop-blur-md p-0">
          <div className="w-full bg-[var(--az-bg-secondary)] border-t border-[var(--az-border)] rounded-t-3xl p-6 max-h-[85vh] overflow-y-auto flex flex-col relative animate-slide-up">
            <button onClick={() => setIsMobileFilterOpen(false)} className="absolute top-4 right-4 text-[var(--az-text-muted)] hover:text-white cursor-pointer">✕</button>
            <h3 className="text-xl font-serif italic text-white mb-6">Filter Discoveries</h3>
            <div className="space-y-6 flex-grow">{renderFilterFields(true)}</div>
            <button onClick={() => setIsMobileFilterOpen(false)} className="w-full mt-6 py-4 bg-[var(--az-accent-primary)] text-white font-bold uppercase tracking-widest rounded-xl hover:bg-red-700 transition-colors cursor-pointer">Apply Filters</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default HookUpTonight;
