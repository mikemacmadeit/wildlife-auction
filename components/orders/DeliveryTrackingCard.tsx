'use client';

import { useCallback, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, MapPin, Truck, AlertTriangle } from 'lucide-react';
import type { Order } from '@/lib/types';
import { getEffectiveTransactionStatus } from '@/lib/orders/status';
import { useLiveLocationSubscriber } from '@/hooks/useLiveLocationSubscriber';
import { useDeliveryLocationPublisher } from '@/hooks/useDeliveryLocationPublisher';
import { DeliveryTrackingMap } from './DeliveryTrackingMap';
import { getDatabase } from '@/lib/firebase/rtdb';

const STALE_SECONDS = 60;

/** Triggers browser location prompt; returns true if granted. Mobile-friendly options. */
function requestLocationPermission(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(false);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => resolve(true),
      () => resolve(false),
      {
        enableHighAccuracy: false,
        maximumAge: 60000, // Allow cached position for faster response on mobile
        timeout: 20000,
      }
    );
  });
}

const LOCATION_DENIED_INSTRUCTIONS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)
  ? 'On iPhone: Settings → Safari → Location → set to "Ask" or "Allow". Or tap the aA icon in the address bar → Website Settings → Location → Allow. Then refresh.'
  : typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)
    ? 'On Android: Tap the lock icon in the address bar → Site settings → Location → Allow. Or in Chrome: Settings → Site settings → Location. Then refresh.'
    : 'In your browser or device Settings, allow location access for this site. Then refresh the page.';

export interface DeliveryTrackingCardProps {
  order: Order;
  role: 'buyer' | 'seller';
  currentUserUid: string | null;
  onStartTracking: () => Promise<void>;
  onStopTracking: () => Promise<void>;
  onMarkDelivered: () => Promise<void>;
  /** When seller is processing start/stop/delivered */
  processing?: 'start' | 'stop' | 'delivered' | null;
}

