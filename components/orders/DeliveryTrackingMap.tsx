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
    getGoogleMapsApi()
      .then((g) => {
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
        if (!cancelled) setError(e?.message ?? 'Failed to load map');
      });
    return () => {
      cancelled = true;
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

  if (!mapReady) {
    return (
      <div
        className={`flex items-center justify-center rounded-md border bg-muted ${className}`}
        style={{ minHeight: height }}
      >
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`rounded-md border overflow-hidden bg-muted ${className}`}
      style={{ minHeight: height }}
      aria-label="Delivery tracking map"
    />
  );
}
