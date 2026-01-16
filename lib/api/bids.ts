import { auth } from '@/lib/firebase/config';
import { getIdToken } from 'firebase/auth';

export async function placeBidServer(params: {
  listingId: string;
  amount: number;
}): Promise<{ ok: true; newCurrentBid: number; bidId: string } | { ok: false; error: string }> {
  const user = auth.currentUser;
  if (!user) {
    return { ok: false, error: 'You must be signed in to place a bid.' };
  }

  const token = await getIdToken(user, true);
  const res = await fetch('/api/bids/place', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ listingId: params.listingId, amount: params.amount }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    return { ok: false, error: data?.error || 'Failed to place bid' };
  }
  return { ok: true, newCurrentBid: data.newCurrentBid, bidId: data.bidId };
}

export type MyBidRow = {
  kind: 'bid';
  listingId: string;
  listingType: string;
  listingTitle: string;
  listingImage?: string;
  sellerId?: string;
  sellerName?: string;
  myMaxBid: number;
  myBidCount: number;
  myLastBidAt: number | null;
  currentHighestBid: number;
  endsAt: number | null;
  status: 'WINNING' | 'OUTBID' | 'WON' | 'LOST';
};

export async function getMyBids(params?: { limit?: number }): Promise<{ ok: true; bids: MyBidRow[] } | { ok: false; error: string }> {
  const user = auth.currentUser;
  if (!user) return { ok: false, error: 'You must be signed in to view your bids.' };

  const token = await getIdToken(user, true);
  const qs = new URLSearchParams();
  if (params?.limit) qs.set('limit', String(params.limit));

  const res = await fetch(`/api/bids/mine?${qs.toString()}`, {
    method: 'GET',
    headers: { authorization: `Bearer ${token}` },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    return { ok: false, error: data?.error || data?.message || 'Failed to load bids' };
  }
  return { ok: true, bids: (data.bids || []) as MyBidRow[] };
}

