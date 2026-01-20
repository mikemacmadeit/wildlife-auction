export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { requireAdmin, json } from '@/app/api/admin/_util';

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
  });
}

