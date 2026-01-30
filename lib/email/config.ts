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

export type EmailProvider = 'sendgrid' | 'resend' | 'brevo' | 'none';

export function getEmailProvider(): EmailProvider {
  const disabled = String(process.env.EMAIL_DISABLED || '').toLowerCase() === 'true';
  if (disabled) return 'none';

  const forced = String(process.env.EMAIL_PROVIDER || '').toLowerCase();
  if (forced === 'none') return 'none';
  if (forced === 'sendgrid') return process.env.SENDGRID_API_KEY ? 'sendgrid' : 'none';
  if (forced === 'brevo') return process.env.BREVO_API_KEY ? 'brevo' : 'none';
  if (forced === 'resend') return process.env.RESEND_API_KEY ? 'resend' : 'none';

  // Default behavior:
  // - Prefer SendGrid if configured (transactional).
  // - Otherwise fall back to Brevo/Resend if configured.
  if (process.env.NODE_ENV === 'production') {
    if (process.env.SENDGRID_API_KEY) return 'sendgrid';
  }
  if (process.env.SENDGRID_API_KEY) return 'sendgrid';
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

// Prefer the new SendGrid-aligned env vars, but keep backwards-compatible fallbacks.
export const FROM_EMAIL = process.env.EMAIL_FROM || process.env.FROM_EMAIL || 'noreply@agchange.app';
export const FROM_NAME = process.env.EMAIL_FROM_NAME || process.env.FROM_NAME || 'Agchange';
