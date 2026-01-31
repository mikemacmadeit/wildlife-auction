/**
 * Singleton Google Maps API loader with Places library.
 * Uses the functional API: setOptions() + importLibrary() (Loader class was removed in @googlemaps/js-api-loader v2).
 * Env: NEXT_PUBLIC_GOOGLE_MAPS_KEY, or fallback NEXT_PUBLIC_FIREBASE_API_KEY (enable Maps JavaScript API + Places API on that key).
 */

import { setOptions, importLibrary } from '@googlemaps/js-api-loader';

let loaderPromise: Promise<typeof google> | null = null;

function getMapsKey(): string | undefined {
  if (typeof process === 'undefined') return undefined;
  const maps = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY?.trim();
  if (maps) return maps;
  return process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim();
}

export function getGoogleMapsApi(): Promise<typeof google> {
  if (loaderPromise) return loaderPromise;
  const key = getMapsKey();
  if (!key) {
    loaderPromise = Promise.reject(
      new Error('NEXT_PUBLIC_GOOGLE_MAPS_KEY or NEXT_PUBLIC_FIREBASE_API_KEY (with Maps/Places enabled) is required')
    );
    return loaderPromise;
  }
  setOptions({ key, v: 'weekly' });
  // Load core maps first so google.maps exists, then places (for legacy Autocomplete/PlacesService)
  loaderPromise = importLibrary('maps').then(() => importLibrary('places')).then(() => {
    if (typeof window !== 'undefined' && (window as unknown as { google?: typeof google }).google) {
      return (window as unknown as { google: typeof google }).google;
    }
    throw new Error('Google Maps API did not load');
  });
  return loaderPromise;
}
