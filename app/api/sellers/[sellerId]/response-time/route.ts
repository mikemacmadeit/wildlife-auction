/**
 * GET /api/sellers/[sellerId]/response-time
 *
 * Returns median seller response time (hours) from message data.
 * Public: no auth required (seller profile is public).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getAdminDb } from '@/lib/firebase/admin';

function json(body: any, init?: { status?: number }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

function median(nums: number[]): number | null {
  const arr = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (arr.length === 0) return null;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 === 0 ? (arr[mid - 1]! + arr[mid]!) / 2 : arr[mid]!;
}

function toDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (v?.toDate && typeof v.toDate === 'function') return v.toDate();
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ sellerId: string }> | { sellerId: string } }
) {
  const params = typeof (ctx.params as any)?.then === 'function'
    ? await (ctx.params as Promise<{ sellerId: string }>)
    : (ctx.params as { sellerId: string });
  const sellerId = String(params?.sellerId || '').trim();
  if (!sellerId) return json({ ok: false, error: 'Missing sellerId' }, { status: 400 });

  let db: ReturnType<typeof getAdminDb>;
  try {
    db = getAdminDb();
  } catch {
    return json({ ok: false, error: 'Server not configured' }, { status: 503 });
  }

  try {
    const threadsSnap = await db
      .collection('messageThreads')
      .where('sellerId', '==', sellerId)
      .limit(50)
      .get();

    const responseHours: number[] = [];

    for (const threadDoc of threadsSnap.docs) {
      const messagesSnap = await db
        .collection('messageThreads')
        .doc(threadDoc.id)
        .collection('messages')
        .orderBy('createdAt', 'asc')
        .limit(100)
        .get();

      const messages = messagesSnap.docs.map((d) => {
        const data = d.data() as any;
        return {
          senderId: String(data?.senderId ?? ''),
          createdAt: toDate(data?.createdAt),
        };
      }).filter((m) => m.createdAt);

      let lastBuyerSentAt: number | null = null;
      for (const msg of messages) {
        const ts = msg.createdAt!.getTime();
        const isSeller = msg.senderId === sellerId;
        if (isSeller && lastBuyerSentAt !== null) {
          const hours = (ts - lastBuyerSentAt) / (60 * 60 * 1000);
          if (hours >= 0 && hours <= 168) responseHours.push(hours); // cap 7 days
          lastBuyerSentAt = null;
        } else if (!isSeller) {
          lastBuyerSentAt = ts;
        }
      }
    }

    const medianHours = median(responseHours);
    return json({
      ok: true,
      medianHours: medianHours !== null ? Math.round(medianHours * 10) / 10 : null,
      sampleSize: responseHours.length,
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || 'Failed to compute response time' }, { status: 500 });
  }
}
