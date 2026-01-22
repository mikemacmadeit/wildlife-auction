import sgMail from '@sendgrid/mail';

export type SendGridSendParams = {
  to: string;
  subject: string;
  html: string;
  from: { email: string; name?: string };
  replyTo?: string;
  categories?: string[];
};

export type SendGridSendResult = {
  success: boolean;
  messageId?: string;
  error?: string;
};

let initialized = false;

function initOnce() {
  if (initialized) return;
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) throw new Error('Missing required env var: SENDGRID_API_KEY');
  sgMail.setApiKey(apiKey);
  initialized = true;
}

function extractSendGridMessageId(headers: any): string | undefined {
  try {
    const h = headers || {};
    // sendgrid returns x-message-id header
    const msgId =
      h['x-message-id'] ||
      h['X-Message-Id'] ||
      h['x-message-id'.toLowerCase()] ||
      undefined;
    return typeof msgId === 'string' ? msgId : undefined;
  } catch {
    return undefined;
  }
}

export async function sendViaSendGrid(params: SendGridSendParams): Promise<SendGridSendResult> {
  try {
    initOnce();
  } catch (e: any) {
    return { success: false, error: e?.message || 'SendGrid not configured' };
  }

  try {
    const [res] = await sgMail.send({
      to: params.to,
      from: params.from,
      subject: params.subject,
      html: params.html,
      ...(params.replyTo ? { replyTo: params.replyTo } : {}),
      ...(params.categories?.length ? { categories: params.categories } : {}),
    });

    return { success: true, messageId: extractSendGridMessageId((res as any)?.headers) };
  } catch (e: any) {
    const details =
      (e?.response?.body && typeof e.response.body === 'object') ? JSON.stringify(e.response.body).slice(0, 1200) : null;
    const msg = `${e?.message || String(e)}${details ? ` | ${details}` : ''}`;
    return { success: false, error: msg };
  }
}

