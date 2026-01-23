/**
 * POST /api/admin/support/tickets/[ticketId]/ai-draft
 *
 * Admin-only endpoint to generate AI draft responses for support tickets.
 * Drafts are stored on the ticket document and can be edited before sending.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { requireAdmin, requireRateLimit, json } from '@/app/api/admin/_util';
import { generateAIAdminDraft, isAIAdminDraftEnabled } from '@/lib/admin/ai-summary';
import { getAdminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(request: Request, ctx: { params: { ticketId: string } }) {
  const rate = await requireRateLimit(request);
  if (!rate.ok) return rate.response;

  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;
  const { db } = admin.ctx;

  // Feature flag check
  if (!isAIAdminDraftEnabled()) {
    return json({ 
      ok: false, 
      error: 'AI admin draft feature is disabled',
      message: 'To enable this feature, set AI_ADMIN_DRAFT_ENABLED=true in your environment variables. Also ensure OPENAI_API_KEY is configured.'
    }, { status: 403 });
  }

  const ticketId = String(ctx?.params?.ticketId || '').trim();
  if (!ticketId) return json({ ok: false, error: 'Missing ticketId' }, { status: 400 });

  try {
    const ticketRef = db.collection('supportTickets').doc(ticketId);
    const ticketSnap = await ticketRef.get();

    if (!ticketSnap.exists) {
      return json({ ok: false, error: 'Ticket not found' }, { status: 404 });
    }

    const ticketData = ticketSnap.data() as any;

    // Check for existing draft and its freshness (e.g., 24 hours)
    const now = new Date();
    const draftGeneratedAt = ticketData.aiDraftGeneratedAt?.toDate
      ? ticketData.aiDraftGeneratedAt.toDate()
      : ticketData.aiDraftGeneratedAt
      ? new Date(ticketData.aiDraftGeneratedAt)
      : null;
    
    const isFresh = draftGeneratedAt && (now.getTime() - draftGeneratedAt.getTime()) < (24 * 60 * 60 * 1000); // 24 hours

    // If draft exists and is fresh, return it
    if (ticketData.aiDraftResponse && isFresh) {
      return json({
        ok: true,
        draft: ticketData.aiDraftResponse,
        model: ticketData.aiDraftModel || 'gpt-4o-mini',
        generatedAt: draftGeneratedAt?.toISOString(),
        cached: true,
      });
    }

    // Fetch related data for better context
    const context: Record<string, any> = {};

    // Fetch related order if available
    if (ticketData.orderId) {
      try {
        const orderSnap = await db.collection('orders').doc(ticketData.orderId).get();
        if (orderSnap.exists) {
          context.order = orderSnap.data();
          context.orderId = ticketData.orderId;
        }
      } catch (e) {
        // Ignore errors fetching order
      }
    }

    // Fetch related listing if available
    if (ticketData.listingId) {
      try {
        const listingSnap = await db.collection('listings').doc(ticketData.listingId).get();
        if (listingSnap.exists) {
          context.listing = listingSnap.data();
          context.listingId = ticketData.listingId;
        }
      } catch (e) {
        // Ignore errors fetching listing
      }
    }

    // Fetch recent messages for context
    try {
      const messagesSnap = await ticketRef.collection('messages').orderBy('createdAt', 'desc').limit(5).get();
      if (!messagesSnap.empty) {
        context.messages = messagesSnap.docs.map(doc => ({
          ...doc.data(),
          id: doc.id,
        }));
      }
    } catch (e) {
      // Ignore errors fetching messages
    }

    // Generate new draft
    const draft = await generateAIAdminDraft(ticketData, context);

    if (!draft) {
      return json({ ok: false, error: 'Failed to generate draft' }, { status: 500 });
    }

    // Store the new draft in Firestore
    await ticketRef.update({
      aiDraftResponse: draft,
      aiDraftGeneratedAt: FieldValue.serverTimestamp(),
      aiDraftModel: 'gpt-4o-mini',
    });

    return json({
      ok: true,
      draft,
      model: 'gpt-4o-mini',
      generatedAt: new Date().toISOString(),
      cached: false,
    });
  } catch (e: any) {
    console.error(`Failed to generate AI draft for ticket ${ticketId}:`, e);
    return json(
      { ok: false, error: 'Failed to generate AI draft', message: e?.message || String(e) },
      { status: 500 }
    );
  }
}
