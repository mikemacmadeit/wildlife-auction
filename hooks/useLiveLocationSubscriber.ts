/**
 * Subscribe to live driver location for an order (RTDB liveLocations/{orderId}).
 * Used by buyer to show moving marker. Returns null when tracking is off or no data yet.
 * On permission denied or other errors, sets error so UI can show a helpful message.
 */

import { useEffect, useState } from 'react';
import { onValue } from '@/lib/firebase/rtdb';

export interface LiveLocationPoint {
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  accuracy?: number;
  updatedAt: number;
}

export function useLiveLocationSubscriber(orderId: string | null, enabled: boolean) {
  const [location, setLocation] = useState<LiveLocationPoint | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId || !enabled) {
      setLocation(null);
      setError(null);
      return;
    }

    setError(null);
    const path = `liveLocations/${orderId}`;
    const unsubscribe = onValue(
      path,
      (data: unknown) => {
        if (data == null) {
          setLocation(null);
          return;
        }
        const raw = data as Record<string, unknown>;
        const lat = typeof raw.lat === 'number' ? raw.lat : null;
        const lng = typeof raw.lng === 'number' ? raw.lng : null;
        const updatedAt = typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now();
        if (lat != null && lng != null) {
          setLocation({
            lat,
            lng,
            heading: typeof raw.heading === 'number' ? raw.heading : undefined,
            speed: typeof raw.speed === 'number' ? raw.speed : undefined,
            accuracy: typeof raw.accuracy === 'number' ? raw.accuracy : undefined,
            updatedAt,
          });
          setError(null);
        } else {
          setLocation(null);
        }
      },
      (err: Error) => {
        setLocation(null);
        const msg = err?.message ?? String(err);
        setError(msg.includes('permission') ? 'Unable to load live location. The seller must keep the order page open while delivering.' : msg);
      }
    );

    return () => {
      unsubscribe();
      setLocation(null);
      setError(null);
    };
  }, [orderId, enabled]);

  return { location, error };
}
