/**
 * Email Sender Service
 * Handles sending transactional emails
 */

import { getEmailProvider, getResendClient, isEmailEnabled, FROM_EMAIL, FROM_NAME } from './config';
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
  if (!isEmailEnabled()) {
    console.log('Email disabled - would send:', params.subject, 'to:', params.to);
    return { success: false, error: 'Email service not configured' };
  }

  const provider = getEmailProvider();

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
        return { success: false, error: 'Failed to send email' };
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
