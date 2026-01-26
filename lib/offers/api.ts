import { getIdToken } from '@/lib/firebase/auth-helper';
import { auth } from '@/lib/firebase/config';

const API_BASE = '/api/offers';

async function authedFetch(path: string, init: RequestInit = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error('User must be authenticated');
  const token = await getIdToken(user, true);
  if (!token) throw new Error('Failed to get authentication token');

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/17040e56-eeab-425b-acb7-47343bdc73b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/offers/api.ts:authedFetch',message:'Fetch entry',data:{path,method:init.method || 'GET',hasToken:!!token},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init.headers || {}),
      },
    });
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/17040e56-eeab-425b-acb7-47343bdc73b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/offers/api.ts:authedFetch',message:'Fetch completed',data:{status:res.status,statusText:res.statusText,ok:res.ok,contentType:res.headers.get('content-type')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
  } catch (fetchError: any) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/17040e56-eeab-425b-acb7-47343bdc73b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/offers/api.ts:authedFetch',message:'Fetch failed',data:{errorName:fetchError?.name,errorMessage:fetchError?.message,errorType:typeof fetchError,isNetworkError:fetchError?.message?.includes('fetch') || fetchError?.message?.includes('network') || fetchError?.name === 'TypeError'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    throw fetchError;
  }

  let data: any;
  try {
    data = await res.json();
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/17040e56-eeab-425b-acb7-47343bdc73b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/offers/api.ts:authedFetch',message:'JSON parsed',data:{hasError:!!data?.error,hasMessage:!!data?.message,hasCode:!!data?.code},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
  } catch (parseError: any) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/17040e56-eeab-425b-acb7-47343bdc73b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/offers/api.ts:authedFetch',message:'JSON parse failed',data:{parseError:parseError?.message,status:res.status,contentType:res.headers.get('content-type')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    data = {};
  }
  if (!res.ok) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/17040e56-eeab-425b-acb7-47343bdc73b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/offers/api.ts:authedFetch',message:'Response not ok',data:{status:res.status,statusText:res.statusText,error:data?.error,message:data?.message,code:data?.code},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    const err: any = new Error(data?.error || data?.message || 'Request failed');
    err.code = data?.code;
    err.data = data;
    throw err;
  }
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/17040e56-eeab-425b-acb7-47343bdc73b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/offers/api.ts:authedFetch',message:'Success',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  return data;
}

export async function createOffer(
  listingId: string,
  amount: number,
  note?: string,
  preferredPaymentMethod?: 'card' | 'ach_debit' | 'wire',
  quantity?: number
) {
  return authedFetch(`${API_BASE}/create`, {
    method: 'POST',
    body: JSON.stringify({ listingId, amount, note, preferredPaymentMethod, quantity }),
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

