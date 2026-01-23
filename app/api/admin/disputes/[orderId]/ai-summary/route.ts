/**
 * POST /api/admin/disputes/[orderId]/ai-summary
 * 
 * Admin-only endpoint to generate AI summaries for disputes.
 * 
 * Body:
 * {
 *   forceRegenerate?: boolean
 * }
 */

import { z } from 'zod';
import { requireAdmin, requireRateLimit, json } from '@/app/api/admin/_util';
import { generateAIDisputeSummary, isAIDisputeSummaryEnabled } from '@/lib/admin/ai-summary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  forceRegenerate: z.boolean().optional().default(false),
});

export async function POST(
  request: Request,
  ctx: { params: { orderId: string } }
) {
  const rate = await requireRateLimit(request);
  if (!rate.ok) return rate.response;

  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;
  const { db } = admin.ctx;

  // Feature flag check
  if (!isAIDisputeSummaryEnabled()) {
    return json({ ok: false, error: 'AI dispute summary feature is disabled' }, { status: 403 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json().catch(() => ({})));
  } catch (e: any) {
    return json({ ok: false, error: 'Invalid request body', details: e?.errors }, { status: 400 });
  }

  const { forceRegenerate } = body;
  const orderId = ctx?.params?.orderId || '';

  if (!orderId) {
    return json({ ok: false, error: 'Missing orderId' }, { status: 400 });
  }

  try {
    // Fetch order data
    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return json({ ok: false, error: 'Order not found' }, { status: 404 });
    }

    const orderData = {
      ...orderDoc.data(),
      id: orderDoc.id,
    };

    // Check if order has a dispute
    const hasDispute = orderData.disputeStatus && 
      orderData.disputeStatus !== 'none' && 
      orderData.disputeStatus !== 'cancelled' &&
      !orderData.disputeStatus.startsWith('resolved_');

    if (!hasDispute) {
      return json({ ok: false, error: 'Order does not have an active dispute' }, { status: 400 });
    }

    // Check if summary already exists and is recent (unless force regenerate)
    if (!forceRegenerate) {
      const existingSummary = orderData.aiDisputeSummary;
      const existingSummaryAt = orderData.aiDisputeReviewedAt;

      if (existingSummary && existingSummaryAt) {
        const summaryDate = existingSummaryAt.toDate
          ? existingSummaryAt.toDate()
          : new Date(existingSummaryAt);
        const ageInHours = (Date.now() - summaryDate.getTime()) / (1000 * 60 * 60);

        // If summary is less than 24 hours old, return it
        if (ageInHours < 24) {
          return json({
            ok: true,
            summary: existingSummary,
            facts: Array.isArray(orderData.aiDisputeFacts) ? orderData.aiDisputeFacts : [],
            model: orderData.aiDisputeModel || 'gpt-4o-mini',
            generatedAt: summaryDate.toISOString(),
            cached: true,
          });
        }
      }
    }

    // Fetch related entities for context
    const [listingDoc, buyerDoc, sellerDoc] = await Promise.all([
      orderData.listingId ? db.collection('listings').doc(orderData.listingId).get() : Promise.resolve(null),
      orderData.buyerId ? db.collection('users').doc(orderData.buyerId).get() : Promise.resolve(null),
      orderData.sellerId ? db.collection('users').doc(orderData.sellerId).get() : Promise.resolve(null),
    ]);

    // Enrich order data with related entities
    const enrichedOrderData = {
      ...orderData,
      listing: listingDoc?.exists ? listingDoc.data() : null,
      buyer: buyerDoc?.exists ? buyerDoc.data() : null,
      seller: sellerDoc?.exists ? sellerDoc.data() : null,
    };

    // Generate new summary
    const summaryResult = await generateAIDisputeSummary(enrichedOrderData);

    if (!summaryResult) {
      return json({ ok: false, error: 'Failed to generate dispute summary' }, { status: 500 });
    }

    // Store summary in Firestore
    const { FieldValue } = await import('firebase-admin/firestore');
    await orderRef.update({
      aiDisputeSummary: summaryResult.summary,
      aiDisputeFacts: summaryResult.facts,
      aiDisputeReviewedAt: FieldValue.serverTimestamp(),
      aiDisputeModel: summaryResult.model,
    });

    return json({
      ok: true,
      summary: summaryResult.summary,
      facts: summaryResult.facts,
      model: summaryResult.model,
      generatedAt: summaryResult.generatedAt.toISOString(),
      cached: false,
    });
  } catch (error: any) {
    console.error('[AI Dispute Summary API] Error:', error);
    return json(
      { ok: false, error: 'Failed to generate dispute summary', message: error?.message || String(error) },
      { status: 500 }
    );
  }
}
