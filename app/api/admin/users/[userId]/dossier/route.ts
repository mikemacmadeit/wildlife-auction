/**
 * GET /api/admin/users/[userId]/dossier
 *
 * Admin-only "user dossier" for the admin user management system.
 * Returns: auth user (safe subset), Firestore user doc, userSummary, recent admin notes, recent audit logs.
 */
import { z } from 'zod';
import { requireAdmin, requireRateLimit, json } from '@/app/api/admin/_util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  notesLimit: z.string().optional(),
  auditLimit: z.string().optional(),
});

function tsToIso(v: any): string | null {
  if (!v) return null;
  if (typeof v.toDate === 'function') {
    const d = v.toDate();
    return d instanceof Date ? d.toISOString() : null;
  }
  if (v instanceof Date) return v.toISOString();
  if (typeof v?.seconds === 'number') return new Date(v.seconds * 1000).toISOString();
  return null;
}

export async function GET(request: Request, ctx: { params: { userId: string } }) {
  const rate = await requireRateLimit(request);
  if (!rate.ok) return rate.response;

  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;
  const { auth, db } = admin.ctx;

  const targetUid = String(ctx?.params?.userId || '').trim();
  if (!targetUid) return json({ ok: false, error: 'Missing userId' }, { status: 400 });

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    notesLimit: url.searchParams.get('notesLimit') || undefined,
    auditLimit: url.searchParams.get('auditLimit') || undefined,
  });
  if (!parsed.success) return json({ ok: false, error: 'Invalid query' }, { status: 400 });

  const notesLimit = Math.max(1, Math.min(50, Number(parsed.data.notesLimit || 20) || 20));
  const auditLimit = Math.max(1, Math.min(200, Number(parsed.data.auditLimit || 50) || 50));

  try {
    const [authRec, userDocSnap, summarySnap] = await Promise.all([
      auth.getUser(targetUid).catch(() => null),
      db.collection('users').doc(targetUid).get(),
      db.collection('userSummaries').doc(targetUid).get(),
    ]);

    const userDoc = userDocSnap.exists ? (userDocSnap.data() as any) : null;
    const summary = summarySnap.exists ? (summarySnap.data() as any) : null;

    const notesSnap = await db
      .collection('adminUserNotes')
      .doc(targetUid)
      .collection('notes')
      .orderBy('createdAt', 'desc')
      .limit(notesLimit)
      .get()
      .catch(() => null);

    const notes =
      notesSnap?.docs?.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          note: String(data.note || ''),
          createdAt: tsToIso(data.createdAt),
          createdBy: String(data.createdBy || ''),
        };
      }) || [];

    // Audit trail (requires composite index: targetUserId + createdAt desc).
    const auditSnap = await db
      .collection('auditLogs')
      .where('targetUserId', '==', targetUid)
      .orderBy('createdAt', 'desc')
      .limit(auditLimit)
      .get()
      .catch(() => null);

    const audits =
      auditSnap?.docs?.map((d) => {
        const data = d.data() as any;
        return {
          auditId: d.id,
          actionType: String(data.actionType || ''),
          actorUid: String(data.actorUid || ''),
          actorRole: String(data.actorRole || ''),
          createdAt: tsToIso(data.createdAt),
          beforeState: data.beforeState || null,
          afterState: data.afterState || null,
          metadata: data.metadata || null,
        };
      }) || [];

    return json({
      ok: true,
      authUser: authRec
        ? {
            uid: authRec.uid,
            email: authRec.email || null,
            displayName: authRec.displayName || null,
            phoneNumber: authRec.phoneNumber || null,
            disabled: !!authRec.disabled,
            emailVerified: !!authRec.emailVerified,
            createdAt: authRec.metadata?.creationTime || null,
            lastSignInAt: authRec.metadata?.lastSignInTime || null,
            customClaims: authRec.customClaims || null,
          }
        : null,
      userDoc,
      summary,
      notes,
      audits,
    });
  } catch (e: any) {
    return json({ ok: false, error: 'Failed to load dossier', message: e?.message || String(e) }, { status: 500 });
  }
}

