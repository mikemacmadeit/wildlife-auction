/**
 * When order has deliveryTracking.enabled and current user is the driver,
 * watch geolocation and write latest point to RTDB liveLocations/{orderId}.
 * Throttle: at most every 5s OR if moved > 25m. Stops when enabled becomes false or unmount.
 */

import { useEffect, useRef } from 'react';
import { getDatabase, set } from '@/lib/firebase/rtdb';
import type { Order } from '@/lib/types';

const WRITE_INTERVAL_MS = 5000;
const MIN_DISTANCE_METERS = 25;
const POOR_ACCURACY_METERS = 50;
const MAX_AGE_FOR_POOR_ACCURACY_MS = 30000;

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function useDeliveryLocationPublisher(
  order: Order | null,
  currentUserUid: string | null
) {
  const watchIdRef = useRef<number | null>(null);
  const lastWriteRef = useRef<{ lat: number; lng: number; at: number } | null>(null);
  const lastPositionRef = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!order?.id || !currentUserUid) {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      lastWriteRef.current = null;
      lastPositionRef.current = null;
      return;
    }

    const tracking = order.deliveryTracking;
    const enabled =
      tracking?.enabled === true &&
      (tracking.driverUid === currentUserUid || order.sellerId === currentUserUid);
    const isDriver = tracking?.driverUid === currentUserUid || order.sellerId === currentUserUid;

    if (!enabled || !isDriver) {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      lastWriteRef.current = null;
      lastPositionRef.current = null;
      return;
    }

    const orderId = order.id;
    const db = getDatabase();
    if (!db) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[DeliveryTracking] RTDB not configured; skipping location publish');
      }
      return;
    }

    const writeLocation = (lat: number, lng: number, accuracy?: number, heading?: number, speed?: number) => {
      const path = `liveLocations/${orderId}`;
      const payload = {
        lat,
        lng,
        ...(typeof accuracy === 'number' && accuracy <= POOR_ACCURACY_METERS * 2 ? { accuracy } : {}),
        ...(typeof heading === 'number' ? { heading } : {}),
        ...(typeof speed === 'number' ? { speed } : {}),
        updatedAt: Date.now(),
      };
      set(path, payload).catch((err) => {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[DeliveryTracking] RTDB set failed:', err);
        }
      });
      lastWriteRef.current = { lat, lng, at: Date.now() };
    };

    const onPosition = (position: GeolocationPosition) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const accuracy = position.coords.accuracy ?? 0;
      const now = Date.now();
      const last = lastWriteRef.current;
      const lastPos = lastPositionRef.current;

      if (accuracy > POOR_ACCURACY_METERS && last != null && now - last.at < MAX_AGE_FOR_POOR_ACCURACY_MS) {
        return;
      }

      const shouldWriteByTime = !last || now - last.at >= WRITE_INTERVAL_MS;
      const shouldWriteByDistance =
        !lastPos || haversineMeters(lastPos.lat, lastPos.lng, lat, lng) >= MIN_DISTANCE_METERS;

      if (shouldWriteByTime || shouldWriteByDistance) {
        writeLocation(lat, lng, accuracy, position.coords.heading ?? undefined, position.coords.speed ?? undefined);
        lastPositionRef.current = { lat, lng };
      }
    };

    const onError = (err: GeolocationPositionError) => {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[DeliveryTracking] Geolocation error:', err.code, err.message);
      }
    };

    watchIdRef.current = navigator.geolocation.watchPosition(
      onPosition,
      onError,
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      lastWriteRef.current = null;
      lastPositionRef.current = null;
    };
  }, [order?.id, order?.deliveryTracking?.enabled, order?.deliveryTracking?.driverUid, order?.sellerId, currentUserUid]);
}
