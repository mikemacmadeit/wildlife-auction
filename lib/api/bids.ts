import { auth } from '@/lib/firebase/config';
import { getIdToken } from 'firebase/auth';

export async function placeBidServer(params: {
  listingId: string;
  amount: number;
}): Promise<
  | {
      ok: true;
      newCurrentBid: number;
      bidId: string;
      bidCountDelta: number;
      priceMoved: boolean;
      highBidderChanged: boolean;
      newBidderId: string | null;
      prevBidderId: string | null;
      yourMaxBid: number;
    }
  | { ok: false; error: string }
> {
  const user = auth.currentUser;
  if (!user) {
    return { ok: false, error: 'You must be signed in to place a bid.' };
  }

  // Do NOT force-refresh the token on every bid; bidding is high-frequency.
  // Firebase will refresh automatically when needed.
  const token = await getIdToken(user, false);
  const res = await fetch('/api/bids/place', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ listingId: params.listingId, amount: params.amount }),
  });

  let data: any = null;
  let text: string | null = null;
  try {
    const ct = String(res.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('application/json')) {
      data = await res.json().catch(() => null);
    } else {
      text = await res.text().catch(() => null);
      data = null;
    }
  } catch {
    data = null;
  }

  if (!res.ok || !data?.ok) {
    // Friendly handling for rate limits (429) with retry-after.
    const retryAfter =
      res.status === 429
        ? Number(res.headers.get('retry-after') || (data?.retryAfter ?? 0)) || 0
        : 0;
    const apiErr =
      (data && (data.error || data.message)) ||
      (text ? text.slice(0, 200) : null) ||
      `Failed to place bid (${res.status})`;
    if (res.status === 429) {
      return {
        ok: false,
        error: retryAfter > 0 ? `Too many bid attempts. Try again in ${retryAfter}s.` : 'Too many bid attempts. Try again in a moment.',
      };
    }
    return { ok: false, error: String(apiErr) };
  }
  return {
    ok: true,
    newCurrentBid: Number(data.newCurrentBid || 0) || 0,
    bidId: String(data.bidId || ''),
    bidCountDelta: Number(data.bidCountDelta || 0) || 0,
    priceMoved: Boolean(data.priceMoved),
    highBidderChanged: Boolean(data.highBidderChanged),
    newBidderId: data.newBidderId ? String(data.newBidderId) : null,
    prevBidderId: data.prevBidderId ? String(data.prevBidderId) : null,
    yourMaxBid: Number(data.yourMaxBid || 0) || params.amount,
  };
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

