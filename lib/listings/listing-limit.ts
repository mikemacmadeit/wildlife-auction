export type ListingLimitResponse = {
  canCreate: boolean;
  planId: string;
  planDisplayName: string;
  activeListingsCount: number;
  listingLimit: number | null;
  remainingSlots: number | null;
  isUnlimited: boolean;
  message?: string;
};

export async function checkListingLimit(token: string): Promise<ListingLimitResponse> {
  // Small client-side cache to keep the UI snappy and avoid repeated checks on navigation/click.
  // We cache for 60 seconds in sessionStorage (per-tab) so it won't stick around across sessions.
  const CACHE_KEY = 'we_listing_limit_cache_v1';
  const CACHE_TTL_MS = 60_000;

  if (typeof window !== 'undefined') {
    try {
      const raw = window.sessionStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { at: number; data: ListingLimitResponse };
        if (parsed?.at && Date.now() - parsed.at < CACHE_TTL_MS && parsed?.data) {
          return parsed.data;
        }
      }
    } catch {
      // ignore cache errors
    }
  }

  const res = await fetch('/api/listings/check-limit', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action: 'create' }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error || json?.message || 'Failed to check listing limit');
  }

  const data = json as ListingLimitResponse;
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
    } catch {
      // ignore
    }
  }

  return data;
}

