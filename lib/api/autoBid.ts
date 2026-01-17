import { auth } from '@/lib/firebase/config';
import { getIdToken } from 'firebase/auth';

export async function setAutoBidServer(params: {
  auctionId: string;
  maxBidCents: number;
}): Promise<{ ok: true; newCurrentBid: number; bidId?: string | null } | { ok: false; error: string }> {
  const user = auth.currentUser;
  if (!user) return { ok: false, error: 'You must be signed in.' };

  const token = await getIdToken(user, true);
  const res = await fetch(`/api/auctions/${encodeURIComponent(params.auctionId)}/auto-bid/set`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ maxBidCents: params.maxBidCents }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) return { ok: false, error: data?.error || 'Failed to set auto-bid' };
  return { ok: true, newCurrentBid: data.newCurrentBid, bidId: data.bidId ?? null };
}

export async function disableAutoBidServer(params: {
  auctionId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = auth.currentUser;
  if (!user) return { ok: false, error: 'You must be signed in.' };

  const token = await getIdToken(user, true);
  const res = await fetch(`/api/auctions/${encodeURIComponent(params.auctionId)}/auto-bid/disable`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({}),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) return { ok: false, error: data?.error || 'Failed to disable auto-bid' };
  return { ok: true };
}

