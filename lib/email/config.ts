/**
 * Email Service Configuration
 * Uses Resend for transactional emails
 */

import { Resend } from 'resend';

let resendInstance: Resend | null = null;

export function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  
  if (!apiKey) {
    console.warn('RESEND_API_KEY not set - email notifications disabled');
    return null;
  }

  if (!resendInstance) {
    resendInstance = new Resend(apiKey);
  }

  return resendInstance;
}

export function isEmailEnabled(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@wildlifeexchange.com';
export const FROM_NAME = process.env.FROM_NAME || 'Wildlife Exchange';
