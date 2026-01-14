/**
 * Email Sender Service
 * Handles sending transactional emails
 */

import { getResendClient, isEmailEnabled, FROM_EMAIL, FROM_NAME } from './config';
import {
  getOrderConfirmationEmail,
  getDeliveryConfirmationEmail,
  getPayoutNotificationEmail,
  getAuctionWinnerEmail,
  OrderConfirmationEmailData,
  DeliveryConfirmationEmailData,
  PayoutNotificationEmailData,
  AuctionWinnerEmailData,
} from './templates';

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send order confirmation email to buyer
 */
export async function sendOrderConfirmationEmail(
  to: string,
  data: OrderConfirmationEmailData
): Promise<SendEmailResult> {
  if (!isEmailEnabled()) {
    console.log('Email disabled - would send order confirmation to:', to);
    return { success: false, error: 'Email service not configured' };
  }

  const resend = getResendClient();
  if (!resend) {
    return { success: false, error: 'Email client not available' };
  }

  try {
    const { subject, html } = getOrderConfirmationEmail(data);
    const result = await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to,
      subject,
      html,
    });

    if (result.error) {
      console.error('Error sending order confirmation email:', result.error);
      return { success: false, error: result.error.message };
    }

    return { success: true, messageId: result.data?.id };
  } catch (error: any) {
    console.error('Exception sending order confirmation email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send delivery confirmation email to buyer
 */
export async function sendDeliveryConfirmationEmail(
  to: string,
  data: DeliveryConfirmationEmailData
): Promise<SendEmailResult> {
  if (!isEmailEnabled()) {
    console.log('Email disabled - would send delivery confirmation to:', to);
    return { success: false, error: 'Email service not configured' };
  }

  const resend = getResendClient();
  if (!resend) {
    return { success: false, error: 'Email client not available' };
  }

  try {
    const { subject, html } = getDeliveryConfirmationEmail(data);
    const result = await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to,
      subject,
      html,
    });

    if (result.error) {
      console.error('Error sending delivery confirmation email:', result.error);
      return { success: false, error: result.error.message };
    }

    return { success: true, messageId: result.data?.id };
  } catch (error: any) {
    console.error('Exception sending delivery confirmation email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send payout notification email to seller
 */
export async function sendPayoutNotificationEmail(
  to: string,
  data: PayoutNotificationEmailData
): Promise<SendEmailResult> {
  if (!isEmailEnabled()) {
    console.log('Email disabled - would send payout notification to:', to);
    return { success: false, error: 'Email service not configured' };
  }

  const resend = getResendClient();
  if (!resend) {
    return { success: false, error: 'Email client not available' };
  }

  try {
    const { subject, html } = getPayoutNotificationEmail(data);
    const result = await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to,
      subject,
      html,
    });

    if (result.error) {
      console.error('Error sending payout notification email:', result.error);
      return { success: false, error: result.error.message };
    }

    return { success: true, messageId: result.data?.id };
  } catch (error: any) {
    console.error('Exception sending payout notification email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send auction winner notification email
 */
export async function sendAuctionWinnerEmail(
  to: string,
  data: AuctionWinnerEmailData
): Promise<SendEmailResult> {
  if (!isEmailEnabled()) {
    console.log('Email disabled - would send auction winner email to:', to);
    return { success: false, error: 'Email service not configured' };
  }

  const resend = getResendClient();
  if (!resend) {
    return { success: false, error: 'Email client not available' };
  }

  try {
    const { subject, html } = getAuctionWinnerEmail(data);
    const result = await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to,
      subject,
      html,
    });

    if (result.error) {
      console.error('Error sending auction winner email:', result.error);
      return { success: false, error: result.error.message };
    }

    return { success: true, messageId: result.data?.id };
  } catch (error: any) {
    console.error('Exception sending auction winner email:', error);
    return { success: false, error: error.message };
  }
}
