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
  return json as ListingLimitResponse;
}

