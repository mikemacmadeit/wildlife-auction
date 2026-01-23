/**
 * GET /api/admin/support/tickets/[ticketId]
 *
 * Admin-only: get full ticket details including message thread.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { requireAdmin, requireRateLimit, json } from '@/app/api/admin/_util';

function toIsoSafe(v: any): string | null {
  try {
    if (!v) return null;
    if (typeof v === 'string') return v;
    if (typeof v?.toDate === 'function') {
      const d = v.toDate();
      return d instanceof Date ? d.toISOString() : null;
    }
    if (typeof v?.seconds === 'number') return new Date(v.seconds * 1000).toISOString();
    if (v instanceof Date) return v.toISOString();
    return null;
  } catch {
    return null;
  }
}

export async function GET(request: Request, ctx: { params: { ticketId: string } }) {
  const rl = await requireRateLimit(request);
  if (!rl.ok) return rl.response;

  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  const ticketId = String(ctx?.params?.ticketId || '').trim();
  if (!ticketId) return json({ ok: false, error: 'Missing ticketId' }, { status: 400 });

  const { db } = admin.ctx;

  try {
    const ticketRef = db.collection('supportTickets').doc(ticketId);
    const ticketSnap = await ticketRef.get();

    if (!ticketSnap.exists) {
      return json({ ok: false, error: 'Ticket not found' }, { status: 404 });
    }

    const ticketData: any = ticketSnap.data();

    // Fetch messages
    const messagesSnap = await ticketRef.collection('messages').orderBy('createdAt', 'asc').get();
    const messages = messagesSnap.docs.map((doc) => {
      const msgData: any = doc.data();
      return {
        id: doc.id,
        kind: msgData.kind || 'user',
        by: msgData.by || null,
        body: msgData.body || '',
        createdAt: toIsoSafe(msgData.createdAt),
      };
    });

    // Fetch assigned admin info if assigned
    let assignedAdmin = null;
    if (ticketData.assignedTo) {
      try {
        const adminSnap = await db.collection('users').doc(ticketData.assignedTo).get();
        if (adminSnap.exists) {
          const adminData: any = adminSnap.data();
          assignedAdmin = {
            uid: ticketData.assignedTo,
            displayName: adminData.displayName || null,
            email: adminData.email || null,
          };
        }
      } catch {
        // Ignore errors fetching admin info
      }
    }

    return json(
      {
        ok: true,
        ticket: {
          ticketId: ticketSnap.id,
          status: ticketData.status || 'open',
          priority: ticketData.priority || 'normal',
          category: ticketData.category || 'other',
          source: ticketData.source || 'contact_form',
          name: ticketData.name || '',
          email: ticketData.email || '',
          subject: ticketData.subject || '',
          message: ticketData.message || '',
          userId: ticketData.userId || null,
          listingId: ticketData.listingId || null,
          orderId: ticketData.orderId || null,
          assignedTo: ticketData.assignedTo || null,
          assignedAdmin,
          adminNote: ticketData.adminNote || null,
          createdAt: toIsoSafe(ticketData.createdAt),
          updatedAt: toIsoSafe(ticketData.updatedAt),
          lastPublicReplyAt: toIsoSafe(ticketData.lastPublicReplyAt),
          adminLastRepliedAt: toIsoSafe(ticketData.adminLastRepliedAt),
          adminLastRepliedBy: ticketData.adminLastRepliedBy || null,
          resolvedAt: toIsoSafe(ticketData.resolvedAt),
          resolvedBy: ticketData.resolvedBy || null,
        },
        messages,
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error(`Failed to fetch ticket ${ticketId}:`, e);
    return json({ ok: false, error: 'Failed to fetch ticket', message: e?.message || String(e) }, { status: 500 });
  }
}
