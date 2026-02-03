'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getGoogleMapsApi } from '@/lib/google-maps/loader';
import type { LiveLocationPoint } from '@/hooks/useLiveLocationSubscriber';

export interface DeliveryTrackingMapProps {
  /** Driver's current location (null = waiting for first point) */
  driverLocation: LiveLocationPoint | null;
  /** Destination (delivery address) */
  destination: { lat: number; lng: number };
  /** Map height in px */
  height?: number;
  className?: string;
}

export function DeliveryTrackingMap({
  driverLocation,
  destination,
  height = 280,
  className = '',
}: DeliveryTrackingMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const driverMarkerRef = useRef<google.maps.Marker | null>(null);
  const destMarkerRef = useRef<google.maps.Marker | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    const MAP_LOAD_TIMEOUT_MS = 15000;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const loadPromise = Promise.race([
      getGoogleMapsApi(),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('Map is taking too long to load. Check your connection and try refreshing.')),
          MAP_LOAD_TIMEOUT_MS
        );
      }),
    ]);
    loadPromise
      .then((g) => {
        clearTimeout(timeoutId);
        if (cancelled || !containerRef.current) return;
        const center = driverLocation
          ? { lat: (driverLocation.lat + destination.lat) / 2, lng: (driverLocation.lng + destination.lng) / 2 }
          : destination;
        const map = new g.maps.Map(containerRef.current, {
          center,
          zoom: 14,
          mapTypeControl: true,
          streetViewControl: false,
        });
        const destMarker = new g.maps.Marker({
          position: destination,
          map,
          title: 'Delivery address',
          icon: undefined,
          label: undefined,
        });
        destMarkerRef.current = destMarker;
        if (driverLocation) {
          const driverMarker = new g.maps.Marker({
            position: { lat: driverLocation.lat, lng: driverLocation.lng },
            map,
            title: 'Driver',
          });
          driverMarkerRef.current = driverMarker;
          const bounds = new g.maps.LatLngBounds();
          bounds.extend(destination);
          bounds.extend({ lat: driverLocation.lat, lng: driverLocation.lng });
          map.fitBounds(bounds, { top: 24, right: 24, bottom: 24, left: 24 });
        }
        mapRef.current = map;
        setMapReady(true);
        setError(null);
      })
      .catch((e) => {
        clearTimeout(timeoutId);
        if (!cancelled) setError(e?.message ?? 'Failed to load map');
      });
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      driverMarkerRef.current = null;
      destMarkerRef.current = null;
      mapRef.current = null;
    };
  }, [destination.lat, destination.lng]);

  useEffect(() => {
    if (!mapReady || !driverLocation || !driverMarkerRef.current) return;
    driverMarkerRef.current.setPosition({ lat: driverLocation.lat, lng: driverLocation.lng });
    if (mapRef.current) {
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(destination);
      bounds.extend({ lat: driverLocation.lat, lng: driverLocation.lng });
      mapRef.current.fitBounds(bounds, { top: 24, right: 24, bottom: 24, left: 24 });
    }
  }, [mapReady, driverLocation?.lat, driverLocation?.lng, driverLocation, destination.lat, destination.lng]);

  if (error) {
    return (
      <div
        className={`flex items-center justify-center rounded-md border bg-muted text-muted-foreground text-sm ${className}`}
        style={{ minHeight: height }}
      >
        {error}
      </div>
    );
  }

  // Always render the map container so containerRef is set (required for getGoogleMapsApi to init).
  // Show loading overlay until map is ready. Previously we returned a different div when !mapReady,
  // so containerRef was never attached and the map never initialized (stuck on loading).
  return (
    <div
      className={`relative rounded-md border overflow-hidden bg-muted ${className}`}
      style={{ minHeight: height }}
    >
      <div
        ref={containerRef}
        className="absolute inset-0 w-full h-full"
        style={{ minHeight: height }}
        aria-label="Delivery tracking map"
      />
      {!mapReady && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-muted z-10"
          aria-live="polite"
          aria-busy="true"
        >
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
