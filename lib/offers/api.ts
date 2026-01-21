import { getIdToken } from '@/lib/firebase/auth-helper';
import { auth } from '@/lib/firebase/config';

const API_BASE = '/api/offers';

async function authedFetch(path: string, init: RequestInit = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error('User must be authenticated');
  const token = await getIdToken(user, true);
  if (!token) throw new Error('Failed to get authentication token');

  const res = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(data?.error || data?.message || 'Request failed');
    err.code = data?.code;
    err.data = data;
    throw err;
  }
  return data;
}

export async function createOffer(
  listingId: string,
  amount: number,
  note?: string,
  preferredPaymentMethod?: 'card' | 'ach_debit' | 'wire'
) {
  return authedFetch(`${API_BASE}/create`, {
    method: 'POST',
    body: JSON.stringify({ listingId, amount, note, preferredPaymentMethod }),
  });
}

export async function acceptOffer(offerId: string) {
  return authedFetch(`${API_BASE}/${offerId}/accept`, { method: 'POST', body: JSON.stringify({}) });
}

export async function counterOffer(offerId: string, amount: number, note?: string) {
  return authedFetch(`${API_BASE}/${offerId}/counter`, { method: 'POST', body: JSON.stringify({ amount, note }) });
}

export async function declineOffer(offerId: string, note?: string) {
  return authedFetch(`${API_BASE}/${offerId}/decline`, { method: 'POST', body: JSON.stringify({ note }) });
}

export async function withdrawOffer(offerId: string, note?: string) {
  return authedFetch(`${API_BASE}/${offerId}/withdraw`, { method: 'POST', body: JSON.stringify({ note }) });
}

export async function getMyOffers(params?: { status?: string; listingId?: string; limit?: number }) {
  const usp = new URLSearchParams();
  if (params?.status) usp.set('status', params.status);
  if (params?.listingId) usp.set('listingId', params.listingId);
  if (params?.limit) usp.set('limit', String(params.limit));
  const qs = usp.toString();
  return authedFetch(`${API_BASE}/mine${qs ? `?${qs}` : ''}`, { method: 'GET' });
}

export async function getSellerOffers(params?: { status?: string; limit?: number }) {
  const usp = new URLSearchParams();
  if (params?.status) usp.set('status', params.status);
  if (params?.limit) usp.set('limit', String(params.limit));
  const qs = usp.toString();
  return authedFetch(`${API_BASE}/seller${qs ? `?${qs}` : ''}`, { method: 'GET' });
}

export async function getOffer(offerId: string) {
  return authedFetch(`${API_BASE}/${offerId}`, { method: 'GET' });
}

