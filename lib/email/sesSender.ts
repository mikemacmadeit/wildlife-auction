import { SendEmailCommand } from '@aws-sdk/client-sesv2';
import { getSesClient } from './sesClient';

export type SesSendParams = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string; // defaults to SES_FROM
  replyTo?: string; // defaults to SES_REPLY_TO
  tags?: Record<string, string>;
};

export type SesSendResult = {
  success: boolean;
  messageId?: string;
  error?: string;
  sandbox?: {
    enabled: boolean;
    originalTo: string[];
    forcedTo: string[];
  };
};

function parseEmails(input: string | string[]): string[] {
  const arr = Array.isArray(input) ? input : [input];
  return arr.map((s) => String(s || '').trim()).filter((s) => s && s.includes('@'));
}

function sanitizeHeaderHtml(s: string): string {
  return s.replace(/[<>&]/g, (c) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'));
}

function withSandboxBanner(html: string, originalTo: string[]): string {
  const who = originalTo.length ? originalTo.join(', ') : '(unknown)';
  const banner = `
    <div style="padding:12px 14px; background:#fff3cd; border:1px solid #ffeeba; border-radius:8px; margin:0 0 16px 0; font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
      <div style="font-weight:700; color:#856404; margin-bottom:4px;">SANDBOX MODE</div>
      <div style="color:#856404; font-size:13px;">Original recipient(s): ${sanitizeHeaderHtml(who)}</div>
    </div>
  `;
  // Insert banner right after opening <body> if possible; otherwise prepend.
  const idx = html.toLowerCase().indexOf('<body');
  if (idx >= 0) {
    const afterBodyOpen = html.indexOf('>', idx);
    if (afterBodyOpen >= 0) {
      return html.slice(0, afterBodyOpen + 1) + banner + html.slice(afterBodyOpen + 1);
    }
  }
  return banner + html;
}

function isTrue(v: string | undefined): boolean {
  return String(v || '').toLowerCase() === 'true';
}

export async function sendViaSes(params: SesSendParams): Promise<SesSendResult> {
  const originalTo = parseEmails(params.to);
  if (!originalTo.length) return { success: false, error: 'Missing/invalid to address' };

  const sandboxEnabled = isTrue(process.env.SES_SANDBOX_MODE);
  const sandboxTo = String(process.env.SES_SANDBOX_TO || 'michael@redwolfcinema.com').trim();
  const forcedTo = sandboxEnabled ? [sandboxTo] : originalTo;

  const from = String(params.from || process.env.SES_FROM || '').trim();
  if (!from) return { success: false, error: 'Missing SES_FROM' };

  const replyTo = String(params.replyTo || process.env.SES_REPLY_TO || '').trim();

  const html = sandboxEnabled ? withSandboxBanner(params.html, originalTo) : params.html;

  try {
    const client = getSesClient();
    const cmd = new SendEmailCommand({
      FromEmailAddress: from,
      Destination: { ToAddresses: forcedTo },
      ReplyToAddresses: replyTo ? [replyTo] : undefined,
      Content: {
        Simple: {
          Subject: { Data: params.subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: html, Charset: 'UTF-8' },
            ...(params.text ? { Text: { Data: params.text, Charset: 'UTF-8' } } : {}),
          },
        },
      },
      EmailTags: params.tags
        ? Object.entries(params.tags)
            .filter(([k, v]) => k && v)
            .map(([Name, Value]) => ({ Name, Value }))
        : undefined,
    });

    const out = await client.send(cmd);
    return {
      success: true,
      messageId: out.MessageId,
      ...(sandboxEnabled ? { sandbox: { enabled: true, originalTo, forcedTo } } : { sandbox: { enabled: false, originalTo, forcedTo } }),
    };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
}

