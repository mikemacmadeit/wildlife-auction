/**
 * Email Service Configuration
 * Transactional email provider:
 * - Prefer Brevo if BREVO_API_KEY is set (matches marketing/newsletter integration)
 * - Otherwise fall back to Resend if RESEND_API_KEY is set
 */

import { Resend } from 'resend';

let resendInstance: Resend | null = null;

export function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  
  if (!apiKey) {
    return null;
  }

  if (!resendInstance) {
    resendInstance = new Resend(apiKey);
  }

  return resendInstance;
}

export type EmailProvider = 'ses' | 'resend' | 'brevo' | 'none';

export function getEmailProvider(): EmailProvider {
  const disabled = String(process.env.EMAIL_DISABLED || '').toLowerCase() === 'true';
  if (disabled) return 'none';

  const forced = String(process.env.EMAIL_PROVIDER || '').toLowerCase();
  if (forced === 'none') return 'none';
  if (forced === 'ses')
    return !!process.env.SES_AWS_ACCESS_KEY_ID && !!process.env.SES_AWS_SECRET_ACCESS_KEY && !!process.env.SES_FROM ? 'ses' : 'none';
  if (forced === 'brevo') return process.env.BREVO_API_KEY ? 'brevo' : 'none';
  if (forced === 'resend') return process.env.RESEND_API_KEY ? 'resend' : 'none';

  // Default behavior:
  // - In production, prefer SES if configured.
  // - Otherwise fall back to Brevo/Resend if configured.
  if (process.env.NODE_ENV === 'production') {
    if (!!process.env.SES_AWS_ACCESS_KEY_ID && !!process.env.SES_AWS_SECRET_ACCESS_KEY && !!process.env.SES_FROM) return 'ses';
  }
  if (process.env.BREVO_API_KEY) return 'brevo';
  if (process.env.RESEND_API_KEY) return 'resend';
  return 'none';
}

export function isEmailEnabled(): boolean {
  // EMAIL_DISABLED is an emergency kill-switch (noop sends).
  const disabled = String(process.env.EMAIL_DISABLED || '').toLowerCase() === 'true';
  if (disabled) return false;
  return getEmailProvider() !== 'none';
}

export const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@wildlifeexchange.com';
export const FROM_NAME = process.env.FROM_NAME || 'Wildlife Exchange';
