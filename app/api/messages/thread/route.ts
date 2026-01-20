/**
 * POST /api/messages/thread
 *
 * Hardened thread creation:
 * - buyerId is derived from the Firebase ID token (never trusted from client)
 * - validates listingId exists and listing.sellerId matches provided sellerId
 * - idempotent: returns existing thread if already created
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { Timestamp } from 'firebase-admin/firestore';

function json(body: any, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  });
}

export async function POST(request: Request) {
  try {
    let auth: ReturnType<typeof getAdminAuth>;
    let db: ReturnType<typeof getAdminDb>;
    try {
      auth = getAdminAuth();
      db = getAdminDb();
    } catch (e: any) {
      return json(
        {
          ok: false,
          error: 'Server not configured',
          code: e?.code || 'FIREBASE_ADMIN_INIT_FAILED',
          message: e?.message || 'Failed to initialize Firebase Admin SDK',
          missing: e?.missing || undefined,
        },
        { status: 503 }
      );
    }

    // Rate limiting (durable in prod; see lib/rate-limit.ts)
    const rateLimitCheck = rateLimitMiddleware(RATE_LIMITS.messages);
    const rateLimitResult = await rateLimitCheck(request as any);
    if (!rateLimitResult.allowed) {
      return json(rateLimitResult.body, {
        status: rateLimitResult.status,
        headers: { 'Retry-After': rateLimitResult.body.retryAfter?.toString() || '60' },
      });
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    const token = authHeader.slice('Bearer '.length);

    let decoded: any;
    try {
      decoded = await auth.verifyIdToken(token);
    } catch {
      return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const buyerId = decoded?.uid as string | undefined;
    if (!buyerId) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const listingId = typeof body?.listingId === 'string' ? body.listingId : '';
    const sellerId = typeof body?.sellerId === 'string' ? body.sellerId : '';

    if (!listingId || !sellerId) {
      return json({ ok: false, error: 'listingId and sellerId are required' }, { status: 400 });
    }

    // Validate listing exists and relationship is correct (prevents spoofed sellerId)
    const listingDoc = await db.collection('listings').doc(listingId).get();
    if (!listingDoc.exists) return json({ ok: false, error: 'Listing not found' }, { status: 404 });
    const listing = listingDoc.data() as any;
    const canonicalSellerId = String(listing?.sellerId || '');
    if (!canonicalSellerId || canonicalSellerId !== sellerId) {
      return json(
        {
          ok: false,
          error: 'Invalid listing/seller relationship',
          code: 'LISTING_SELLER_MISMATCH',
        },
        { status: 400 }
      );
    }

    // Idempotency: return existing thread if present
    const existing = await db
      .collection('messageThreads')
      .where('listingId', '==', listingId)
      .where('buyerId', '==', buyerId)
      .where('sellerId', '==', sellerId)
      .limit(1)
      .get();

    if (!existing.empty) {
      return json({ ok: true, threadId: existing.docs[0].id, created: false });
    }

    const now = Timestamp.now();
    const threadData = {
      listingId,
      buyerId,
      sellerId,
      createdAt: now,
      updatedAt: now,
      buyerUnreadCount: 0,
      sellerUnreadCount: 0,
      flagged: false,
      violationCount: 0,
      archived: false,
    };

    const ref = await db.collection('messageThreads').add(threadData);
    return json({ ok: true, threadId: ref.id, created: true });
  } catch (error: any) {
    console.error('Error creating message thread:', error);
    return json({ ok: false, error: 'Failed to create thread', message: error?.message }, { status: 500 });
  }
}

