/**
 * POST /api/auth/send-verification-email
 *
 * Sends a branded email verification email to the currently authenticated user.
 * This uses Firebase Admin to generate a verify-email link (ActionCodeSettings),
 * then sends via our email provider (Resend/Brevo) using our email templates.
 */
import { getAdminAuth } from '@/lib/firebase/admin';
import { getSiteUrl } from '@/lib/site-url';
import { renderEmail } from '@/lib/email';
import { sendEmailHtml } from '@/lib/email/sender';
import { getEmailProvider, FROM_EMAIL, isEmailEnabled } from '@/lib/email/config';

function json(body: any, init?: { status?: number }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

export async function POST(request: Request) {
  // #region agent log
  const _log = (msg: string, data: Record<string, unknown>) => {
    fetch('http://127.0.0.1:7242/ingest/17040e56-eeab-425b-acb7-47343bdc73b1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location: 'send-verification-email/route.ts', message: msg, data, timestamp: Date.now(), sessionId: 'debug-session', hypothesisId: data.hypothesisId ?? 'H1' }),
    }).catch(() => {});
  };
  // #endregion

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
  // #region agent log
  _log('API entry', { uid, emailEnabled, hypothesisId: 'H1' });
  // #endregion

  if (!emailEnabled) {
    return json(
      { ok: false, error: 'Verification email service not configured', code: 'EMAIL_NOT_CONFIGURED' },
      { status: 503 }
    );
  }

  try {
    const userRecord = await auth.getUser(uid);
    const email = userRecord.email;
    // #region agent log
    _log('getUser result', { uid, emailVerified: userRecord.emailVerified, hasEmail: !!email, hypothesisId: 'H1' });
    // #endregion
    if (!email) return json({ ok: false, error: 'No email on account' }, { status: 400 });

    if (userRecord.emailVerified === true) {
      return json({ ok: true, alreadyVerified: true });
    }

    const siteUrl = getSiteUrl();
    const dashboardUrl = `${siteUrl}/dashboard/account?verified=1`;

    const actionCodeSettings = {
      url: dashboardUrl,
      handleCodeInApp: false,
    };

    const verifyUrl = await auth.generateEmailVerificationLink(email, actionCodeSettings as any);

    const userName =
      (userRecord.displayName && String(userRecord.displayName).trim()) ||
      (email.includes('@') ? email.split('@')[0] : 'there');

    const rendered = renderEmail('verify_email', {
      userName,
      verifyUrl,
      dashboardUrl,
    });

    const sent = await sendEmailHtml(email, rendered.subject, rendered.html);
    // #region agent log
    _log('sendEmailHtml result', { success: sent.success, error: sent.error ?? null, hypothesisId: 'H1' });
    // #endregion
    if (!sent.success) {
      const provider = getEmailProvider();
      const isNotConfigured = sent.error?.toLowerCase().includes('not configured') ?? false;
      return json(
        {
          ok: false,
          error: sent.error || 'Failed to send email',
          code: isNotConfigured ? 'EMAIL_NOT_CONFIGURED' : undefined,
          provider,
          from: FROM_EMAIL,
        },
        { status: isNotConfigured ? 503 : 500 }
      );
    }

    return json({ ok: true, sent: true });
  } catch (e: any) {
    console.error('[send-verification-email]', e?.message || e);
    return json(
      { ok: false, error: 'Failed to send verification email', message: 'Please try again or use the fallback.' },
      { status: 500 }
    );
  }
}

