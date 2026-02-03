/**
 * POST /api/admin/reviews/[orderId]/moderate
 *
 * Admin-only: hide/unhide/flag a review with reason.
 */
import { requireAdmin, requireRateLimit, json } from '@/app/api/admin/_util';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { applyReviewDelta, initReviewStats } from '@/lib/reviews/aggregates';
import { createAuditLog } from '@/lib/audit/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, ctx: { params: { orderId: string } }) {
  const rate = await requireRateLimit(request);
  if (!rate.ok) return rate.response;

  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;
  const { db, actorUid } = admin.ctx;

  const orderId = String(ctx?.params?.orderId || '').trim();
  if (!orderId) return json({ ok: false, error: 'Missing orderId' }, { status: 400 });

  let body: any = null;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const nextStatus = String(body?.status || '').trim();
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : null;
  if (!['published', 'hidden', 'flagged'].includes(nextStatus)) {
    return json({ ok: false, error: 'Invalid status' }, { status: 400 });
  }

  const now = Timestamp.now();
  const reviewRef = (db as unknown as ReturnType<typeof getFirestore>).collection('reviews').doc(orderId);

  try {
    await (db as unknown as ReturnType<typeof getFirestore>).runTransaction(async (tx) => {
      const snap = await tx.get(reviewRef);
      if (!(snap as any).exists) throw new Error('Review not found');
      const review = (snap as any).data() as any;
      const prevStatus = String(review?.status || 'published');

      if (prevStatus === nextStatus) return;

      const sellerId = String(review?.sellerId || '');
      const rating = Number(review?.rating || 0);

      // Adjust aggregates if transitioning to/from published.
      if (sellerId && rating >= 1 && rating <= 5) {
        const userRef = (db as any).collection('users').doc(sellerId);
        const publicRef = (db as any).collection('publicProfiles').doc(sellerId);
        const [userSnap, publicSnap] = await Promise.all([tx.get(userRef), tx.get(publicRef)]);
        const userStats = (userSnap as any)?.exists ? ((userSnap as any).data() as any)?.sellerReviewStats || initReviewStats() : initReviewStats();
        const publicStats = (publicSnap as any)?.exists ? ((publicSnap as any).data() as any)?.sellerReviewStats || initReviewStats() : initReviewStats();

        if (prevStatus === 'published' && nextStatus !== 'published') {
          const nextUser = applyReviewDelta(userStats, rating, -1);
          const nextPublic = applyReviewDelta(publicStats, rating, -1);
          tx.set(userRef, { sellerReviewStats: nextUser, updatedAt: now }, { merge: true });
          tx.set(publicRef, { sellerReviewStats: nextPublic, updatedAt: now }, { merge: true });
        }
        if (prevStatus !== 'published' && nextStatus === 'published') {
          const nextUser = applyReviewDelta(userStats, rating, 1);
          const nextPublic = applyReviewDelta(publicStats, rating, 1);
          tx.set(userRef, { sellerReviewStats: nextUser, updatedAt: now }, { merge: true });
          tx.set(publicRef, { sellerReviewStats: nextPublic, updatedAt: now }, { merge: true });
        }
      }

      tx.set(
        reviewRef,
        {
          status: nextStatus,
          moderatedAt: now,
          moderatedBy: actorUid,
          moderationReason: reason || null,
          updatedAt: now,
        },
        { merge: true }
      );
    });

    await createAuditLog(db as any, {
      actorUid,
      actorRole: 'admin',
      actionType: 'review_moderated',
      orderId,
      metadata: { status: nextStatus, reason: reason || null },
      source: 'admin_ui',
    });

    return json({ ok: true });
  } catch (e: any) {
    if (String(e?.message || '') === 'Review not found') return json({ ok: false, error: 'Review not found' }, { status: 404 });
    return json({ ok: false, error: e?.message || 'Failed to moderate review' }, { status: 500 });
  }
}
