/**
 * POST /api/offers/[offerId]/withdraw
 *
 * Buyer withdraws an offer (only if open/countered and not expired).
 */

import { z } from 'zod';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { createAuditLog } from '@/lib/audit/logger';
import { json, requireAuth, requireRateLimit } from '../../_util';

const withdrawSchema = z.object({
  note: z.string().max(500).optional(),
});

export async function POST(request: Request, ctx: { params: { offerId: string } }) {
  const rate = await requireRateLimit(request);
  if (!rate.ok) return rate.response;

  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;
  const buyerId = auth.decoded.uid;

  let body: any = {};
  try {
    body = await request.json().catch(() => ({}));
  } catch {
    body = {};
  }
  const parsed = withdrawSchema.safeParse(body);
  if (!parsed.success) return json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });

  const note = parsed.data.note;
  const offerId = ctx.params.offerId;
  const db = getAdminDb();
  const offerRef = db.collection('offers').doc(offerId);

  try {
    const now = Timestamp.now();

    const result = await db.runTransaction(async (tx) => {
      const offerSnap = await tx.get(offerRef);
      if (!offerSnap.exists) return { ok: false as const, status: 404, body: { error: 'Offer not found' } };
      const offer = offerSnap.data() as any;

      if (offer.buyerId !== buyerId) return { ok: false as const, status: 403, body: { error: 'Forbidden' } };

      // Enforce expiry
      const expiresAt: any = offer.expiresAt;
      if ((offer.status === 'open' || offer.status === 'countered') && expiresAt?.toMillis && expiresAt.toMillis() < now.toMillis()) {
        tx.update(offerRef, {
          status: 'expired',
          lastActorRole: 'system',
          updatedAt: now,
          history: [
            ...(offer.history || []),
            { type: 'expire', actorId: 'system', actorRole: 'system', createdAt: now },
          ],
        });
        return { ok: false as const, status: 409, body: { error: 'Offer has expired' } };
      }

      if (offer.status !== 'open' && offer.status !== 'countered') {
        return { ok: false as const, status: 400, body: { error: `Offer cannot be withdrawn from status ${offer.status}` } };
      }

      tx.update(offerRef, {
        status: 'withdrawn',
        lastActorRole: 'buyer',
        updatedAt: now,
        history: [
          ...(offer.history || []),
          { type: 'withdraw', actorId: buyerId, actorRole: 'buyer', note: note || undefined, createdAt: now },
        ],
      });

      return { ok: true as const, listingId: offer.listingId };
    });

    if (!result.ok) return json(result.body, { status: result.status });

    await createAuditLog(db, {
      actorUid: buyerId,
      actorRole: 'buyer',
      actionType: 'offer_withdrawn',
      listingId: result.listingId,
      metadata: { offerId, note: note || undefined },
      source: 'buyer_ui',
    });

    return json({ ok: true });
  } catch (error: any) {
    return json({ error: 'Failed to withdraw offer', message: error?.message || 'Unknown error' }, { status: 500 });
  }
}

