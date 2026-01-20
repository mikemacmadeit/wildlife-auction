export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { requireAdmin, json } from '@/app/api/admin/_util';
import { Redis } from '@upstash/redis';
import { stripe } from '@/lib/stripe/config';

function toIsoSafe(v: any): string | null {
  try {
    if (!v) return null;
    if (typeof v?.toDate === 'function') return v.toDate().toISOString();
    if (v instanceof Date) return v.toISOString();
    if (typeof v?.seconds === 'number') return new Date(v.seconds * 1000).toISOString();
    return null;
  } catch {
    return null;
  }
}

function envBool(name: string): boolean {
  return String(process.env[name] || '').toLowerCase() === 'true';
}

type HealthStatus = 'OK' | 'WARN' | 'FAIL' | 'DEV';
type HealthCheck = {
  id: string;
  title: string;
  status: HealthStatus;
  message: string;
  details?: Record<string, any>;
  action?: string;
  docs?: string;
};

function isMissingIndexError(e: any): boolean {
  const code = String(e?.code || '');
  const msg = String(e?.message || '').toLowerCase();
  return code === 'failed-precondition' || msg.includes('requires an index') || msg.includes('failed-precondition');
}

function extractIndexUrl(e: any): string | null {
  const msg = String(e?.message || '');
  // Firestore typically includes a URL to create the index.
  const m = msg.match(/https:\/\/console\.firebase\.google\.com\/[^\s)]+/);
  return m?.[0] || null;
}

