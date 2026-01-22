/**
 * Minimal Twilio SMS sender (server-only).
 *
 * Uses Twilio REST API directly via fetch (no heavy SDK dependency).
 *
 * Env:
 * - SMS_DISABLED=true (noop)
 * - TWILIO_ACCOUNT_SID
 * - TWILIO_AUTH_TOKEN
 * - TWILIO_FROM (E.164, e.g. +15551234567)
 */

export type TwilioSendParams = {
  to: string; // E.164
  body: string;
};

export type TwilioSendResult = {
  success: boolean;
  sid?: string;
  error?: string;
};

function isTrue(v: string | undefined): boolean {
  return String(v || '').toLowerCase() === 'true';
}

export async function sendSmsTwilio(params: TwilioSendParams): Promise<TwilioSendResult> {
  if (isTrue(process.env.SMS_DISABLED)) {
    console.warn('[sms] SMS_DISABLED=true; noop send', { to: params.to });
    return { success: true, sid: 'disabled' };
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!accountSid || !authToken || !from) {
    return { success: false, error: 'Twilio not configured (missing TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM)' };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
  const form = new URLSearchParams();
  form.set('To', params.to);
  form.set('From', from);
  form.set('Body', params.body);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    const data = await res.json().catch(() => ({} as any));
    if (!res.ok) {
      return { success: false, error: data?.message || `Twilio error (${res.status})` };
    }
    return { success: true, sid: data?.sid };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
}

