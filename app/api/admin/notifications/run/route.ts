/**
 * POST /api/admin/notifications/run
 *
 * Admin-only: manually runs notification processors (events → jobs → sends).
 * Useful for verifying environments where scheduled functions are delayed/unavailable.
 *
 * IMPORTANT:
 * - Does not change notification semantics.
 * - It just triggers the same processing logic on-demand.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { requireAdmin, requireRateLimit, json } from '@/app/api/admin/_util';
import { processEventDoc } from '@/lib/notifications/processEvent';
import { renderEmail, validatePayload } from '@/lib/email';
import { sendEmailHtml } from '@/lib/email/sender';
import { assertInt32 } from '@/lib/debug/int32Tripwire';
import { safeTransactionSet, safeSet } from '@/lib/firebase/safeFirestore';

const bodySchema = z.object({
  kind: z.enum(['events', 'email', 'all']).default('all'),
  limit: z.number().int().min(1).max(100).default(30),
});

const MAX_ATTEMPTS = 5;
const EVENT_LOCK_MS = 2 * 60_000;

function backoffMs(attempt: number): number {
  const table = [0, 30_000, 120_000, 600_000, 1_800_000];
  return table[Math.min(attempt, table.length - 1)];
}

export async function POST(request: Request) {
  const rate = await requireRateLimit(request);
  if (!rate.ok) return rate.response;

  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return json({ ok: false, error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });

  const { db } = admin.ctx;
  const kind = parsed.data.kind;
  const limit = parsed.data.limit;

  const out: any = {
    ok: true,
    kind,
    limit,
    events: { scanned: 0, processed: 0, failed: 0, skipped: 0 },
    email: { scanned: 0, sent: 0, failed: 0, skipped: 0, requeued: 0 },
  };

  // 1) Process pending events → enqueue jobs
  if (kind === 'events' || kind === 'all') {
    // Clamp limit to >= 1 to prevent -1/NaN/undefined from causing int32 serialization errors
    const { safePositiveInt } = await import('@/lib/firebase/safeQueryInts');
    const safeLimit = safePositiveInt(limit, 50);
    // Tripwire: catch invalid limit before Firestore query
    assertInt32(safeLimit, 'Firestore.limit');
    const snap = await db.collection('events').where('status', '==', 'pending').orderBy('createdAt', 'asc').limit(safeLimit).get();
    out.events.scanned = snap.size;

    for (const docSnap of snap.docs) {
      const ref = docSnap.ref;
      const eventId = docSnap.id;

      let claimedData: any = null;
      try {
        await db.runTransaction(async (tx) => {
          const curSnap = await tx.get(ref);
          if (!curSnap.exists) return;
          const cur = curSnap.data() as any;
          if (cur.status !== 'pending') return;
          const attempts = Number(cur.processing?.attempts || 0);
          if (attempts >= MAX_ATTEMPTS) {
            safeTransactionSet(tx, ref, { status: 'failed', processing: { ...(cur.processing || {}), error: 'Max attempts reached' } }, { merge: true });
            return;
          }
          const lastAttemptAt = cur.processing?.lastAttemptAt?.toDate?.() as Date | undefined;
          if (lastAttemptAt && Date.now() - lastAttemptAt.getTime() < EVENT_LOCK_MS) return;

          safeTransactionSet(
            tx,
            ref,
            { processing: { attempts: attempts + 1, lastAttemptAt: Timestamp.now(), error: cur.processing?.error || null } },
            { merge: true }
          );
          claimedData = { ...cur, id: cur.id || eventId };
        });
      } catch {
        out.events.failed++;
        continue;
      }

      if (!claimedData) {
        out.events.skipped++;
        continue;
      }

      try {
        const res = await processEventDoc({ db, eventRef: ref as any, eventData: claimedData });
        if (res.ok) out.events.processed++;
        else out.events.failed++;
      } catch {
        out.events.failed++;
      }
    }
  }

  // 2) Dispatch queued emailJobs → send via configured provider (SendGrid)
  if (kind === 'email' || kind === 'all') {
    // Clamp limit to >= 1 to prevent -1/NaN/undefined from causing int32 serialization errors
    const { safePositiveInt: safePositiveIntEmail } = await import('@/lib/firebase/safeQueryInts');
    const emailLimit = safePositiveIntEmail(limit, 50);
    assertInt32(emailLimit, 'Firestore.emailJobs.limit');
    const snap = await db.collection('emailJobs').where('status', '==', 'queued').orderBy('createdAt', 'asc').limit(emailLimit).get();
    out.email.scanned = snap.size;

    for (const jobSnap of snap.docs) {
      const ref = jobSnap.ref;
      const jobId = jobSnap.id;

      let claimed: any = null;
      try {
        await db.runTransaction(async (tx) => {
          const curSnap = await tx.get(ref);
          if (!curSnap.exists) return;
          const cur = curSnap.data() as any;
          if (cur.status !== 'queued') return;
          const attempts = Number(cur.attempts || 0);
          if (attempts >= MAX_ATTEMPTS) {
            safeTransactionSet(tx, ref, { status: 'failed', error: 'Max attempts reached' }, { merge: true });
            return;
          }
          const deliverAfterAt = cur.deliverAfterAt?.toDate?.() as Date | undefined;
          if (deliverAfterAt && deliverAfterAt.getTime() > Date.now()) return;
          const lastAttemptAt = cur.lastAttemptAt?.toDate?.() as Date | undefined;
          if (lastAttemptAt && Date.now() - lastAttemptAt.getTime() < backoffMs(attempts)) return;

          safeTransactionSet(
            tx,
            ref,
            { status: 'processing', attempts: attempts + 1, lastAttemptAt: Timestamp.now() },
            { merge: true }
          );
          claimed = { id: jobId, ...cur, attempts: attempts + 1 };
        });
      } catch {
        out.email.failed++;
        continue;
      }

      if (!claimed) {
        out.email.skipped++;
        continue;
      }

      try {
        const template = String(claimed.template || '');
        const payload = claimed.templatePayload;
        const toEmail = String(claimed.toEmail || '');
        if (!toEmail || !toEmail.includes('@')) {
          await safeSet(ref, { status: 'failed', error: 'Missing/invalid toEmail' }, { merge: true });
          out.email.failed++;
          continue;
        }

        const validated = validatePayload(template as any, payload);
        if (!validated.ok) {
          await safeSet(ref, { status: 'failed', error: 'Invalid template payload' }, { merge: true });
          out.email.failed++;
          continue;
        }

        const rendered = renderEmail(template as any, validated.data);
        const result = await sendEmailHtml(toEmail, rendered.subject, rendered.html);
        if (!result.success) {
          await safeSet(ref, { status: 'queued', error: result.error || 'Send failed' }, { merge: true });
          out.email.requeued++;
          continue;
        }

        await safeSet(ref, { status: 'sent', messageId: result.messageId || null, error: FieldValue.delete() }, { merge: true });
        out.email.sent++;
      } catch (e: any) {
        try {
          await safeSet(ref, { status: 'queued', error: String(e?.message || e) }, { merge: true });
        } catch (writeErr: any) {
          console.warn('[admin/notifications/run] failed to requeue email job', { jobId, writeErr: String(writeErr?.message || writeErr) });
        }
        out.email.requeued++;
      }
    }
  }

  return json(out);
}

