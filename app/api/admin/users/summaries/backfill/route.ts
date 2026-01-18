/**
 * POST /api/admin/users/summaries/backfill
 *
 * Admin-only paginated backfill to create/update `userSummaries/{uid}`.
 * This is intentionally batched + cursor-based to avoid timeouts.
 */
import { z } from 'zod';
import { createAuditLog } from '@/lib/audit/logger';
import { buildUserSummary } from '@/lib/admin/userSummary';
import { requireAdmin, requireRateLimit, json, getRequestMeta } from '@/app/api/admin/_util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(), // last processed uid
});

export async function POST(request: Request) {
  const rate = await requireRateLimit(request);
  if (!rate.ok) return rate.response;

  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;
  const { actorUid, auth, db } = admin.ctx;
  const meta = getRequestMeta(request);

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return json({ ok: false, error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });

  const limit = Math.max(1, Math.min(100, parsed.data.limit ?? 25));
  const cursorUid = parsed.data.cursor ? String(parsed.data.cursor).trim() : '';

  try {
    let q: FirebaseFirestore.Query = db.collection('users').orderBy('createdAt', 'desc').limit(limit);
    if (cursorUid) {
      const cursorDoc = await db.collection('users').doc(cursorUid).get();
      if (cursorDoc.exists) q = q.startAfter(cursorDoc);
    }

    const snap = await q.get();
    if (snap.empty) {
      await createAuditLog(db as any, {
        actorUid,
        actorRole: 'admin',
        actionType: 'admin_user_summaries_backfill',
        source: 'admin_ui',
        metadata: { scanned: 0, updated: 0, cursor: cursorUid || null, ip: meta.ip, userAgent: meta.userAgent },
      });
      return json({ ok: true, updated: 0, nextCursor: null });
    }

    let updated = 0;
    const batch = db.batch();
    for (const doc of snap.docs) {
      const userDoc = doc.data() as any;
      let authUser: any = null;
      try {
        authUser = await auth.getUser(doc.id);
      } catch {
        authUser = null;
      }

      const summary = buildUserSummary({ uid: doc.id, authUser, userDoc });
      const ref = db.collection('userSummaries').doc(doc.id);
      batch.set(ref, summary as any, { merge: true });
      updated++;
    }

    await batch.commit();
    const nextCursor = snap.docs[snap.docs.length - 1]?.id || null;

    await createAuditLog(db as any, {
      actorUid,
      actorRole: 'admin',
      actionType: 'admin_user_summaries_backfill',
      source: 'admin_ui',
      metadata: { scanned: snap.size, updated, nextCursor, ip: meta.ip, userAgent: meta.userAgent },
    });

    return json({ ok: true, updated, nextCursor });
  } catch (e: any) {
    return json({ ok: false, error: 'Backfill failed', message: e?.message || String(e) }, { status: 500 });
  }
}

