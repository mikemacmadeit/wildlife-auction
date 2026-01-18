/**
 * GET /api/stripe/checkout/verify-session?session_id=cs_...
 *
 * Purpose:
 * - Safely verify a Stripe Checkout Session after redirect
 * - Never throw / never return 500 for recoverable Stripe/env issues (returns ok:false)
 * - Provide UI-friendly states for async payments (ACH/bank rails)
 *
 * NOTE: Avoid importing NextResponse in this repo (see webhook route notes).
 */

import { stripe, isStripeConfigured } from '@/lib/stripe/config';
import { logError, logInfo, logWarn, getRequestId } from '@/lib/monitoring/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: any, init?: { status?: number; headers?: Headers | Record<string, string> }) {
  const headers =
    init?.headers instanceof Headers
      ? Object.fromEntries(init.headers.entries())
      : (init?.headers as Record<string, string> | undefined);

  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      'content-type': 'application/json',
      ...(headers || {}),
    },
  });
}

const NextResponse = { json };

function getKeyMode(secretKey?: string): 'test' | 'live' | 'unknown' {
  if (!secretKey) return 'unknown';
  if (secretKey.startsWith('sk_test_')) return 'test';
  if (secretKey.startsWith('sk_live_')) return 'live';
  return 'unknown';
}

function getSessionIdMode(sessionId: string): 'test' | 'live' | 'unknown' {
  if (sessionId.startsWith('cs_test_')) return 'test';
  if (sessionId.startsWith('cs_live_')) return 'live';
  return 'unknown';
}

export async function GET(request: Request) {
  const requestId = getRequestId(request.headers);
  const responseHeaders = new Headers();
  responseHeaders.set('x-request-id', requestId);

  const url = new URL(request.url);
  const sessionId = (url.searchParams.get('session_id') || '').trim();

  if (!sessionId || !sessionId.startsWith('cs_')) {
    return NextResponse.json(
      { ok: false, reason: 'invalid_input', message: 'Invalid session_id' },
      { status: 400, headers: responseHeaders }
    );
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const keyMode = getKeyMode(secretKey);
  const sessionMode = getSessionIdMode(sessionId);

  // Fast-fail obvious mode mismatches (prevents confusing Stripe resource_missing errors).
  if (keyMode !== 'unknown' && sessionMode !== 'unknown' && keyMode !== sessionMode) {
    logWarn('Checkout session verify: mode mismatch', {
      requestId,
      route: '/api/stripe/checkout/verify-session',
      sessionPrefix: sessionMode === 'test' ? 'cs_test_' : 'cs_live_',
      keyMode,
      sessionMode,
      hasStripeKey: true,
    });
    return NextResponse.json(
      {
        ok: false,
        reason: 'mode_mismatch',
        message:
          sessionMode === 'test'
            ? 'This looks like a test checkout session, but the server is configured with a live Stripe key.'
            : 'This looks like a live checkout session, but the server is configured with a test Stripe key.',
        debug: { keyMode, sessionMode },
      },
      { status: 200, headers: responseHeaders }
    );
  }

  if (!isStripeConfigured() || !stripe) {
    logError('Checkout session verify: Stripe not configured', undefined, {
      requestId,
      route: '/api/stripe/checkout/verify-session',
      hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
      keyMode,
      sessionMode,
    });
    return NextResponse.json(
      {
        ok: false,
        reason: 'not_configured',
        message: 'Payments are not configured on this environment yet.',
        debug: { hasStripeKey: !!process.env.STRIPE_SECRET_KEY, keyMode, sessionMode },
      },
      { status: 200, headers: responseHeaders }
    );
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent'],
    });

    const paymentStatus = String((session as any).payment_status || '');
    const status = String((session as any).status || '');
    const mode = String((session as any).mode || '');

    const paymentMethodTypes = Array.isArray((session as any).payment_method_types)
      ? ((session as any).payment_method_types as string[])
      : [];
    const looksLikeAch = paymentMethodTypes.includes('us_bank_account');

    const pi: any = (session as any).payment_intent && typeof (session as any).payment_intent === 'object'
      ? (session as any).payment_intent
      : null;
    const piStatus = pi?.status ? String(pi.status) : null;

    const isPaid = paymentStatus === 'paid';
    const isProcessing =
      !isPaid &&
      (looksLikeAch ||
        piStatus === 'processing' ||
        piStatus === 'requires_action' ||
        piStatus === 'requires_confirmation');

    logInfo('Checkout session verified', {
      requestId,
      route: '/api/stripe/checkout/verify-session',
      sessionPrefix: sessionMode === 'test' ? 'cs_test_' : sessionMode === 'live' ? 'cs_live_' : 'cs_',
      keyMode,
      sessionMode,
      paymentStatus,
      status,
      mode,
      isProcessing,
    });

    return NextResponse.json(
      {
        ok: true,
        session: {
          id: session.id,
          payment_status: paymentStatus,
          status,
          mode,
          customer_email: session.customer_details?.email || null,
          metadata: session.metadata || {},
          payment_intent_status: piStatus,
          payment_method_types: paymentMethodTypes,
        },
        isProcessing,
      },
      { status: 200, headers: responseHeaders }
    );
  } catch (error: any) {
    const stripePayload = error?.type || error?.raw
      ? {
          type: error?.type || error?.raw?.type,
          code: error?.code || error?.raw?.code,
          statusCode: error?.statusCode || error?.raw?.statusCode,
          requestId: error?.requestId || error?.raw?.requestId,
          message: error?.message || error?.raw?.message,
        }
      : null;

    logWarn('Checkout session verify: Stripe retrieve failed', {
      requestId,
      route: '/api/stripe/checkout/verify-session',
      sessionPrefix: sessionMode === 'test' ? 'cs_test_' : sessionMode === 'live' ? 'cs_live_' : 'cs_',
      keyMode,
      sessionMode,
      hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
      stripe: stripePayload || undefined,
    });

    const msg = String(stripePayload?.message || error?.message || '');
    const looksLikeResourceMissing = /no such checkout\\.session/i.test(msg) || String(stripePayload?.code || '') === 'resource_missing';
    const reason = looksLikeResourceMissing ? 'not_found' : 'stripe_error';

    return NextResponse.json(
      {
        ok: false,
        reason,
        message:
          reason === 'not_found'
            ? 'We could not verify this checkout session. This can happen if you used the wrong environment (test vs live).'
            : 'We could not verify this checkout session right now. Please try again.',
        stripe: stripePayload || undefined,
        debug: { keyMode, sessionMode },
      },
      { status: 200, headers: responseHeaders }
    );
  }
}

