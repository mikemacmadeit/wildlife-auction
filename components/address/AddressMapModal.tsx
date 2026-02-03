'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MapPin, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getGoogleMapsApi } from '@/lib/google-maps/loader';
import { cn } from '@/lib/utils';

export interface AddressMapModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  address: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    zip: string;
    lat: number;
    lng: number;
    deliveryInstructions?: string;
  };
  title?: string;
  className?: string;
}

function formatAddress(addr: AddressMapModalProps['address']): string {
  const parts = [
    addr.line1,
    addr.line2,
    [addr.city, addr.state, addr.zip].filter(Boolean).join(', '),
  ].filter(Boolean);
  return parts.join(', ');
}

export function AddressMapModal({
  open,
  onOpenChange,
  address,
  title = 'Delivery address',
  className,
}: AddressMapModalProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { lat, lng } = address;
  const formatted = formatAddress(address);
  const mapsUrl = `https://www.google.com/maps?q=${encodeURIComponent(lat + ',' + lng)}`;

  useEffect(() => {
    if (!open || !mapContainerRef.current || lat == null || lng == null) return;
    let cancelled = false;
    setError(null);
    setMapReady(false);
    getGoogleMapsApi()
      .then((g) => {
        if (cancelled || !mapContainerRef.current) return;
        const map = new g.maps.Map(mapContainerRef.current, {
          center: { lat, lng },
          zoom: 15,
          mapTypeControl: true,
          streetViewControl: true,
          fullscreenControl: true,
          zoomControl: true,
          styles: [
            {
              featureType: 'poi',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }],
            },
          ],
        });
        const marker = new g.maps.Marker({
          position: { lat, lng },
          map,
          title: 'Delivery address',
        });
        mapRef.current = map;
        markerRef.current = marker;
        setMapReady(true);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? 'Map could not load');
      });
    return () => {
      cancelled = true;
      markerRef.current = null;
      mapRef.current = null;
    };
  }, [open, lat, lng]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'max-w-lg sm:max-w-xl p-0 overflow-hidden gap-0',
          className
        )}
      >
        <DialogHeader className="px-4 pt-4 pb-2 sm:px-6 sm:pt-6">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
            <MapPin className="h-5 w-5 text-primary shrink-0" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 px-4 pb-4 sm:px-6 sm:pb-6">
          {/* Address block */}
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
            <p className="text-sm font-medium text-foreground leading-relaxed break-words">
              {formatted}
            </p>
            {address.deliveryInstructions && (
              <p className="mt-2 text-xs text-muted-foreground border-t border-border/40 pt-2">
                <span className="font-medium text-foreground/80">Instructions:</span>{' '}
                {address.deliveryInstructions}
              </p>
            )}
          </div>

          {/* Map */}
          <div className="relative rounded-xl border border-border/60 overflow-hidden bg-muted/30 min-h-[200px]">
            <div
              ref={mapContainerRef}
              className="w-full h-[240px] sm:h-[280px] min-h-[200px]"
              aria-hidden
            />
            {!mapReady && !error && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/60 rounded-xl">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}
            {error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center bg-muted/40 rounded-xl">
                <p className="text-sm text-muted-foreground">{error}</p>
                <Button variant="outline" size="sm" asChild>
                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open in Google Maps
                  </a>
                </Button>
              </div>
            )}
          </div>

          {/* Open in Google Maps link */}
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" asChild>
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Open in Google Maps
              </a>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
