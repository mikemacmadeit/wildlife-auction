/**
 * Netlify Scheduled Function: Dispatch Push Jobs
 *
 * Sends queued pushJobs via Firebase Admin FCM.
 */

import { Handler, schedule } from '@netlify/functions';
import { Timestamp } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getAdminApp, getAdminDb } from '../../lib/firebase/admin';
import { logInfo, logWarn, logError } from '../../lib/monitoring/logger';
import { stableHash } from '../../lib/notifications/eventKey';

const MAX_JOBS_PER_RUN = 100;
const MAX_ATTEMPTS = 5;

function deadLetterPayload(jobId: string, job: any, error: { code?: string; message: string }) {
  const safeSnapshot = {
    userId: job?.userId,
    tokenId: typeof job?.token === 'string' ? stableHash(job.token).slice(0, 32) : null,
    notificationType: job?.payload?.notificationType || null,
    entityId: job?.payload?.entityId || null,
    createdAt: job?.createdAt || null,
    attempts: Number(job?.attempts || 0),
    lastAttemptAt: job?.lastAttemptAt || null,
  };
  return {
    jobId,
    kind: 'push',
    createdAt: Timestamp.now(),
    userId: typeof job?.userId === 'string' ? job.userId : null,
    attempts: Number(job?.attempts || 0),
    error: { code: error.code || null, message: error.message.slice(0, 2000) },
    snapshot: safeSnapshot,
    suppressed: false,
    manualRetryCount: 0,
    lastManualRetryAt: null,
  };
}

function isInvalidTokenError(e: any): boolean {
  const code = String(e?.code || '');
  const msg = String(e?.message || '');
  // Common Firebase Admin Messaging errors:
  // - messaging/registration-token-not-registered
  // - messaging/invalid-registration-token
  return (
    /registration-token-not-registered/i.test(code) ||
    /invalid-registration-token/i.test(code) ||
    /registration token is not registered|requested entity was not found|invalid registration token/i.test(msg)
  );
}

function backoffMs(attempt: number): number {
  const table = [0, 15_000, 60_000, 300_000, 900_000];
  return table[Math.min(attempt, table.length - 1)];
}

const baseHandler: Handler = async () => {
  const db = getAdminDb();
  const messaging = getMessaging(getAdminApp());
  const startedAt = Date.now();
  let scanned = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let requeued = 0;

  try {
    const snap = await db
      .collection('pushJobs')
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
            tx.set(
              db.collection('pushJobDeadLetters').doc(jobId),
              deadLetterPayload(jobId, { ...cur, attempts }, { message: 'Max attempts reached' }),
              { merge: true }
            );
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
        logWarn('dispatchPushJobs: claim failed', { jobId, error: String(e?.message || e) });
        continue;
      }

      if (!claimed) continue;

      const token = String(claimed.token || '');
      const payload = claimed.payload || {};
      const userId = typeof claimed.userId === 'string' ? claimed.userId : '';
      try {
        if (!token) {
          await ref.set({ status: 'failed', error: 'Missing token' }, { merge: true });
          await db
            .collection('pushJobDeadLetters')
            .doc(jobId)
            .set(deadLetterPayload(jobId, claimed, { message: 'Missing token' }), { merge: true });
          failed++;
          continue;
        }

        const title = String(payload.title || 'Agchange');
        const body = String(payload.body || '');
        const deepLinkUrl = payload.deepLinkUrl ? String(payload.deepLinkUrl) : undefined;

        const res = await messaging.send({
          token,
          notification: { title, body },
          data: {
            notificationType: String(payload.notificationType || ''),
            entityId: payload.entityId ? String(payload.entityId) : '',
            deepLinkUrl: deepLinkUrl || '',
          },
        });

        await ref.set({ status: 'sent', messageId: res }, { merge: true });
        sent++;
      } catch (e: any) {
        const errMsg = String(e?.message || e);
        const errCode = String(e?.code || '');

        const permanent = isInvalidTokenError(e);
        try {
          await ref.set(
            permanent ? { status: 'failed', error: errMsg, errorCode: errCode } : { status: 'queued', error: errMsg, errorCode: errCode },
            { merge: true }
          );
        } catch {
          // ignore
        }

        // If the token is invalid/expired, delete it to prevent infinite retries.
        if (permanent) {
          failed++;
          await db
            .collection('pushJobDeadLetters')
            .doc(jobId)
            .set(deadLetterPayload(jobId, claimed, { code: errCode, message: errMsg }), { merge: true })
            .catch(() => {});
          try {
            if (userId) {
              const tokenId = stableHash(token).slice(0, 32);
              await db.collection('users').doc(userId).collection('pushTokens').doc(tokenId).delete().catch(() => {});
              logWarn('dispatchPushJobs: deleted invalid push token', { jobId, userId, tokenId });
            } else {
              logWarn('dispatchPushJobs: invalid token but missing userId; cannot delete token doc', { jobId });
            }
          } catch (delErr: any) {
            logWarn('dispatchPushJobs: failed to delete invalid token', { jobId, userId, error: delErr?.message || String(delErr) });
          }
        } else {
          // transient failure: retry later via backoff
          requeued++;
        }

        logError(permanent ? 'dispatchPushJobs: send error (failed)' : 'dispatchPushJobs: send error (requeued)', e, {
          jobId,
          userId,
          errorCode: errCode,
        });
      }
    }

    logInfo('dispatchPushJobs: completed', { scanned, sent, failed, skipped, requeued, ms: Date.now() - startedAt });
    return { statusCode: 200, body: JSON.stringify({ ok: true, scanned, sent, failed, skipped, requeued }) };
  } catch (e: any) {
    logError('dispatchPushJobs: fatal error', e, { scanned, sent, failed, skipped, requeued });
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e?.message || 'Unknown error' }) };
  }
};

export const handler = schedule('*/1 * * * *', baseHandler);

