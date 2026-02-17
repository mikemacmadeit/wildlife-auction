'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, MapPin, Navigation } from 'lucide-react';
import { getGoogleMapsApi } from '@/lib/google-maps/loader';
import { parseGeocoderResult } from '@/lib/address/parseGooglePlace';
import type { ParsedGoogleAddress } from '@/lib/address/parseGooglePlace';
import { cn } from '@/lib/utils';

const DEFAULT_CENTER = { lat: 31.9686, lng: -99.9018 }; // Texas center

export interface AddressDropPinMapProps {
  onSelect: (address: ParsedGoogleAddress) => void;
  onCancel?: () => void;
  className?: string;
  /** Initial center (e.g. from geolocation). If not set, uses default or "Center on me". */
  initialCenter?: { lat: number; lng: number } | null;
  /** Label for the primary action button */
  confirmLabel?: string;
  /** Show a "Center on my location" button */
  showMyLocation?: boolean;
}

export function AddressDropPinMap({
  onSelect,
  onCancel,
  className = '',
  initialCenter = null,
  confirmLabel = 'Use this location',
  showMyLocation = true,
}: AddressDropPinMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(initialCenter);
  const [parsed, setParsed] = useState<ParsedGoogleAddress | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const reverseGeocode = useCallback((latitude: number, longitude: number) => {
    setGeocoding(true);
    setError(null);
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode(
      { location: { lat: latitude, lng: longitude } },
      (results, status) => {
        setGeocoding(false);
        if (status === google.maps.GeocoderStatus.OK && results?.[0]) {
          try {
            const addr = parseGeocoderResult(results[0]);
            setParsed(addr);
          } catch {
            setParsed({
              formattedAddress: results[0].formatted_address ?? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
              line1: 'Address',
              city: '',
              state: '',
              postalCode: '',
              country: 'US',
              lat: latitude,
              lng: longitude,
              placeId: '',
            });
          }
        } else {
          setParsed({
            formattedAddress: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
            line1: 'Dropped pin',
            city: '',
            state: '',
            postalCode: '',
            country: 'US',
            lat: latitude,
            lng: longitude,
            placeId: '',
          });
        }
      }
    );
  }, []);

  const placeOrMovePin = useCallback(
    (lat: number, lng: number) => {
      setPin({ lat, lng });
      if (markerRef.current) {
        markerRef.current.setPosition({ lat, lng });
      }
      if (mapRef.current) {
        mapRef.current.panTo({ lat, lng });
      }
      reverseGeocode(lat, lng);
    },
    [reverseGeocode]
  );

  useEffect(() => {
    if (!mapContainerRef.current) return;
    let cancelled = false;
    const center = initialCenter ?? DEFAULT_CENTER;
    getGoogleMapsApi()
      .then((g) => {
        if (cancelled || !mapContainerRef.current) return;
        const map = new g.maps.Map(mapContainerRef.current, {
          center,
          zoom: 14,
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: true,
          zoomControl: true,
          gestureHandling: 'greedy', // allow scroll/zoom on mobile without blocking
        });
        const marker = new g.maps.Marker({
          position: center,
          map,
          draggable: true,
          title: 'Delivery location',
        });
        marker.addListener('dragend', () => {
          const pos = marker.getPosition();
          if (pos) {
            const lat = typeof pos.lat === 'function' ? pos.lat() : Number(pos.lat);
            const lng = typeof pos.lng === 'function' ? pos.lng() : Number(pos.lng);
            setPin({ lat, lng });
            reverseGeocode(lat, lng);
          }
        });
        map.addListener('click', (e: google.maps.MapMouseEvent) => {
          const latLng = e.latLng;
          if (latLng) {
            const lat = typeof latLng.lat === 'function' ? latLng.lat() : Number(latLng.lat);
            const lng = typeof latLng.lng === 'function' ? latLng.lng() : Number(latLng.lng);
            placeOrMovePin(lat, lng);
          }
        });
        mapRef.current = map;
        markerRef.current = marker;
        setMapReady(true);
        setPin(center);
        reverseGeocode(center.lat, center.lng);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? 'Failed to load map');
      });
    return () => {
      cancelled = true;
      markerRef.current = null;
      mapRef.current = null;
    };
  }, [initialCenter?.lat, initialCenter?.lng, placeOrMovePin, reverseGeocode]);

  const centerOnMe = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Location is not available.');
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setLocating(false);
        placeOrMovePin(lat, lng);
        if (mapRef.current) {
          mapRef.current.setCenter({ lat, lng });
          mapRef.current.setZoom(16);
        }
      },
      () => {
        setLocating(false);
        setError('Could not get your location. Tap the map to place the pin.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, [placeOrMovePin]);

  const handleConfirm = useCallback(() => {
    if (parsed) {
      onSelect(parsed);
    } else if (pin) {
      onSelect({
        formattedAddress: `${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}`,
        line1: 'Dropped pin',
        city: '',
        state: '',
        postalCode: '',
        country: 'US',
        lat: pin.lat,
        lng: pin.lng,
        placeId: '',
      });
    }
  }, [parsed, pin, onSelect]);

  return (
    <div className={cn('space-y-3', className)}>
      <div className="space-y-1">
        <Label className="text-sm font-medium">Drop a pin</Label>
        <p className="text-xs text-muted-foreground">
          Tap the map to place the pin, or drag it to adjust. We use the exact coordinates for delivery.
        </p>
      </div>
      <div
        ref={mapContainerRef}
        className="min-h-[240px] h-[40dvh] sm:h-[320px] w-full rounded-lg border bg-muted overflow-hidden"
        aria-hidden
      />
      {showMyLocation && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full sm:w-auto min-h-[44px] touch-manipulation"
          disabled={!mapReady || locating}
          onClick={centerOnMe}
        >
          {locating ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin mr-2" />
          ) : (
            <Navigation className="h-4 w-4 shrink-0 mr-2" />
          )}
          Center on my location
        </Button>
      )}
      {geocoding && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Looking up address…
        </p>
      )}
      {(parsed || pin) && !geocoding && (
        <div className="rounded-lg border bg-muted/50 p-3 text-sm">
          <span className="font-medium">Location: </span>
          <span className="text-muted-foreground">
            {parsed?.formattedAddress ?? (pin ? `${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}` : '')}
          </span>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex flex-col-reverse sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2">
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            className="min-h-[48px] touch-manipulation w-full sm:w-auto"
            onClick={onCancel}
          >
            Cancel
          </Button>
        )}
        <Button
          type="button"
          onClick={handleConfirm}
          disabled={!mapReady || !pin}
          className="min-h-[48px] touch-manipulation w-full sm:w-auto"
        >
          <MapPin className="h-4 w-4 shrink-0 mr-2" />
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}
