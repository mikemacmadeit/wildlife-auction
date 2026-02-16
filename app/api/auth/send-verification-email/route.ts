/**
 * POST /api/auth/send-verification-email
 *
 * Sends a branded email verification email to the currently authenticated user.
 * The email contains a button linking to Firebase's verification URL. Email is
 * only confirmed when the user clicks that button (Firebase sets emailVerified
 * server-side). We never mark verified without the user having clicked the link.
 *
 * Uses Firebase Admin generateEmailVerificationLink + our email provider (Resend/Brevo).
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
  if (!emailEnabled) {
    return json(
      { ok: false, error: 'Verification email service not configured', code: 'EMAIL_NOT_CONFIGURED' },
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