function toDateSafe(v: any): Date | null {
  try {
    if (!v) return null;
    if (v instanceof Date) return Number.isFinite(v.getTime()) ? v : null;
    if (typeof v?.toDate === 'function') {
      const d = v.toDate();
      return d instanceof Date && Number.isFinite(d.getTime()) ? d : null;
    }
    if (typeof v?.seconds === 'number') {
      const d = new Date(v.seconds * 1000);
      return Number.isFinite(d.getTime()) ? d : null;
    }
    if (typeof v === 'string' || typeof v === 'number') {
      const d = new Date(v);
      return Number.isFinite(d.getTime()) ? d : null;
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  const { db } = admin.ctx;

  const isNetlifyRuntime = String(process.env.NETLIFY || '').toLowerCase() === 'true' || !!process.env.NETLIFY;

  const hasUpstash =
    !!process.env.UPSTASH_REDIS_REST_URL &&
    !!process.env.UPSTASH_REDIS_REST_TOKEN;

  const stripeConfigured =
    !!process.env.STRIPE_SECRET_KEY &&
    !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY &&
    !!process.env.STRIPE_WEBHOOK_SECRET;

  const emailConfigured = !!process.env.BREVO_API_KEY || !!process.env.RESEND_API_KEY;

  // opsHealth docs (written by server jobs/webhooks)
  const [autoReleaseSnap, webhookSnap, aggSnap] = await Promise.allSettled([
    db.collection('opsHealth').doc('autoReleaseProtected').get(),
    db.collection('opsHealth').doc('stripeWebhook').get(),
    db.collection('opsHealth').doc('aggregateRevenue').get(),
  ]);

  const autoRelease = autoReleaseSnap.status === 'fulfilled' && autoReleaseSnap.value.exists ? (autoReleaseSnap.value.data() as any) : null;
  const stripeWebhook = webhookSnap.status === 'fulfilled' && webhookSnap.value.exists ? (webhookSnap.value.data() as any) : null;
  const aggregateRevenue = aggSnap.status === 'fulfilled' && aggSnap.value.exists ? (aggSnap.value.data() as any) : null;

  const checks: HealthCheck[] = [];

  // Firebase Admin / Firestore connectivity (read-only probe)
  try {
    await db.collection('opsHealth').doc('stripeWebhook').get();
    checks.push({
      id: 'firebase_firestore',
      title: 'Firestore connectivity (Admin)',
      status: 'OK',
      message: 'Firestore Admin SDK can read successfully.',
    });
  } catch (e: any) {
    checks.push({
      id: 'firebase_firestore',
      title: 'Firestore connectivity (Admin)',
      status: 'FAIL',
      message: `Firestore Admin SDK read failed: ${e?.message || 'unknown error'}`,
      details: { code: e?.code },
      action: 'Check Firebase Admin credentials and FIREBASE_PROJECT_ID configuration.',
    });
  }

  // Upstash connectivity (production-rate limiting durability)
  if (!hasUpstash) {
    checks.push({
      id: 'upstash_redis',
      title: 'Upstash Redis (rate limiting)',
      status: isNetlifyRuntime ? 'FAIL' : 'DEV',
      message: isNetlifyRuntime
        ? 'Upstash is not configured. Sensitive endpoints fail closed in Netlify runtime.'
        : 'Upstash is not configured (dev only).',
      action: 'Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.',
      docs: 'https://upstash.com/docs/redis/howto/nextjs-ratelimit',
    });
  } else {
    try {
      const redis = new Redis({ url: String(process.env.UPSTASH_REDIS_REST_URL), token: String(process.env.UPSTASH_REDIS_REST_TOKEN) });
      await redis.ping();
      checks.push({
        id: 'upstash_redis',
        title: 'Upstash Redis (rate limiting)',
        status: 'OK',
        message: 'Upstash Redis connected.',
      });
    } catch (e: any) {
      checks.push({
        id: 'upstash_redis',
        title: 'Upstash Redis (rate limiting)',
        status: 'FAIL',
        message: `Upstash Redis ping failed: ${e?.message || 'unknown error'}`,
        action: 'Verify Upstash credentials and network access from Netlify runtime.',
      });
    }
  }

  // Stripe connectivity
  if (!stripeConfigured || !stripe) {
    checks.push({
      id: 'stripe_api',
      title: 'Stripe API connectivity',
      status: 'FAIL',
      message: 'Stripe is not fully configured (missing keys or webhook secret).',
      details: {
        hasSecretKey: !!process.env.STRIPE_SECRET_KEY,
        hasPublishableKey: !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
        hasWebhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
      },
      action: 'Set STRIPE_SECRET_KEY, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, and STRIPE_WEBHOOK_SECRET.',
      docs: 'https://stripe.com/docs/keys',
    });
  } else {
    try {
      // Lightweight call to validate key works (resource_missing is OK).
      await stripe.customers.retrieve('cus_healthcheck_nonexistent');
      checks.push({ id: 'stripe_api', title: 'Stripe API connectivity', status: 'OK', message: 'Stripe API reachable.' });
    } catch (e: any) {
      if (String(e?.code || '') === 'resource_missing') {
        checks.push({ id: 'stripe_api', title: 'Stripe API connectivity', status: 'OK', message: 'Stripe API reachable.' });
      } else {
        checks.push({
          id: 'stripe_api',
          title: 'Stripe API connectivity',
          status: 'FAIL',
          message: `Stripe API call failed: ${e?.message || 'unknown error'}`,
          details: { code: e?.code, type: e?.type },
          action: 'Check STRIPE_SECRET_KEY and Stripe account permissions.',
        });
      }
    }
  }

  // Email + monitoring env presence
  checks.push({
    id: 'email_provider',
    title: 'Email provider configured',
    status: emailConfigured ? 'OK' : 'WARN',
    message: emailConfigured ? 'Email provider env is set.' : 'No email provider configured (BREVO_API_KEY/RESEND_API_KEY missing).',
    details: { provider: process.env.BREVO_API_KEY ? 'brevo' : process.env.RESEND_API_KEY ? 'resend' : 'none' },
    action: emailConfigured ? undefined : 'Set BREVO_API_KEY (preferred) or RESEND_API_KEY for transactional messages.',
  });
  checks.push({
    id: 'monitoring_sentry',
    title: 'Monitoring (Sentry) configured',
    status: !!process.env.SENTRY_DSN || !!process.env.NEXT_PUBLIC_SENTRY_DSN ? 'OK' : 'WARN',
    message: !!process.env.SENTRY_DSN || !!process.env.NEXT_PUBLIC_SENTRY_DSN ? 'Sentry DSN is set.' : 'Sentry DSN is not set.',
    action: 'Set SENTRY_DSN (server) and/or NEXT_PUBLIC_SENTRY_DSN (client).',
  });

  // Emergency flags visibility (ops control)
  checks.push({
    id: 'flags_emergency',
    title: 'Emergency flags',
    status: envBool('GLOBAL_CHECKOUT_FREEZE_ENABLED') || envBool('GLOBAL_PAYOUT_FREEZE_ENABLED') ? 'WARN' : 'OK',
    message: `Checkout freeze: ${envBool('GLOBAL_CHECKOUT_FREEZE_ENABLED') ? 'ON' : 'OFF'} • Payout freeze: ${envBool('GLOBAL_PAYOUT_FREEZE_ENABLED') ? 'ON' : 'OFF'} • Auto-release: ${envBool('AUTO_RELEASE_ENABLED') ? 'ON' : 'OFF'}`,
  });

  // Storage bucket sanity (common prod misconfig)
  const pid = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || '';
  const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '';
  if (bucket && pid && bucket === `${pid}.firebasestorage.app`) {
    checks.push({
      id: 'firebase_storage_bucket',
      title: 'Firebase Storage bucket config',
      status: 'WARN',
      message: 'Storage bucket env is set to *.firebasestorage.app; canonical default is *.appspot.com (client normalizes this).',
      details: { projectId: pid, storageBucket: bucket, expected: `${pid}.appspot.com` },
      action: `Update NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET to "${pid}.appspot.com" in Netlify env for clarity.`,
    });
  } else {
    checks.push({
      id: 'firebase_storage_bucket',
      title: 'Firebase Storage bucket config',
      status: bucket ? 'OK' : 'WARN',
      message: bucket ? 'Storage bucket env is present.' : 'Storage bucket env is missing (NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET).',
      details: bucket ? { storageBucket: bucket } : undefined,
    });
  }

  // opsHealth freshness (jobs + webhooks)
  const autoReleaseLastRun = toDateSafe(autoRelease?.lastRunAt);
  if (!autoReleaseLastRun) {
    checks.push({
      id: 'ops_autoReleaseProtected',
      title: 'Scheduled job: autoReleaseProtected',
      status: envBool('AUTO_RELEASE_ENABLED') ? 'WARN' : 'DEV',
      message: 'No run record found yet.',
      action: envBool('AUTO_RELEASE_ENABLED') ? 'Check Netlify scheduled function deployment/logs.' : 'Enable AUTO_RELEASE_ENABLED only if you want auto-release fallback running.',
    });
  } else {
    const minutesAgo = (Date.now() - autoReleaseLastRun.getTime()) / (1000 * 60);
    checks.push({
      id: 'ops_autoReleaseProtected',
      title: 'Scheduled job: autoReleaseProtected',
      status: minutesAgo > 25 ? 'FAIL' : minutesAgo > 15 ? 'WARN' : 'OK',
      message: `Last run ${Math.round(minutesAgo)} min ago.`,
      details: { lastRunAt: autoReleaseLastRun.toISOString(), errorsCount: autoRelease?.errorsCount ?? null, lastError: autoRelease?.lastError ?? null },
      action: minutesAgo > 25 ? 'Check Netlify function logs for autoReleaseProtected + verify schedule is enabled.' : undefined,
    });
  }

  const aggLastRun = toDateSafe(aggregateRevenue?.lastRunAt);
  if (!aggLastRun) {
    checks.push({
      id: 'ops_aggregateRevenue',
      title: 'Scheduled job: aggregateRevenue',
      status: 'WARN',
      message: 'No run record found yet.',
      action: 'Check Netlify scheduled function deployment/logs for aggregateRevenue.',
    });
  } else {
    const minutesAgo = (Date.now() - aggLastRun.getTime()) / (1000 * 60);
    checks.push({
      id: 'ops_aggregateRevenue',
      title: 'Scheduled job: aggregateRevenue',
      status: minutesAgo > 80 ? 'FAIL' : minutesAgo > 65 ? 'WARN' : 'OK',
      message: `Last run ${Math.round(minutesAgo)} min ago.`,
      details: { lastRunAt: aggLastRun.toISOString(), processed: aggregateRevenue?.processed ?? null, durationMs: aggregateRevenue?.durationMs ?? null },
      action: minutesAgo > 80 ? 'Check Netlify function logs for aggregateRevenue + verify schedule is enabled.' : undefined,
    });
  }

  const webhookLast = toDateSafe(stripeWebhook?.lastWebhookAt);
  if (!webhookLast) {
    checks.push({
      id: 'ops_stripeWebhook',
      title: 'Stripe webhook activity',
      status: stripeConfigured ? 'WARN' : 'FAIL',
      message: stripeConfigured ? 'No webhook events recorded yet.' : 'Stripe is not configured, so webhooks cannot work.',
      details: stripeWebhook ? { lastEventType: stripeWebhook?.lastEventType ?? null, lastEventId: stripeWebhook?.lastEventId ?? null } : undefined,
      action: stripeConfigured ? 'Verify Stripe webhook endpoint + send a test event in Stripe Dashboard.' : 'Configure Stripe keys first.',
      docs: 'https://dashboard.stripe.com/webhooks',
    });
  } else {
    const hoursAgo = (Date.now() - webhookLast.getTime()) / (1000 * 60 * 60);
    checks.push({
      id: 'ops_stripeWebhook',
      title: 'Stripe webhook activity',
      status: hoursAgo > 30 ? 'FAIL' : hoursAgo > 24 ? 'WARN' : 'OK',
      message: `Last event ${Math.round(hoursAgo)} hours ago (${String(stripeWebhook?.lastEventType || 'unknown')}).`,
      details: { lastWebhookAt: webhookLast.toISOString(), lastEventType: stripeWebhook?.lastEventType ?? null, lastEventId: stripeWebhook?.lastEventId ?? null },
      action: hoursAgo > 30 ? 'Check Stripe webhook delivery logs + Netlify function logs (/api/stripe/webhook).' : undefined,
    });
  }

  // Firestore index readiness (real queries used by admin UIs)
  // 1) Flagged message threads (admin/messages)
  try {
    await db.collection('messageThreads').where('flagged', '==', true).orderBy('updatedAt', 'desc').limit(1).get();
    checks.push({
      id: 'index_messageThreads_flagged_updatedAt',
      title: 'Index: flagged threads (messageThreads flagged + updatedAt)',
      status: 'OK',
      message: 'Composite index is available.',
    });
  } catch (e: any) {
    checks.push({
      id: 'index_messageThreads_flagged_updatedAt',
      title: 'Index: flagged threads (messageThreads flagged + updatedAt)',
      status: isMissingIndexError(e) ? 'FAIL' : 'WARN',
      message: isMissingIndexError(e) ? 'Missing composite index (admin/messages will fall back).' : `Query failed: ${e?.message || 'unknown error'}`,
      details: { code: e?.code, indexUrl: extractIndexUrl(e) },
      action: 'Deploy Firestore indexes (firebase deploy --only firestore:indexes).',
    });
  }

  // 2) Support tickets (admin/support)
  try {
    await db.collection('supportTickets').where('status', '==', 'open').orderBy('createdAt', 'desc').limit(1).get();
    checks.push({
      id: 'index_supportTickets_status_createdAt',
      title: 'Index: support tickets (supportTickets status + createdAt)',
      status: 'OK',
      message: 'Composite index is available.',
    });
  } catch (e: any) {
    checks.push({
      id: 'index_supportTickets_status_createdAt',
      title: 'Index: support tickets (supportTickets status + createdAt)',
      status: isMissingIndexError(e) ? 'FAIL' : 'WARN',
      message: isMissingIndexError(e) ? 'Missing composite index (admin/support will fall back).' : `Query failed: ${e?.message || 'unknown error'}`,
      details: { code: e?.code, indexUrl: extractIndexUrl(e) },
      action: 'Deploy Firestore indexes (firebase deploy --only firestore:indexes).',
    });
  }

  // 3) Compliance payout holds query (admin/compliance payout holds)
  try {
    // Sample "in" query can require composite index with createdAt orderBy.
    await db
      .collection('orders')
      .where('payoutHoldReason', 'in', ['MISSING_TAHC_CVI', 'TPWD_TRANSFER_APPROVAL_REQUIRED'])
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    checks.push({
      id: 'index_orders_payoutHoldReason_createdAt',
      title: 'Index: payout holds (orders payoutHoldReason + createdAt)',
      status: 'OK',
      message: 'Composite index is available.',
    });
  } catch (e: any) {
    checks.push({
      id: 'index_orders_payoutHoldReason_createdAt',
      title: 'Index: payout holds (orders payoutHoldReason + createdAt)',
      status: isMissingIndexError(e) ? 'FAIL' : 'WARN',
      message: isMissingIndexError(e) ? 'Missing composite index (admin/compliance payout holds may fail).' : `Query failed: ${e?.message || 'unknown error'}`,
      details: { code: e?.code, indexUrl: extractIndexUrl(e) },
      action: 'Deploy Firestore indexes (firebase deploy --only firestore:indexes).',
    });
  }

  return json({
    ok: true,
    now: new Date().toISOString(),
    env: {
      netlifyRuntime: isNetlifyRuntime,
      nodeEnv: process.env.NODE_ENV || null,
    },
    flags: {
      globalCheckoutFreezeEnabled: envBool('GLOBAL_CHECKOUT_FREEZE_ENABLED'),
      globalPayoutFreezeEnabled: envBool('GLOBAL_PAYOUT_FREEZE_ENABLED'),
      autoReleaseEnabled: envBool('AUTO_RELEASE_ENABLED'),
    },
    config: {
      firebaseAdmin: {
        ok: true,
        // These are safe to expose (do not include private keys).
        projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || null,
      },
      rateLimiting: {
        requireRedisInProdForSensitiveRoutes: true,
        upstashConfigured: hasUpstash,
        effectiveInNetlify: !isNetlifyRuntime ? true : hasUpstash, // sensitive routes fail closed otherwise
      },
      stripe: {
        configured: stripeConfigured,
        hasSecretKey: !!process.env.STRIPE_SECRET_KEY,
        hasPublishableKey: !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
        hasWebhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
      },
      email: {
        configured: emailConfigured,
        provider: process.env.BREVO_API_KEY ? 'brevo' : process.env.RESEND_API_KEY ? 'resend' : 'none',
      },
      monitoring: {
        sentryConfigured: !!process.env.SENTRY_DSN || !!process.env.NEXT_PUBLIC_SENTRY_DSN,
      },
    },
    opsHealth: {
      autoReleaseProtected: autoRelease
        ? {
            lastRunAt: toIsoSafe(autoRelease.lastRunAt),
            scannedCount: autoRelease.scannedCount ?? null,
            releasedCount: autoRelease.releasedCount ?? null,
            errorsCount: autoRelease.errorsCount ?? null,
            lastError: autoRelease.lastError ?? null,
            updatedAt: toIsoSafe(autoRelease.updatedAt),
          }
        : null,
      stripeWebhook: stripeWebhook
        ? {
            lastWebhookAt: toIsoSafe(stripeWebhook.lastWebhookAt),
            lastEventType: stripeWebhook.lastEventType ?? null,
            lastEventId: stripeWebhook.lastEventId ?? null,
            updatedAt: toIsoSafe(stripeWebhook.updatedAt),
          }
        : null,
      aggregateRevenue: aggregateRevenue
        ? {
            lastRunAt: toIsoSafe(aggregateRevenue.lastRunAt),
            processed: aggregateRevenue.processed ?? null,
            durationMs: aggregateRevenue.durationMs ?? null,
            updatedAt: toIsoSafe(aggregateRevenue.updatedAt),
          }
        : null,
    },
    checks,
  });
}

