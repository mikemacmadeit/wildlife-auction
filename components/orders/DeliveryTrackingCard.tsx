'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, MapPin, Truck, AlertTriangle } from 'lucide-react';
import type { Order } from '@/lib/types';
import { getEffectiveTransactionStatus } from '@/lib/orders/status';
import { useLiveLocationSubscriber } from '@/hooks/useLiveLocationSubscriber';
import { useDeliveryLocationPublisher } from '@/hooks/useDeliveryLocationPublisher';
import { DeliveryTrackingMap } from './DeliveryTrackingMap';
import { getDatabase } from '@/lib/firebase/rtdb';

const STALE_SECONDS = 60;

function requestLocationPermission(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(false);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => resolve(true),
      (err) => resolve(err.code === 1 ? false : false),
      { timeout: 8000, maximumAge: 0 }
    );
  });
}

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
  const rtdbAvailable = !!getDatabase();

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
      <CardHeader className="pb-2">
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
      <CardContent className="space-y-3">
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
                    <span>Waiting for driver&apos;s location… The seller must have the order page open while delivering.</span>
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
              <div className="text-sm text-amber-900 dark:text-amber-100 bg-amber-50 dark:bg-amber-950/20 p-3 rounded-lg border border-amber-200 dark:border-amber-800 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">Location permission required</div>
                  <div className="text-xs mt-1 text-amber-800 dark:text-amber-200">
                    To share live tracking, allow location access. You can still mark delivered without tracking.
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => setLocationDenied(false)}
                  >
                    Retry permission
                  </Button>
                </div>
              </div>
            )}

            {canStartTracking && !locationDenied && (
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  variant="default"
                  size="lg"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                  disabled={!!processing}
                  onClick={async () => {
                    const granted = await requestLocationPermission();
                    if (!granted) {
                      setLocationDenied(true);
                      return;
                    }
                    try {
                      await onStartTracking();
                    } catch {
                      // caller toasts
                    }
                  }}
                >
                  {processing === 'start' ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <MapPin className="h-4 w-4 mr-2" />
                  )}
                  Start delivery
                </Button>
              </div>
            )}

            {enabled && isSellerDriver && (
              <>
                <p className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">Live tracking ON</p>
                <p className="text-xs text-muted-foreground">
                  Tracking works while you keep this screen open.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
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
                  <Button
                    variant="default"
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700"
                    disabled={!!processing}
                    onClick={async () => {
                      try {
                        await onMarkDelivered();
                      } catch {
                        // caller toasts
                      }
                    }}
                  >
                    {processing === 'delivered' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Mark delivered
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
