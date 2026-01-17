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

export type EmailProvider = 'resend' | 'brevo' | 'none';

export function getEmailProvider(): EmailProvider {
  if (process.env.BREVO_API_KEY) return 'brevo';
  if (process.env.RESEND_API_KEY) return 'resend';
  return 'none';
}

export function isEmailEnabled(): boolean {
  return getEmailProvider() !== 'none';
}

export const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@wildlifeexchange.com';
export const FROM_NAME = process.env.FROM_NAME || 'Wildlife Exchange';
