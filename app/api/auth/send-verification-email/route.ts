/**
 * POST /api/auth/send-verification-email
 *
 * Sends verification email using the same mechanism as notification emails:
 * create a User.EmailVerificationRequested event, process it (processEventDoc generates
 * the verification link and creates the emailJob), then dispatch the job (tryDispatchEmailJobNow).
 * Same pipeline as Order.Confirmed etc.: event → emailJob → sendEmailHtml.
 */
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import { processEventDoc } from '@/lib/notifications/processEvent';
import { tryDispatchEmailJobNow } from '@/lib/email/dispatchEmailJobNow';
import { getEmailProvider, FROM_EMAIL, isEmailEnabled } from '@/lib/email/config';

function json(body: any, init?: { status?: number }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

export async function POST(request: Request) {
  let auth: ReturnType<typeof getAdminAuth>;
  try {
    auth = getAdminAuth();
  } catch (e: any) {
    return json({ ok: false, error: 'Server not configured', message: e?.message }, { status: 503 });
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const token = authHeader.slice('Bearer '.length);

  let decoded: any;
  try {
    decoded = await auth.verifyIdToken(token);
  } catch {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const uid = decoded?.uid as string | undefined;
  if (!uid) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const emailEnabled = isEmailEnabled();
  const provider = getEmailProvider();
  if (process.env.NODE_ENV !== 'test') {
    console.info('[send-verification-email] step=check', { uid: uid.slice(0, 8), emailEnabled, provider: provider === 'none' ? 'none' : provider });
  }
  if (!emailEnabled) {
    console.error(
      '[send-verification-email] No email provider configured. Set RESEND_API_KEY, SENDGRID_API_KEY, or BREVO_API_KEY (and verify FROM_EMAIL domain). Provider:',
      provider
    );
    return json(
      {
        ok: false,
        error: 'Verification email service not configured',
        code: 'EMAIL_NOT_CONFIGURED',
        message: 'Set RESEND_API_KEY, SENDGRID_API_KEY, or BREVO_API_KEY in server environment.',
      },
      { status: 503 }
    );
  }

  try {
    const userRecord = await auth.getUser(uid);
    const email = userRecord.email;
    if (!email) return json({ ok: false, error: 'No email on account' }, { status: 400 });

    if (userRecord.emailVerified === true) {
      return json({ ok: true, alreadyVerified: true });
    }

    // Same mechanism as notification emails: create event → processEventDoc creates emailJob → dispatch
    const db = getAdminDb();
    const eventRef = db.collection('events').doc();
    const eventData = {
      id: eventRef.id,
      type: 'User.EmailVerificationRequested' as const,
      payload: { type: 'User.EmailVerificationRequested' as const, userId: uid },
      targetUserIds: [uid],
      status: 'pending' as const,
      createdAt: Timestamp.now(),
      actorId: null as string | null,
      entityType: 'user' as const,
      entityId: uid,
      processing: { attempts: 0, lastAttemptAt: null as any },
      eventKey: eventRef.id,
    };
    await eventRef.set(eventData);
    if (process.env.NODE_ENV !== 'test') {
      console.info('[send-verification-email] step=event_created', { eventId: eventRef.id });
    }

    const processRes = await processEventDoc({ db: db as any, eventRef: eventRef as any, eventData: eventData as any });
    if (!processRes.ok) {
      console.error('[send-verification-email] step=processEvent_failed', { error: processRes.error });
      return json(
        { ok: false, error: processRes.error || 'Failed to queue verification email.', message: 'Please try again or use the fallback.' },
        { status: 500 }
      );
    }

    const dispatch = await tryDispatchEmailJobNow({ db, jobId: eventRef.id, waitForJob: true });
    if (!dispatch.ok) {
      const isNotConfigured = dispatch.error?.toLowerCase().includes('not configured') ?? false;
      console.error('[send-verification-email] step=dispatch_failed', { error: dispatch.error, provider: getEmailProvider(), uid: uid.slice(0, 8) });
      return json(
        {
          ok: false,
          error: dispatch.error || 'Failed to send email',
          code: isNotConfigured ? 'EMAIL_NOT_CONFIGURED' : undefined,
          provider: getEmailProvider(),
          from: FROM_EMAIL,
        },
        { status: isNotConfigured ? 503 : 500 }
      );
    }
    if (!dispatch.sent) {
      console.error('[send-verification-email] step=dispatch_not_sent', { eventId: eventRef.id });
      return json(
        { ok: false, error: 'Verification email could not be sent. Please try again or use the fallback.' },
        { status: 500 }
      );
    }

    if (process.env.NODE_ENV !== 'test') {
      console.info('[send-verification-email] step=sent', { provider: getEmailProvider(), messageId: dispatch.messageId ?? '—' });
    }
    return json({ ok: true, sent: true, provider: getEmailProvider() });
  } catch (e: any) {
    console.error('[send-verification-email] step=exception', { message: e?.message || String(e) });
    return json(
      { ok: false, error: 'Failed to send verification email', message: 'Please try again or use the fallback.' },
      { status: 500 }
    );
  }
}

