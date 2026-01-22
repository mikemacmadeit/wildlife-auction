/**
 * Best-effort inline email job dispatch.
 *
 * Why this exists:
 * - Most notifications enqueue `emailJobs/*` and rely on scheduled functions to send.
 * - For high-intent flows (offers), we want emails to go out immediately even if schedulers are delayed.
 *
 * IMPORTANT:
 * - Does not change notification semantics (same recipients/templates).
 * - Only attempts to send jobs already queued in Firestore.
 * - Safe to call multiple times: it will no-op if the job is not queued.
 */

import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { renderEmail, validatePayload } from './index';
import { sendEmailHtml } from './sender';

export async function tryDispatchEmailJobNow(params: {
  db: Firestore;
  jobId: string;
}): Promise<{ ok: true; sent: boolean; messageId?: string } | { ok: false; error: string }> {
  const jobId = String(params.jobId || '').trim();
  if (!jobId) return { ok: false, error: 'Missing jobId' };

  const ref = params.db.collection('emailJobs').doc(jobId);

  let job: any | null = null;
  try {
    await params.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        job = null;
        return;
      }
      const cur = snap.data() as any;
      job = { id: snap.id, ...(cur || {}) };
      if (cur?.status !== 'queued') return; // already sent/processing/failed/skipped

      const attempts = Number(cur?.attempts || 0);
      tx.set(
        ref,
        {
          status: 'processing',
          attempts: attempts + 1,
          lastAttemptAt: Timestamp.now(),
        },
        { merge: true }
      );
      job = { ...job, status: 'processing', attempts: attempts + 1, lastAttemptAt: Timestamp.now() };
    });
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to claim job' };
  }

  if (!job) return { ok: true, sent: false };
  if (job.status !== 'processing') return { ok: true, sent: false };

  try {
    const template = String(job.template || '');
    const toEmail = String(job.toEmail || '');
    if (!toEmail || !toEmail.includes('@')) {
      await ref.set({ status: 'failed', error: 'Missing/invalid toEmail' }, { merge: true });
      return { ok: false, error: 'Missing/invalid toEmail' };
    }

    const validated = validatePayload(template as any, job.templatePayload);
    if (!validated.ok) {
      await ref.set({ status: 'failed', error: 'Invalid template payload' }, { merge: true });
      return { ok: false, error: 'Invalid template payload' };
    }

    const rendered = renderEmail(template as any, validated.data);
    const res = await sendEmailHtml(toEmail, rendered.subject, rendered.html);
    if (!res.success) {
      // Re-queue so scheduled dispatch can retry, and preserve error for debugging.
      await ref.set({ status: 'queued', error: res.error || 'Send failed' }, { merge: true });
      return { ok: false, error: res.error || 'Send failed' };
    }

    await ref.set({ status: 'sent', messageId: res.messageId || null, error: FieldValue.delete() }, { merge: true });
    return { ok: true, sent: true, messageId: res.messageId };
  } catch (e: any) {
    try {
      await ref.set({ status: 'queued', error: String(e?.message || e) }, { merge: true });
    } catch {}
    return { ok: false, error: e?.message || 'Send failed' };
  }
}

