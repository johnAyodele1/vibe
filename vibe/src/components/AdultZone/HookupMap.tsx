import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { formatAmount } from '../../lib/pricing';

interface MapProvider {
  id: string;
  stageName: string;
  avatarUrl: string;
  coordinates: [number, number];
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

const isValidCoordinates = (coordinates: unknown): coordinates is [number, number] => {
  if (!Array.isArray(coordinates) || coordinates.length !== 2) return false;

  const [lat, lng] = coordinates;
  return (
    typeof lat === 'number' &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    typeof lng === 'number' &&
    Number.isFinite(lng) &&
    lng >= -180 &&
    lng <= 180
  );
};

export const HookupMap: React.FC<HookupMapProps> = ({
  providers,
  center,
  zoom,
  openConversation,
}) => {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return;

    const map = L.map(mapElementRef.current, {
      center,
      zoom,
      zoomControl: true,
      scrollWheelZoom: true,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org">OpenStreetMap</a> &copy; <a href="https://carto.com">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);

    markersLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    // Leaflet needs a layout pass when its container is initially mounted
    // inside a React conditional branch.
    requestAnimationFrame(() => map.invalidateSize());

    return () => {
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
    };
  }, [center, zoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isValidCoordinates(center)) return;

    map.setView(center, zoom);
    requestAnimationFrame(() => map.invalidateSize());
  }, [center, zoom]);

  useEffect(() => {
    const layer = markersLayerRef.current;
    if (!layer) return;

    layer.clearLayers();

    providers.forEach((provider) => {
      if (!isValidCoordinates(provider.coordinates)) return;

      const marker = L.circleMarker(provider.coordinates, {
        radius: 10,
        color: provider.isOnline ? '#22c55e' : '#c8102e',
        fillColor: provider.isOnline ? '#22c55e' : '#c8102e',
        fillOpacity: 0.85,
        weight: 2,
        opacity: 1,
      });

      const rate = provider.tonightRate
        ? `<span class="map-popup-rate text-xs font-mono" style="color: var(--az-accent-gold)">💎 ${formatAmount(provider.tonightRate)} tonight</span>`
        : '';

      const avatarUrl = provider.avatarUrl || '/placeholder.svg';
      const onlineLabel = provider.isOnline ? 'Online Now' : 'Offline';
      const onlineClass = provider.isOnline ? 'text-green-500' : 'text-zinc-500';

      marker.bindPopup(`
        <div class="map-popup-content flex items-center gap-2.5 p-3 min-w-[200px]">
          <img
            src="${avatarUrl.replace(/"/g, '&quot;')}"
            alt="${provider.stageName.replace(/"/g, '&quot;')}"
            class="map-popup-avatar w-10 h-10 rounded-full object-cover flex-shrink-0"
          />
          <div class="map-popup-info flex-grow flex flex-col gap-1">
            <span class="map-popup-name font-semibold text-sm text-white">${provider.stageName}</span>
            <span class="map-popup-status text-[11px] font-medium ${onlineClass}">● ${onlineLabel}</span>
            ${rate}
          </div>
          <button
            type="button"
            class="map-popup-btn px-3 py-1.5 rounded-lg bg-[var(--az-accent-primary)] text-white text-xs font-semibold cursor-pointer flex-shrink-0"
            data-provider-id="${provider.id}"
          >
            Message
          </button>
        </div>
      `);

      marker.on('popupopen', (event) => {
        const button = event.popup.getElement()?.querySelector<HTMLButtonElement>('[data-provider-id]');
        if (!button) return;

        button.addEventListener('click', () => {
          openConversation(provider.id);
        }, { once: true });
      });

      marker.addTo(layer);
    });
  }, [providers, openConversation]);

  return (
    <div
      ref={mapElementRef}
      style={{
        width: '100%',
        height: '100%',
        minHeight: '500px',
        borderRadius: '12px',
        overflow: 'hidden',
      }}
      aria-label="Hookup providers map"
    />
  );
};

export default HookupMap;
