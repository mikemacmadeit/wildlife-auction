'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { getGoogleMapsApi } from '@/lib/google-maps/loader';

export interface AddressMapConfirmProps {
  lat: number;
  lng: number;
  formattedAddress: string;
  onConfirm: (result: { lat: number; lng: number; formattedAddress: string }) => void;
  className?: string;
  /** Rendered next to the Confirm address button (e.g. Back to search) */
  secondaryAction?: React.ReactNode;
}

export function AddressMapConfirm({
  lat,
  lng,
  formattedAddress,
  onConfirm,
  className = '',
  secondaryAction,
}: AddressMapConfirmProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const [currentAddress, setCurrentAddress] = useState(formattedAddress);
  const [currentLat, setCurrentLat] = useState(lat);
  const [currentLng, setCurrentLng] = useState(lng);
  const [geocoding, setGeocoding] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reverseGeocode = useCallback(
    (latitude: number, longitude: number) => {
      setGeocoding(true);
      setError(null);
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode(
        { location: { lat: latitude, lng: longitude } },
        (results, status) => {
          setGeocoding(false);
          if (status === google.maps.GeocoderStatus.OK && results?.[0]) {
            setCurrentAddress(results[0].formatted_address ?? '');
          }
          // Rural/imperfect: still allow confirm; we always store lat/lng
        }
      );
    },
    []
  );

  useEffect(() => {
    if (!mapContainerRef.current || !lat || !lng) return;
    let cancelled = false;
    getGoogleMapsApi()
      .then((g) => {
        if (cancelled || !mapContainerRef.current) return;
        const map = new g.maps.Map(mapContainerRef.current, {
          center: { lat, lng },
          zoom: 16,
          mapTypeControl: true,
          streetViewControl: false,
        });
        const marker = new g.maps.Marker({
          position: { lat, lng },
          map,
          draggable: true,
          title: 'Drag to adjust',
        });
        marker.addListener('dragend', () => {
          const pos = marker.getPosition();
          if (pos) {
            const newLat: number = typeof pos.lat === 'function' ? pos.lat() : Number(pos.lat);
            const newLng: number = typeof pos.lng === 'function' ? pos.lng() : Number(pos.lng);
            setCurrentLat(newLat);
            setCurrentLng(newLng);
            reverseGeocode(newLat, newLng);
          }
        });
        mapRef.current = map;
        markerRef.current = marker;
        setMapReady(true);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? 'Failed to load map');
      });
    return () => {
      cancelled = true;
      markerRef.current = null;
      mapRef.current = null;
    };
  }, [lat, lng, reverseGeocode]);

  const handleConfirm = useCallback(() => {
    onConfirm({
      lat: currentLat,
      lng: currentLng,
      formattedAddress: currentAddress || formattedAddress,
    });
  }, [currentLat, currentLng, currentAddress, formattedAddress, onConfirm]);

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="space-y-1">
        <Label className="text-sm">Confirm location</Label>
        <p className="text-xs text-muted-foreground">
          Drag the pin if needed. We always save the pin coordinates for rural addresses.
        </p>
      </div>
      <div
        ref={mapContainerRef}
        className="min-h-[200px] h-64 w-full rounded-md border bg-muted touch-none"
        aria-hidden
      />
      {geocoding && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Updating address…
        </p>
      )}
      <div className="rounded-md border bg-muted/50 p-2 text-sm">
        <span className="font-medium">Address: </span>
        <span className="text-muted-foreground">{currentAddress || formattedAddress}</span>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2">
        <Button
          type="button"
          onClick={handleConfirm}
          disabled={!mapReady}
          className="w-full sm:w-auto min-h-[48px] touch-manipulation"
        >
          Confirm address
        </Button>
        {secondaryAction}
      </div>
    </div>
  );
}
