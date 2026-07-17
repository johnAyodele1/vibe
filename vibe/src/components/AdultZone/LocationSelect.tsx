import React, { useState } from 'react';
import { useCountries, useStates, useCities } from '../../hooks/useLocation';

interface LocationValue {
  country?: { code: string; name: string };
  state?: { code: string; name: string };
  city?: { name: string; lat: number; lng: number };
}

interface LocationSelectProps {
  value?: LocationValue;
  onChange: (value: LocationValue) => void;
}

export const LocationSelect: React.FC<LocationSelectProps> = ({ value = {}, onChange }) => {
  const { data: countries, loading: countriesLoading } = useCountries();
  const { data: states, loading: statesLoading } = useStates(value.country?.code || null);
  const [cityQuery, setCityQuery] = useState('');
  const { data: cities, loading: citiesLoading } = useCities(
    value.country?.code || null,
    value.state?.code || null,
    cityQuery
  );

  const [activeSheet, setActiveSheet] = useState<'country' | 'state' | 'city' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const handleCountrySelect = (c: { code: string; name: string }) => {
    onChange({ country: c, state: undefined, city: undefined });
    setActiveSheet(null);
    setSearchQuery('');
  };

  const handleStateSelect = (s: { code: string; name: string }) => {
    onChange({ ...value, state: s, city: undefined });
    setActiveSheet(null);
    setSearchQuery('');
  };

  const handleCitySelect = (cityObj: { name: string; lat: number; lng: number }) => {
    onChange({ ...value, city: cityObj });
    setActiveSheet(null);
    setCityQuery('');
    setSearchQuery('');
  };

  const filteredCountries = countries
    ? countries.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : [];

  const filteredStates = states
    ? states.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : [];

  return (
    <div className="space-y-4">
      {/* Country Select */}
      <div>
        <label className="block text-xs font-bold uppercase tracking-widest text-[var(--az-text-secondary)] mb-2">Country</label>
        {countriesLoading ? (
          <div className="h-12 w-full bg-[var(--az-bg-tertiary)] animate-pulse rounded-xl" />
        ) : (
          <button
            type="button"
            onClick={() => { setActiveSheet('country'); setSearchQuery(''); }}
            className="w-full h-12 bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-4 text-left text-white flex items-center justify-between focus:border-[var(--az-accent-rose)] outline-none"
          >
            <span>{value.country ? `${value.country.name}` : 'Select Country'}</span>
            <span className="text-xs">▼</span>
          </button>
        )}
      </div>

      {/* State Select */}
      <div>
        <label className="block text-xs font-bold uppercase tracking-widest text-[var(--az-text-secondary)] mb-2">State/Region</label>
        {statesLoading ? (
          <div className="h-12 w-full bg-[var(--az-bg-tertiary)] animate-pulse rounded-xl" />
        ) : (
          <button
            type="button"
            disabled={!value.country}
            onClick={() => { if (value.country) { setActiveSheet('state'); setSearchQuery(''); } }}
            className={`w-full h-12 bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-4 text-left text-white flex items-center justify-between focus:border-[var(--az-accent-rose)] outline-none ${!value.country ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span>{value.state ? value.state.name : 'Select State/Region'}</span>
            <span className="text-xs">▼</span>
          </button>
        )}
      </div>

      {/* City Select */}
      <div>
        <label className="block text-xs font-bold uppercase tracking-widest text-[var(--az-text-secondary)] mb-2">City</label>
        {citiesLoading ? (
          <div className="h-12 w-full bg-[var(--az-bg-tertiary)] animate-pulse rounded-xl" />
        ) : (
          <button
            type="button"
            disabled={!value.state}
            onClick={() => { if (value.state) { setActiveSheet('city'); setSearchQuery(''); } }}
            className={`w-full h-12 bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-4 text-left text-white flex items-center justify-between focus:border-[var(--az-accent-rose)] outline-none ${!value.state ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span>{value.city ? value.city.name : 'Select City'}</span>
            <span className="text-xs">▼</span>
          </button>
        )}
      </div>

      {/* Beautiful Modal / Mobile Full-Screen Bottom Sheet */}
      {activeSheet && (
        <div className="fixed inset-0 z-[11000] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-0 sm:p-4">
          <div className="w-full max-w-md bg-[var(--az-bg-secondary)] border-t sm:border border-[var(--az-border)] rounded-t-3xl sm:rounded-3xl p-6 h-[80vh] sm:h-[600px] flex flex-col relative animate-slide-up">
            <button
              type="button"
              onClick={() => setActiveSheet(null)}
              className="absolute top-4 right-4 text-[var(--az-text-muted)] hover:text-white"
            >
              ✕
            </button>

            <h3 className="text-xl font-serif italic text-white mb-4 capitalize">
              Select {activeSheet}
            </h3>

            {/* Search Input */}
            {activeSheet !== 'city' && (
              <input
                type="text"
                placeholder={`Search {activeSheet}...`}
                className="w-full bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-4 py-3 text-white focus:border-[var(--az-accent-rose)] outline-none mb-4"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            )}

            {activeSheet === 'city' && (
              <input
                type="text"
                placeholder="Type city name to search..."
                className="w-full bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-4 py-3 text-white focus:border-[var(--az-accent-rose)] outline-none mb-4"
                value={cityQuery}
                onChange={e => setCityQuery(e.target.value)}
              />
            )}

            {/* List */}
            <div className="flex-grow overflow-y-auto space-y-1 pr-1">
              {activeSheet === 'country' && filteredCountries.map(c => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => handleCountrySelect({ code: c.code, name: c.name })}
                  className="w-full text-left py-3 px-4 rounded-xl hover:bg-[var(--az-bg-tertiary)] text-white flex items-center gap-3 transition-colors"
                >
                  <span className="text-xl">{c.flag}</span>
                  <span>{c.name}</span>
                </button>
              ))}

              {activeSheet === 'state' && filteredStates.map(s => (
                <button
                  key={s.code}
                  type="button"
                  onClick={() => handleStateSelect({ code: s.code, name: s.name })}
                  className="w-full text-left py-3 px-4 rounded-xl hover:bg-[var(--az-bg-tertiary)] text-white transition-colors"
                >
                  {s.name}
                </button>
              ))}

              {activeSheet === 'city' && cities && cities.map((c, idx) => (
                <button
                  key={c.name + idx}
                  type="button"
                  onClick={() => handleCitySelect({ name: c.name, lat: c.lat, lng: c.lng })}
                  className="w-full text-left py-3 px-4 rounded-xl hover:bg-[var(--az-bg-tertiary)] text-white transition-colors"
                >
                  {c.name}
                </button>
              ))}

              {activeSheet === 'city' && (!cities || cities.length === 0) && (
                <p className="text-xs text-[var(--az-text-muted)] text-center py-8">
                  {cityQuery.length > 0 ? 'No cities found' : 'Start typing to search cities...'}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default LocationSelect;
