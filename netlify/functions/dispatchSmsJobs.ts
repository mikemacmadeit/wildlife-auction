/**
 * Netlify Scheduled Function: Dispatch SMS Jobs
 *
 * Sends queued smsJobs via Twilio (server-only).
 */

import { Handler, schedule } from '@netlify/functions';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '../../lib/firebase/admin';
import { logInfo, logWarn, logError } from '../../lib/monitoring/logger';
import { sendSmsTwilio } from '../../lib/sms/twilio';

const MAX_JOBS_PER_RUN = 50;
const MAX_ATTEMPTS = 5;

function deadLetterPayload(jobId: string, job: any, error: { code?: string; message: string }) {
  const safeSnapshot = {
    userId: job?.userId,
    toPhone: job?.toPhone,
    eventId: job?.eventId,
    attempts: Number(job?.attempts || 0),
    lastAttemptAt: job?.lastAttemptAt || null,
    createdAt: job?.createdAt || null,
  };
  return {
    jobId,
    kind: 'sms',
    createdAt: Timestamp.now(),
    userId: typeof job?.userId === 'string' ? job.userId : null,
    eventId: typeof job?.eventId === 'string' ? job.eventId : null,
    toPhone: typeof job?.toPhone === 'string' ? job.toPhone : null,
    attempts: Number(job?.attempts || 0),
    error: { code: error.code || null, message: error.message.slice(0, 2000) },
    snapshot: safeSnapshot,
    suppressed: false,
    manualRetryCount: 0,
    lastManualRetryAt: null,
  };
}

function backoffMs(attempt: number): number {
  const table = [0, 30_000, 120_000, 600_000, 1_800_000];
  return table[Math.min(attempt, table.length - 1)];
}

const baseHandler: Handler = async () => {
  const db = getAdminDb();
  const startedAt = Date.now();
  let scanned = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let requeued = 0;

  try {
    const snap = await db
      .collection('smsJobs')
      .where('status', '==', 'queued')
      .orderBy('createdAt', 'asc')
      .limit(MAX_JOBS_PER_RUN)
      .get();

    scanned = snap.size;
    if (snap.empty) return { statusCode: 200, body: JSON.stringify({ ok: true, scanned, sent, failed, skipped, requeued }) };

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
            tx.set(ref, { status: 'failed', error: 'Max attempts reached' }, { merge: true });
            tx.set(db.collection('smsJobDeadLetters').doc(jobId), deadLetterPayload(jobId, { ...cur, attempts }, { message: 'Max attempts reached' }), {
              merge: true,
            });
            return;
          }

          const deliverAfterAt = cur.deliverAfterAt?.toDate?.() as Date | undefined;
          if (deliverAfterAt && deliverAfterAt.getTime() > Date.now()) {
            skipped++;
            return;
          }

          const lastAttemptAt = cur.lastAttemptAt?.toDate?.() as Date | undefined;
          if (lastAttemptAt && Date.now() - lastAttemptAt.getTime() < backoffMs(attempts)) {
            skipped++;
            return;
          }

          tx.set(
            ref,
            {
              status: 'processing',
              attempts: attempts + 1,
              lastAttemptAt: Timestamp.now(),
            },
            { merge: true }
          );
          claimed = { id: jobId, ...cur, attempts: attempts + 1 };
        });
      } catch (e: any) {
        logWarn('dispatchSmsJobs: claim failed', { jobId, error: String(e?.message || e) });
        continue;
      }

      if (!claimed) continue;

      try {
        const toPhone = String(claimed.toPhone || '');
        const body = String(claimed.body || '');
        if (!toPhone || !toPhone.startsWith('+') || toPhone.length < 11) {
          await ref.set({ status: 'failed', error: 'Missing/invalid toPhone' }, { merge: true });
          await db.collection('smsJobDeadLetters').doc(jobId).set(deadLetterPayload(jobId, claimed, { message: 'Missing/invalid toPhone' }), { merge: true });
          failed++;
          continue;
        }
        if (!body || body.length < 2) {
          await ref.set({ status: 'failed', error: 'Missing/invalid body' }, { merge: true });
          await db.collection('smsJobDeadLetters').doc(jobId).set(deadLetterPayload(jobId, claimed, { message: 'Missing/invalid body' }), { merge: true });
          failed++;
          continue;
        }

        const result = await sendSmsTwilio({ to: toPhone, body: body.slice(0, 1500) });
        if (!result.success) {
          await ref.set({ status: 'queued', error: result.error || 'Send failed' }, { merge: true });
          requeued++;
          continue;
        }

        await ref.set({ status: 'sent', sid: result.sid || null }, { merge: true });
        sent++;
      } catch (e: any) {
        try {
          await ref.set({ status: 'queued', error: String(e?.message || e) }, { merge: true });
        } catch {}
        requeued++;
        logError('dispatchSmsJobs: send error (requeued)', e, { jobId });
      }
    }

    logInfo('dispatchSmsJobs: completed', { scanned, sent, failed, skipped, requeued, ms: Date.now() - startedAt });
    return { statusCode: 200, body: JSON.stringify({ ok: true, scanned, sent, failed, skipped, requeued }) };
  } catch (e: any) {
    logError('dispatchSmsJobs: fatal error', e, { scanned, sent, failed, skipped, requeued });
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e?.message || 'Unknown error' }) };
  }
};

export const handler = schedule('*/1 * * * *', baseHandler);

