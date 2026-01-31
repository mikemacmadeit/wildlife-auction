/**
 * Normalize Google Place result (address_components + geometry) into our address schema.
 */

export interface ParsedGoogleAddress {
  formattedAddress: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  lat: number;
  lng: number;
  placeId: string;
}

type AddressComponent = {
  long_name: string;
  short_name: string;
  types: string[];
};

/**
 * Parse Google Place Details result (geometry + address_components) and optional formatted_address.
 */
export function parseGooglePlace(
  place: {
    place_id?: string;
    formatted_address?: string;
    address_components?: AddressComponent[];
    geometry?: {
      location?: { lat: () => number; lng: () => number };
    };
  },
  options?: { formattedAddress?: string }
): ParsedGoogleAddress {
  const components = place.address_components ?? [];
  const get = (type: string): string =>
    components.find((c) => c.types.includes(type))?.long_name ?? '';
  const getShort = (type: string): string =>
    components.find((c) => c.types.includes(type))?.short_name ?? '';

  const streetNumber = get('street_number');
  const route = get('route');
  const subpremise = get('subpremise');
  const line1 = [streetNumber, route].filter(Boolean).join(' ').trim() || get('premise') || 'Address';
  const line2 = subpremise || undefined;
  const city =
    get('locality') ||
    get('sublocality') ||
    get('sublocality_level_1') ||
    get('administrative_area_level_2') ||
    '';
  const state = getShort('administrative_area_level_1');
  const postalCode = get('postal_code');
  const country = getShort('country') || 'US';

  const loc = place.geometry?.location;
  const lat = loc ? (typeof loc.lat === 'function' ? loc.lat() : Number(loc)) : 0;
  const lng = loc ? (typeof loc.lng === 'function' ? loc.lng() : Number(loc)) : 0;

  const formattedAddress =
    options?.formattedAddress ??
    place.formatted_address ??
    [line1, line2, [city, state].filter(Boolean).join(', '), postalCode, country]
      .filter(Boolean)
      .join(', ');

  return {
    formattedAddress,
    line1,
    line2: line2 || undefined,
    city,
    state,
    postalCode,
    country,
    lat,
    lng,
    placeId: place.place_id ?? '',
  };
}

/**
 * New Places API (Place class): addressComponents use longText/shortText; location is LatLng.
 */
type NewAddressComponent = {
  longText?: string;
  shortText?: string;
  types?: string[];
};

export function parseNewPlace(place: {
  id?: string;
  formattedAddress?: string;
  addressComponents?: NewAddressComponent[] | { longText: string; shortText: string; types: string[] }[];
  location?: { lat: number; lng: number } | (() => { lat: number; lng: number });
}): ParsedGoogleAddress {
  const components = place.addressComponents ?? [];
  const get = (type: string): string =>
    components.find((c) => c.types?.includes(type))?.longText ?? '';
  const getShort = (type: string): string =>
    components.find((c) => c.types?.includes(type))?.shortText ?? '';

  const streetNumber = get('street_number');
  const route = get('route');
  const subpremise = get('subpremise');
  const line1 = [streetNumber, route].filter(Boolean).join(' ').trim() || get('premise') || 'Address';
  const line2 = subpremise || undefined;
  const city =
    get('locality') ||
    get('sublocality') ||
    get('sublocality_level_1') ||
    get('administrative_area_level_2') ||
    '';
  const state = getShort('administrative_area_level_1');
  const postalCode = get('postal_code');
  const country = getShort('country') || 'US';

  let lat = 0;
  let lng = 0;
  if (place.location) {
    const loc = typeof place.location === 'function' ? place.location() : place.location;
    lat = typeof loc.lat === 'function' ? (loc as unknown as { lat: () => number; lng: () => number }).lat() : Number(loc.lat);
    lng = typeof loc.lng === 'function' ? (loc as unknown as { lat: () => number; lng: () => number }).lng() : Number(loc.lng);
  }

  const formattedAddress =
    place.formattedAddress ??
    [line1, line2, [city, state].filter(Boolean).join(', '), postalCode, country]
      .filter(Boolean)
      .join(', ');

  return {
    formattedAddress,
    line1,
    line2: line2 || undefined,
    city,
    state,
    postalCode,
    country,
    lat,
    lng,
    placeId: place.id ?? '',
  };
}
