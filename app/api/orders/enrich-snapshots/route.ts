/**
 * POST /api/orders/enrich-snapshots
 *
 * Best-effort migration endpoint for legacy orders missing:
 * - order.listingSnapshot
 * - order.sellerSnapshot
 *
 * Security:
 * - Requires Firebase auth
 * - Caller must be buyer or seller on the order
 *
 * This endpoint is intentionally optional; it should never block page load.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';

function json(body: any, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  });
}

const schema = z.object({
  orderIds: z.array(z.string().min(1).max(200)).min(1).max(20),
});

export async function POST(request: Request) {
  // Rate limiting (before auth to reduce abuse)
  const rateLimitCheck = rateLimitMiddleware(RATE_LIMITS.default);
  const rateLimitResult = await rateLimitCheck(request as any);
  if (!rateLimitResult.allowed) {
    return json(rateLimitResult.body, {
      status: rateLimitResult.status,
      headers: { 'Retry-After': rateLimitResult.body.retryAfter.toString() },
    });
  }

  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;
    if (!uid) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return json({ ok: false, error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const db = getAdminDb();
    const orderIds = Array.from(new Set(parsed.data.orderIds.map((x) => String(x).trim()).filter(Boolean)));
    const now = Timestamp.now();

    let enriched = 0;
    let skipped = 0;
    const errors: Array<{ orderId: string; error: string }> = [];

    for (const orderId of orderIds) {
      try {
        const orderRef = db.collection('orders').doc(orderId);
        const orderSnap = await orderRef.get();
        if (!orderSnap.exists) {
          skipped++;
          continue;
        }
        const o = orderSnap.data() as any;
        if (o?.buyerId !== uid && o?.sellerId !== uid) {
          skipped++;
          continue;
        }

        const hasListingSnap = typeof o?.listingSnapshot?.title === 'string' && o.listingSnapshot.title.trim();
        const hasSellerSnap = typeof o?.sellerSnapshot?.displayName === 'string' && o.sellerSnapshot.displayName.trim();
        if (hasListingSnap && hasSellerSnap) {
          skipped++;
          continue;
        }

        const listingId = typeof o?.listingId === 'string' ? o.listingId : null;
        if (!listingId) {
          skipped++;
          continue;
        }

        const listingSnap = await db.collection('listings').doc(listingId).get();
        if (!listingSnap.exists) {
          skipped++;
          continue;
        }
        const l = listingSnap.data() as any;

        const photos = Array.isArray(l?.photos) ? l.photos : [];
        const sortedPhotos = photos.length
          ? [...photos].sort((a: any, b: any) => Number(a?.sortOrder || 0) - Number(b?.sortOrder || 0))
          : [];
        const coverPhotoUrl =
          (sortedPhotos.find((p: any) => typeof p?.url === 'string' && p.url.trim())?.url as string | undefined) ||
          (Array.isArray(l?.images) ? (l.images.find((u: any) => typeof u === 'string' && u.trim()) as string | undefined) : undefined);

        const city = l?.location?.city ? String(l.location.city) : '';
        const state = l?.location?.state ? String(l.location.state) : '';
        const locationLabel = city && state ? `${city}, ${state}` : state || '';

        const sellerDisplayName =
          String(l?.sellerSnapshot?.displayName || '').trim() ||
          String(l?.sellerSnapshot?.name || '').trim() ||
          'Seller';
        const sellerPhotoURL =
          typeof l?.sellerSnapshot?.photoURL === 'string' && l.sellerSnapshot.photoURL.trim()
            ? String(l.sellerSnapshot.photoURL)
            : undefined;

        await orderRef.set(
          {
            listingSnapshot: {
              listingId,
              title: String(l?.title || 'Listing'),
              type: l?.type ? String(l.type) : undefined,
              category: l?.category ? String(l.category) : undefined,
              ...(coverPhotoUrl ? { coverPhotoUrl: String(coverPhotoUrl) } : {}),
              ...(locationLabel ? { locationLabel } : {}),
            },
            sellerSnapshot: {
              sellerId: String(l?.sellerId || o?.sellerId || ''),
              displayName: sellerDisplayName,
              ...(sellerPhotoURL ? { photoURL: sellerPhotoURL } : {}),
            },
            updatedAt: now,
          },
          { merge: true }
        );

        enriched++;
      } catch (e: any) {
        errors.push({ orderId, error: e?.message || String(e) });
      }
    }

    if (enriched > 0) {
      // eslint-disable-next-line no-console
      console.log('[orders enrich-snapshots] enriched', { uid, enriched, skipped, errors: errors.length });
    }

    return json({ ok: true, enriched, skipped, errors });
  } catch (e: any) {
    return json({ ok: false, error: 'Failed to enrich snapshots', message: e?.message || String(e) }, { status: 500 });
  }
}

