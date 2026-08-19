import React from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { formatAmount } from '../../lib/pricing';

// Fix Leaflet's default marker icon issue in Vite
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: '/leaflet/marker-icon-2x.png',
  iconUrl: '/leaflet/marker-icon.png',
  shadowUrl: '/leaflet/marker-shadow.png',
});

interface MapProvider {
  id: string;
  stageName: string;
  avatarUrl: string;
  coordinates: [number, number];  // [lat, lng]
  isOnline: boolean;
  intention: string;
  tonightRate?: number;
}

interface HookupMapProps {
  providers: MapProvider[];
  center: [number, number];
  zoom: number;
  openConversation: (providerId: string) => void;
}

export const HookupMap: React.FC<HookupMapProps> = ({ providers, center, zoom, openConversation }) => {
  return (
    <div style={{ width: '100%', height: '100%', minHeight: '500px', borderRadius: '12px', overflow: 'hidden' }}>
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ width: '100%', height: '100%' }}
        zoomControl={true}
        scrollWheelZoom={true}
      >
        {/* Dark tile layer — matches app aesthetic */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org">OpenStreetMap</a> &copy; <a href="https://carto.com">CARTO</a>'
          maxZoom={19}
        />

        {providers.map((provider) => (
          <CircleMarker
            key={provider.id}
            center={provider.coordinates}
            radius={10}
            pathOptions={{
              color: provider.isOnline ? '#22c55e' : '#c8102e',
              fillColor: provider.isOnline ? '#22c55e' : '#c8102e',
              fillOpacity: 0.85,
              weight: 2,
              opacity: 1,
            }}
          >
            <Popup className="hookup-map-popup">
              <div className="map-popup-content flex items-center gap-2.5 p-3 min-w-[200px]">
                <img
                  src={provider.avatarUrl}
                  alt={provider.stageName}
                  className="map-popup-avatar w-10 h-10 rounded-full object-cover flex-shrink-0"
                />
                <div className="map-popup-info flex-grow flex flex-col gap-1">
                  <span className="map-popup-name font-semibold text-sm text-white">{provider.stageName}</span>
                  <span className={`map-popup-status text-[11px] font-medium ${provider.isOnline ? 'text-green-500' : 'text-zinc-500'}`}>
                    {provider.isOnline ? '● Online Now' : '● Offline'}
                  </span>
                  {provider.tonightRate && (
                    <span className="map-popup-rate text-xs font-mono text-[var(--az-accent-gold)]">
                      💎 {formatAmount(provider.tonightRate)} tonight
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="map-popup-btn px-3 py-1.5 rounded-lg bg-[var(--az-accent-primary)] text-white text-xs font-semibold cursor-pointer flex-shrink-0 hover:bg-red-700 transition-colors"
                  onClick={() => openConversation(provider.id)}
                >
                  Message
                </button>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
};

export default HookupMap;
