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

