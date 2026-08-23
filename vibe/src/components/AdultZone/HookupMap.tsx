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
  return typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90 && typeof lng === 'number' && Number.isFinite(lng) && lng >= -180 && lng <= 180;
};

const createPopupContent = (provider: MapProvider, onMessage: () => void): HTMLDivElement => {
  const container = document.createElement('div');
  container.className = 'map-popup-content flex items-center gap-2.5 p-3 min-w-[200px]';

  const avatar = document.createElement('img');
  avatar.src = provider.avatarUrl || '/placeholder.svg';
  avatar.alt = provider.stageName || 'Provider';
  avatar.className = 'map-popup-avatar w-10 h-10 rounded-full object-cover flex-shrink-0';
  avatar.addEventListener('error', () => {
    if (!avatar.src.endsWith('/placeholder.svg')) avatar.src = '/placeholder.svg';
  });

  const info = document.createElement('div');
  info.className = 'map-popup-info flex-grow flex flex-col gap-1';

  const name = document.createElement('span');
  name.className = 'map-popup-name font-semibold text-sm text-white';
  name.textContent = provider.stageName || 'Provider';

  const status = document.createElement('span');
  status.className = `map-popup-status text-[11px] font-medium ${provider.isOnline ? 'text-green-500' : 'text-zinc-500'}`;
  status.textContent = provider.isOnline ? '● Online Now' : '● Offline';
  info.append(name, status);

  if (provider.tonightRate) {
    const rate = document.createElement('span');
    rate.className = 'map-popup-rate text-xs font-mono';
    rate.style.color = 'var(--az-accent-gold)';
    rate.textContent = `💎 ${formatAmount(provider.tonightRate)} tonight`;
    info.append(rate);
  }

  const messageButton = document.createElement('button');
  messageButton.type = 'button';
  messageButton.className = 'map-popup-btn px-3 py-1.5 rounded-lg bg-[var(--az-accent-primary)] text-white text-xs font-semibold cursor-pointer flex-shrink-0';
  messageButton.textContent = 'Message';
  messageButton.addEventListener('click', onMessage);

  container.append(avatar, info, messageButton);
  return container;
};

export const HookupMap: React.FC<HookupMapProps> = ({ providers, center, zoom, openConversation }) => {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const initialRafRef = useRef<number | null>(null);
  const viewRafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current || !isValidCoordinates(center)) return;

    const map = L.map(mapElementRef.current, { center, zoom, zoomControl: true, scrollWheelZoom: true });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org">OpenStreetMap</a> &copy; <a href="https://carto.com">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);
    markersLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    initialRafRef.current = requestAnimationFrame(() => {
      initialRafRef.current = null;
      map.invalidateSize();
    });

    return () => {
      if (initialRafRef.current !== null) {
        cancelAnimationFrame(initialRafRef.current);
        initialRafRef.current = null;
      }
      if (viewRafRef.current !== null) {
        cancelAnimationFrame(viewRafRef.current);
        viewRafRef.current = null;
      }

      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isValidCoordinates(center)) return;

    map.setView(center, zoom);

    if (viewRafRef.current !== null) {
      cancelAnimationFrame(viewRafRef.current);
    }

    viewRafRef.current = requestAnimationFrame(() => {
      viewRafRef.current = null;
      map.invalidateSize();
    });

    return () => {
      if (viewRafRef.current !== null) {
        cancelAnimationFrame(viewRafRef.current);
        viewRafRef.current = null;
      }
    };
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
      marker.bindPopup(createPopupContent(provider, () => openConversation(provider.id)));
      marker.addTo(layer);
    });
  }, [providers, openConversation]);

  return (
    <div
      ref={mapElementRef}
      className="relative isolate z-0 w-full h-full min-h-0 max-h-full rounded-xl overflow-hidden"
      aria-label="Hookup providers map"
    />
  );
};

export default HookupMap;
