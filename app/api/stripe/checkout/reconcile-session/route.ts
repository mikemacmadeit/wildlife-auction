/**
 * POST /api/stripe/checkout/reconcile-session
 *
 * Fail-safe: if Stripe redirected the user back but the webhook pipeline is delayed/misconfigured,
 * this endpoint can reconcile the Checkout Session into an Order + listing state transition.
 *
 * Security model:
 * - Requires Firebase auth (Bearer token)
 * - Fetches the session from Stripe using server secret key
 * - Verifies session.metadata.buyerId matches the caller
 * - Idempotent: handler checks for existing order by stripeCheckoutSessionId
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { z } from 'zod';
import Stripe from 'stripe';
import { getFirestore } from 'firebase-admin/firestore';
import { stripe, isStripeConfigured } from '@/lib/stripe/config';
import { checkRateLimitByKey, rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { logInfo, logWarn, logError, getRequestId } from '@/lib/monitoring/logger';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { handleCheckoutSessionCompleted } from '@/app/api/stripe/webhook/handlers';

function json(body: any, init?: { status?: number; headers?: Record<string, string> | Headers }) {
  const headers =
    init?.headers instanceof Headers
      ? Object.fromEntries(init.headers.entries())
      : (init?.headers as Record<string, string> | undefined);
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json', ...(headers || {}) },
  });
}

const bodySchema = z.object({
  session_id: z.string().min(1).startsWith('cs_'),
});

export async function POST(request: Request) {
  const requestId = getRequestId(request.headers);

  // Admin SDK init
  let auth: ReturnType<typeof getAdminAuth>;
  let db: ReturnType<typeof getAdminDb>;
  try {
    auth = getAdminAuth();
    db = getAdminDb();
  } catch (e: any) {
    logError('Firebase Admin init failed in reconcile-session', e, {
      requestId,
      route: '/api/stripe/checkout/reconcile-session',
      code: e?.code,
      missing: e?.missing,
    });
    return json(
      {
        ok: false,
        reason: 'not_configured',
        message: 'Server is not configured for checkout reconciliation.',
        code: e?.code || 'FIREBASE_ADMIN_INIT_FAILED',
        missing: e?.missing || undefined,
      },
      { status: 503 }
    );
  }

  if (!isStripeConfigured() || !stripe) {
    logError('Stripe not configured for reconcile-session', undefined, {
      requestId,
      route: '/api/stripe/checkout/reconcile-session',
    });
    return json(
      { ok: false, reason: 'not_configured', message: 'Stripe is not configured.' },
      { status: 503 }
    );
  }

  // Auth (buyer)
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return json({ ok: false, reason: 'unauthorized', message: 'Missing auth token.' }, { status: 401 });
  }
  const token = authHeader.split('Bearer ')[1];
  let decoded: any;
  try {
    decoded = await auth.verifyIdToken(token);
  } catch {
    return json({ ok: false, reason: 'unauthorized', message: 'Invalid auth token.' }, { status: 401 });
  }
  const callerUid = decoded.uid as string;

  // Rate limiting (post-auth) - avoid shared-IP false positives.
  const rlKey = `reconcile:user:${callerUid}`;
  const rl = await checkRateLimitByKey(rlKey, RATE_LIMITS.checkout);
  if (!rl.allowed) {
    return json(
      { error: rl.error || 'Too many requests. Please try again later.', retryAfter: rl.retryAfter },
      { status: rl.status ?? 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    );
  }

  // Parse body
  let raw: any;
  try {
    raw = await request.json();
  } catch {
    return json({ ok: false, reason: 'invalid_input', message: 'Invalid JSON body.' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return json(
      { ok: false, reason: 'invalid_input', message: 'Invalid session_id.' },
      { status: 400 }
    );
  }

  const sessionId = parsed.data.session_id;

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent'] });

    const buyerIdFromMeta = session.metadata?.buyerId || null;
    if (!buyerIdFromMeta || String(buyerIdFromMeta) !== callerUid) {
      logWarn('Reconcile denied: buyerId mismatch', {
        requestId,
        route: '/api/stripe/checkout/reconcile-session',
        sessionId,
        callerUid,
        buyerIdFromMeta,
      });
      return json({ ok: false, reason: 'forbidden', message: 'Forbidden.' }, { status: 403 });
    }

    // If an order already exists, we still may need to reconcile.
    // Why: the checkout create-session path pre-creates an order skeleton (status=pending) before redirect.
    // If webhook delivery is delayed/misconfigured, the order can exist while the listing never transitions to sold.
    const adminDb = db as unknown as ReturnType<typeof getFirestore>;
    const existing = await adminDb
      .collection('orders')
      .where('stripeCheckoutSessionId', '==', sessionId)
      .limit(1)
      .get();
    const existingDoc = existing.empty ? null : existing.docs[0];
    const existingData = existingDoc ? (existingDoc.data() as any) : null;
    const existingStatus = existingData ? String(existingData.status || '') : null;

    // Only skip the handler if we are already in a terminal-ish state.
    // Otherwise, reuse the canonical webhook handler to ensure listing transitions are applied.
    const isTerminal =
      existingStatus === 'paid_held' ||
      existingStatus === 'paid' ||
      existingStatus === 'completed' ||
      existingStatus === 'refunded' ||
      existingStatus === 'cancelled';

    if (!isTerminal) {
      await handleCheckoutSessionCompleted(adminDb, session as Stripe.Checkout.Session, requestId);
    }

    // Fetch created/updated order ID and status (for client and debugging)
    const created = await adminDb
      .collection('orders')
      .where('stripeCheckoutSessionId', '==', sessionId)
      .limit(1)
      .get();
    const orderId = created.empty ? undefined : created.docs[0].id;
    const orderStatus = created.empty ? undefined : String((created.docs[0].data() as any)?.status || '');

    logInfo('Reconcile completed', {
      requestId,
      route: '/api/stripe/checkout/reconcile-session',
      sessionId,
      orderId,
      orderStatus: orderStatus || undefined,
      existingStatus: existingStatus || undefined,
      skipped: isTerminal ? true : false,
    });

    return json({ ok: true, idempotent: isTerminal, orderId: orderId || null, orderStatus: orderStatus || null });
  } catch (e: any) {
    logError('Reconcile failed', e, {
      requestId,
      route: '/api/stripe/checkout/reconcile-session',
      sessionId,
      stripeErrorType: e?.type,
      stripeErrorCode: e?.code,
      stripeRequestId: e?.requestId,
    });
    return json(
      {
        ok: false,
        reason: 'server_error',
        message: e?.message || 'Failed to reconcile checkout session.',
      },
      { status: 500 }
    );
  }
}

