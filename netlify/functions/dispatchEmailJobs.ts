/**
 * Netlify Scheduled Function: Dispatch Email Jobs
 *
 * Sends queued emailJobs using the existing email template registry + sender.
 */

import { Handler, schedule } from '@netlify/functions';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '../../lib/firebase/admin';
import { renderEmail, validatePayload } from '../../lib/email';
import { sendEmailHtml } from '../../lib/email/sender';
import { logInfo, logWarn, logError } from '../../lib/monitoring/logger';

const MAX_JOBS_PER_RUN = 50;
const MAX_ATTEMPTS = 5;

function backoffMs(attempt: number): number {
  // exponential-ish: 0s, 30s, 2m, 10m, 30m
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

  try {
    const snap = await db
      .collection('emailJobs')
      .where('status', '==', 'queued')
      .orderBy('createdAt', 'asc')
      .limit(MAX_JOBS_PER_RUN)
      .get();

    scanned = snap.size;
    if (snap.empty) return { statusCode: 200, body: JSON.stringify({ ok: true, scanned, sent, failed, skipped }) };

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
        logWarn('dispatchEmailJobs: claim failed', { jobId, error: String(e?.message || e) });
        continue;
      }

      if (!claimed) continue;

      try {
        const template = String(claimed.template || '');
        const payload = claimed.templatePayload;
        const toEmail = String(claimed.toEmail || '');

        // Engagement stop: if the user already clicked/read the corresponding in-app notification
        // before the delayed email fires, skip sending.
        try {
          const userId = String(claimed.userId || '');
          const eventId = String(claimed.eventId || jobId);
          if (userId && eventId && (template === 'auction_outbid' || template === 'auction_high_bidder')) {
            const notifSnap = await db.collection('users').doc(userId).collection('notifications').doc(eventId).get();
            const notif = notifSnap.exists ? (notifSnap.data() as any) : null;
            if (notif && (notif.clickedAt || notif.readAt || notif.read === true)) {
              await ref.set({ status: 'skipped', error: 'engaged_before_email' }, { merge: true });
              skipped++;
              continue;
            }
          }
        } catch {
          // fail open
        }

        const validated = validatePayload(template as any, payload);
        if (!validated.ok) {
          await ref.set({ status: 'failed', error: 'Invalid template payload' }, { merge: true });
          failed++;
          continue;
        }

        const rendered = renderEmail(template as any, validated.data);
        const result = await sendEmailHtml(toEmail, rendered.subject, rendered.html);
        if (!result.success) {
          await ref.set({ status: 'failed', error: result.error || 'Send failed' }, { merge: true });
          failed++;
          continue;
        }

        await ref.set({ status: 'sent', messageId: result.messageId || null }, { merge: true });
        sent++;
      } catch (e: any) {
        failed++;
        try {
          await ref.set({ status: 'failed', error: String(e?.message || e) }, { merge: true });
        } catch {}
        logError('dispatchEmailJobs: send error', e, { jobId });
      }
    }

    logInfo('dispatchEmailJobs: completed', { scanned, sent, failed, skipped, ms: Date.now() - startedAt });
    return { statusCode: 200, body: JSON.stringify({ ok: true, scanned, sent, failed, skipped }) };
  } catch (e: any) {
    logError('dispatchEmailJobs: fatal error', e, { scanned, sent, failed, skipped });
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e?.message || 'Unknown error' }) };
  }
};

export const handler = schedule('*/1 * * * *', baseHandler);

