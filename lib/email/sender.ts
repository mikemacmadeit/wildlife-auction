/**
 * Email Sender Service
 * Handles sending transactional emails
 */

import { getEmailProvider, getResendClient, isEmailEnabled, FROM_EMAIL, FROM_NAME } from './config';
import { sendViaSes } from './sesSender';
import {
  getOrderConfirmationEmail,
  getDeliveryConfirmationEmail,
  getPayoutNotificationEmail,
  getAuctionWinnerEmail,
  getAuctionOutbidEmail,
  OrderConfirmationEmailData,
  DeliveryConfirmationEmailData,
  PayoutNotificationEmailData,
  AuctionWinnerEmailData,
  AuctionOutbidEmailData,
} from './templates';

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

async function sendTransactionalEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<SendEmailResult> {
  const killSwitch = String(process.env.EMAIL_DISABLED || '').toLowerCase() === 'true';
  if (killSwitch) {
    console.warn('[email] EMAIL_DISABLED=true; noop send', { to: params.to, subject: params.subject });
    return { success: true, messageId: 'disabled' };
  }

  if (!isEmailEnabled()) {
    console.warn('[email] not configured; would send', { to: params.to, subject: params.subject, provider: getEmailProvider() });
    return { success: false, error: 'Email service not configured' };
  }

  const provider = getEmailProvider();

  if (provider === 'ses') {
    const out = await sendViaSes({
      to: params.to,
      subject: params.subject,
      html: params.html,
      from: process.env.SES_FROM,
      replyTo: process.env.SES_REPLY_TO,
      tags: {
        app: 'wildlifeexchange',
        channel: 'transactional',
      },
    });
    if (!out.success) {
      console.error('[ses] transactional send failed', { error: out.error });
      return { success: false, error: out.error || 'SES send failed' };
    }
    if (out.sandbox?.enabled) {
      console.warn('[ses] sandbox mode forced recipient', { originalTo: out.sandbox.originalTo, forcedTo: out.sandbox.forcedTo });
    }
    return { success: true, messageId: out.messageId };
  }

  if (provider === 'resend') {
    const resend = getResendClient();
    if (!resend) return { success: false, error: 'Email client not available' };

    try {
      const result = await resend.emails.send({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: params.to,
        subject: params.subject,
        html: params.html,
      });

      if (result.error) {
        console.error('Error sending email (Resend):', result.error);
        return { success: false, error: result.error.message };
      }

      return { success: true, messageId: result.data?.id };
    } catch (error: any) {
      console.error('Exception sending email (Resend):', error);
      return { success: false, error: error?.message || 'Failed to send email' };
    }
  }

  if (provider === 'brevo') {
    try {
      const apiKey = process.env.BREVO_API_KEY;
      if (!apiKey) return { success: false, error: 'Email service not configured' };

      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'api-key': apiKey,
        },
        body: JSON.stringify({
          sender: { name: FROM_NAME, email: FROM_EMAIL },
          to: [{ email: params.to }],
          subject: params.subject,
          htmlContent: params.html,
        }),
      });

      let body: any = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }

      if (!res.ok) {
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.error('[brevo] transactional send failed', res.status, body);
        }
        // Provide an actionable message (common cause: sender/domain not verified in Brevo)
        const msg =
          (body && (body.message || body.error || body.code)) ? `${body.message || body.error || body.code}` : null;
        return { success: false, error: msg ? `Brevo send failed: ${msg}` : `Brevo send failed (HTTP ${res.status})` };
      }

      return { success: true, messageId: body?.messageId || body?.id };
    } catch (error: any) {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.error('[brevo] transactional send exception', error);
      }
      return { success: false, error: error?.message || 'Failed to send email' };
    }
  }

  return { success: false, error: 'Email service not configured' };
}

/**
 * Send order confirmation email to buyer
 */
export async function sendOrderConfirmationEmail(
  to: string,
  data: OrderConfirmationEmailData
): Promise<SendEmailResult> {
  const { subject, html } = getOrderConfirmationEmail(data);
  return sendTransactionalEmail({ to, subject, html });
}

/**
 * Send delivery confirmation email to buyer
 */
export async function sendDeliveryConfirmationEmail(
  to: string,
  data: DeliveryConfirmationEmailData
): Promise<SendEmailResult> {
  const { subject, html } = getDeliveryConfirmationEmail(data);
  return sendTransactionalEmail({ to, subject, html });
}

/**
 * Send payout notification email to seller
 */
export async function sendPayoutNotificationEmail(
  to: string,
  data: PayoutNotificationEmailData
): Promise<SendEmailResult> {
  const { subject, html } = getPayoutNotificationEmail(data);
  return sendTransactionalEmail({ to, subject, html });
}

/**
 * Send auction winner notification email
 */
export async function sendAuctionWinnerEmail(
  to: string,
  data: AuctionWinnerEmailData
): Promise<SendEmailResult> {
  const { subject, html } = getAuctionWinnerEmail(data);
  return sendTransactionalEmail({ to, subject, html });
}

/**
 * Send auction outbid notification email
 */
export async function sendAuctionOutbidEmail(
  to: string,
  data: AuctionOutbidEmailData
): Promise<SendEmailResult> {
  const { subject, html } = getAuctionOutbidEmail(data);
  return sendTransactionalEmail({ to, subject, html });
}

/**
 * Low-level helper used by job dispatchers.
 * Prefer template-specific helpers elsewhere.
 */
export async function sendEmailHtml(to: string, subject: string, html: string): Promise<SendEmailResult> {
  return sendTransactionalEmail({ to, subject, html });
}
