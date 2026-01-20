import { getIdToken } from '@/lib/firebase/auth-helper';
import { auth } from '@/lib/firebase/config';

const API_BASE = '/api/sellers/follow';

async function authedFetch(body: any) {
  const user = auth.currentUser;
  if (!user) throw new Error('User must be authenticated');
  const token = await getIdToken(user, true);
  if (!token) throw new Error('Failed to get authentication token');

  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    const msg = data?.message || data?.error || 'Request failed';
    const err: any = new Error(msg);
    if (data?.code) err.code = data.code;
    throw err;
  }
  return data;
}

export async function followSeller(sellerId: string) {
  return authedFetch({ sellerId, action: 'follow' as const });
}

export async function unfollowSeller(sellerId: string) {
  return authedFetch({ sellerId, action: 'unfollow' as const });
}