export function DeliveryTrackingCard({
  order,
  role,
  currentUserUid,
  onStartTracking,
  onStopTracking,
  onMarkDelivered,
  processing = null,
}: DeliveryTrackingCardProps) {
  const txStatus = getEffectiveTransactionStatus(order);
  const tracking = order.deliveryTracking;
  const enabled = tracking?.enabled === true;
  const ended = !!tracking?.endedAt;
  const isSellerDriver =
    role === 'seller' &&
    currentUserUid &&
    (tracking?.driverUid === currentUserUid || order.sellerId === currentUserUid);

  const [locationDenied, setLocationDenied] = useState(false);
  const [permissionRequesting, setPermissionRequesting] = useState(false);
  const rtdbAvailable = !!getDatabase();

  const requestPermissionAndStart = useCallback(async () => {
    setPermissionRequesting(true);
    setLocationDenied(false);
    try {
      const granted = await requestLocationPermission();
      if (granted) {
        setLocationDenied(false);
        await onStartTracking();
      } else {
        setLocationDenied(true);
      }
    } catch {
      setLocationDenied(true);
    } finally {
      setPermissionRequesting(false);
    }
  }, [onStartTracking]);

  const canStartTracking =
    role === 'seller' &&
    order.transportOption === 'SELLER_TRANSPORT' &&
    txStatus === 'DELIVERY_SCHEDULED' &&
    !enabled &&
    !ended &&
    (order.delivery?.buyerAddress?.line1 || order.deliveryAddress?.line1);

  const { location: driverLocation, error: locationError } = useLiveLocationSubscriber(
    order.id,
    enabled && role === 'buyer'
  );
  useDeliveryLocationPublisher(enabled && isSellerDriver ? order : null, currentUserUid ?? null);

  const destination = (() => {
    const addr = order.deliveryAddress || order.delivery?.buyerAddress;
    if (addr?.lat != null && addr?.lng != null) return { lat: Number(addr.lat), lng: Number(addr.lng) };
    return null;
  })();

  const lastUpdatedSeconds = driverLocation?.updatedAt
    ? Math.floor((Date.now() - driverLocation.updatedAt) / 1000)
    : null;
  const isStale = lastUpdatedSeconds != null && lastUpdatedSeconds > STALE_SECONDS;

  const statusChip = ended ? 'ENDED' : enabled ? 'LIVE' : 'OFF';

  if (order.transportOption !== 'SELLER_TRANSPORT') return null;
  // Seller: only show this card once delivery is agreed (DELIVERY_SCHEDULED) or in progress — part of "out for delivery" flow
  const sellerOutForDeliveryStatuses = ['DELIVERY_SCHEDULED', 'OUT_FOR_DELIVERY', 'DELIVERED_PENDING_CONFIRMATION'];
  if (role === 'seller' && !sellerOutForDeliveryStatuses.includes(txStatus)) return null;
  if (!rtdbAvailable && role === 'buyer' && !enabled) return null;
  if (!rtdbAvailable && role === 'seller' && !canStartTracking && !enabled) return null;

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2 px-4 sm:px-6 pt-4 sm:pt-6">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Truck className="h-4 w-4" />
            Live delivery tracking
          </CardTitle>
          <Badge variant={statusChip === 'LIVE' ? 'default' : statusChip === 'ENDED' ? 'secondary' : 'outline'}>
            {statusChip}
          </Badge>
        </div>
        <CardDescription>
          {role === 'buyer'
            ? enabled
              ? 'Track the driver on the map below.'
              : ended
                ? 'Tracking has ended.'
                : 'Tracking will appear when the seller starts delivery.'
            : 'Share your location with the buyer while delivering. Works while this screen is open.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-4 sm:px-6 pb-4 sm:pb-6">
        {role === 'buyer' && (
          <>
            {enabled && (
              <>
                {destination ? (
                  <DeliveryTrackingMap
                    driverLocation={driverLocation ?? null}
                    destination={destination}
                    height={280}
                  />
                ) : (
                  <div className="min-h-[200px] rounded-md border bg-muted flex items-center justify-center text-sm text-muted-foreground">
                    No delivery address coordinates.
                  </div>
                )}
                <div className="text-xs text-muted-foreground">
                  {locationError ? (
                    <span className="text-amber-600 dark:text-amber-400">
                      {locationError}
                    </span>
                  ) : driverLocation ? (
                    isStale ? (
                      <span className="text-amber-600 dark:text-amber-400">
                        Signal lost — last update {lastUpdatedSeconds}s ago
                      </span>
                    ) : (
                      <>Last updated {lastUpdatedSeconds ?? 0}s ago</>
                    )
                  ) : (
                    <span>Waiting for driver&apos;s location… The seller must keep this order page open in their browser (same tab) during delivery. If they have, try refreshing.</span>
                  )}
                </div>
              </>
            )}
            {ended && (
              <p className="text-sm text-muted-foreground">Delivery completed. Confirm receipt when ready.</p>
            )}
          </>
        )}

        {role === 'seller' && (
          <>
            {locationDenied && (
              <div className="text-sm text-amber-900 dark:text-amber-100 bg-amber-50 dark:bg-amber-950/20 p-4 rounded-lg border border-amber-200 dark:border-amber-800 space-y-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold">Location permission required</div>
                    <div className="text-xs mt-1 text-amber-800 dark:text-amber-200">
                      {LOCATION_DENIED_INSTRUCTIONS}
                    </div>
                  </div>
                </div>
                <Button
                  variant="default"
                  size="lg"
                  className="w-full sm:w-auto min-h-[44px] touch-manipulation bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                  disabled={!!processing || permissionRequesting}
                  onClick={requestPermissionAndStart}
                >
                  {permissionRequesting || processing === 'start' ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <MapPin className="h-4 w-4 mr-2" />
                  )}
                  Allow location & start tracking
                </Button>
              </div>
            )}

            {canStartTracking && !locationDenied && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5 min-w-0">
                    <Label htmlFor="live-tracking-toggle" className="text-sm font-medium">Live tracking</Label>
                    <p className="text-xs text-muted-foreground">Share your location with the buyer while delivering</p>
                  </div>
                  <Switch
                    id="live-tracking-toggle"
                    checked={permissionRequesting || processing === 'start'}
                    disabled={!!processing || permissionRequesting}
                    onCheckedChange={async (checked) => {
                      if (checked) await requestPermissionAndStart();
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {permissionRequesting || processing === 'start'
                    ? 'Starting… keep this page open and allow location when prompted.'
                    : 'Turn on to start — you&apos;ll be prompted to allow location access.'}
                </p>
              </div>
            )}

            {enabled && isSellerDriver && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="live-tracking-toggle-on" className="text-sm font-medium">Live tracking</Label>
                    <p className="text-xs text-muted-foreground">Tracking works while you keep this screen open</p>
                  </div>
                  <Switch
                    id="live-tracking-toggle-on"
                    checked={true}
                    disabled={!!processing}
                    onCheckedChange={async (checked) => {
                      if (!checked) {
                        try {
                          await onStopTracking();
                        } catch {
                          // caller toasts
                        }
                      }
                    }}
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-[44px] touch-manipulation w-full sm:w-auto"
                  disabled={!!processing}
                  onClick={async () => {
                    try {
                      await onStopTracking();
                    } catch {
                      // caller toasts
                    }
                  }}
                >
                  {processing === 'stop' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Stop tracking
                </Button>
                <p className="text-xs text-muted-foreground">
                  To complete delivery, use the delivery checklist at handoff (PIN, signature, photo).
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
