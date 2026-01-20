/**
 * POST /api/sellers/follow
 *
 * eBay-style follow system (Saved Sellers).
 * Server-authoritative transaction:
 * - users/{viewerUid}/following/{sellerId}
 * - users/{sellerId}/followers/{viewerUid}
 * - users/{sellerId}.sellerStats.followersCount (fast count)
 */

import { z } from 'zod';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';

function json(body: any, init?: { status?: number }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

const schema = z.object({
  sellerId: z.string().min(1).max(200),
  action: z.enum(['follow', 'unfollow']),
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return json({ ok: false, error: 'Invalid request', details: parsed.error.errors }, { status: 400 });
    }

    const { sellerId, action } = parsed.data;

    const auth = getAdminAuth();
    const db = getAdminDb();
    const token = authHeader.split('Bearer ')[1];
    const decoded = await auth.verifyIdToken(token);
    const viewerUid = decoded.uid;

    if (!viewerUid) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    if (sellerId === viewerUid) {
      return json({ ok: false, error: 'Cannot follow yourself', code: 'SELF_FOLLOW' }, { status: 400 });
    }

    const now = Timestamp.now();
    const followingRef = db.collection('users').doc(viewerUid).collection('following').doc(sellerId);
    const followerRef = db.collection('users').doc(sellerId).collection('followers').doc(viewerUid);
    const sellerUserRef = db.collection('users').doc(sellerId);
    const publicProfileRef = db.collection('publicProfiles').doc(sellerId);

    const out = await db.runTransaction(async (tx) => {
      const [followingSnap, sellerUserSnap, publicProfileSnap] = await Promise.all([
        tx.get(followingRef),
        tx.get(sellerUserRef),
        tx.get(publicProfileRef),
      ]);

      if (!sellerUserSnap.exists) {
        return { ok: false, status: 404, error: 'Seller not found', code: 'SELLER_NOT_FOUND' } as const;
      }

      const sellerUser = sellerUserSnap.data() as any;
      const pub = publicProfileSnap.exists ? (publicProfileSnap.data() as any) : null;

      const currentCountRaw = sellerUser?.sellerStats?.followersCount;
      const currentCount = typeof currentCountRaw === 'number' && Number.isFinite(currentCountRaw) ? currentCountRaw : 0;

      if (action === 'follow') {
        if (followingSnap.exists) {
          // Idempotent
          return { ok: true, changed: false, action: 'follow' as const };
        }

        const sellerDisplayName =
          String(pub?.displayName || sellerUser?.displayName || sellerUser?.profile?.businessName || sellerUser?.profile?.fullName || 'Seller').trim();
        const sellerPhotoURL = String(pub?.photoURL || sellerUser?.photoURL || '').trim() || null;
        const sellerUsername =
          String(pub?.username || sellerUser?.username || sellerUser?.profile?.username || '').trim();

        // Derived seller metrics (best-effort; keep zeros if unknown)
        const itemsSold = Math.max(
          Number(sellerUser?.verifiedTransactionsCount || 0) || 0,
          Number(sellerUser?.completedSalesCount || 0) || 0
        );

        tx.set(
          followingRef,
          {
            sellerId,
            followedAt: now,
            sellerUsername,
            sellerDisplayName,
            ...(sellerPhotoURL ? { sellerPhotoURL } : {}),
            ratingAverage: 0,
            ratingCount: 0,
            positivePercent: 0,
            itemsSold: Number.isFinite(itemsSold) ? itemsSold : 0,
          },
          { merge: true }
        );

        tx.set(
          followerRef,
          {
            followerId: viewerUid,
            followedAt: now,
          },
          { merge: true }
        );

        tx.set(
          sellerUserRef,
          {
            sellerStats: {
              ...(sellerUser?.sellerStats || {}),
              followersCount: currentCount + 1,
            },
            updatedAt: now,
          },
          { merge: true }
        );

        return { ok: true, changed: true, action: 'follow' as const };
      }

      // Unfollow
      if (!followingSnap.exists) {
        // Idempotent
        // Still ensure follower doc is deleted if it exists.
        tx.delete(followerRef);
        if (currentCount < 0) {
          tx.set(sellerUserRef, { sellerStats: { ...(sellerUser?.sellerStats || {}), followersCount: 0 }, updatedAt: now }, { merge: true });
        }
        return { ok: true, changed: false, action: 'unfollow' as const };
      }

      tx.delete(followingRef);
      tx.delete(followerRef);
      tx.set(
        sellerUserRef,
        {
          sellerStats: {
            ...(sellerUser?.sellerStats || {}),
            followersCount: Math.max(0, currentCount - 1),
          },
          updatedAt: now,
        },
        { merge: true }
      );

      return { ok: true, changed: true, action: 'unfollow' as const };
    });

    if ((out as any)?.ok === false) {
      return json({ ok: false, error: (out as any).error, code: (out as any).code }, { status: (out as any).status || 400 });
    }

    return json(out);
  } catch (e: any) {
    return json({ ok: false, error: 'Failed to update saved seller', message: e?.message || String(e) }, { status: 500 });
  }
}

