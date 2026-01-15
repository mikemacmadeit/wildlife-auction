/**
 * Sentry Capture Helpers
 * 
 * Safe wrappers around Sentry that no-op if Sentry is not configured.
 * Use these instead of importing Sentry directly.
 */

let sentryInitialized = false;

// Check if Sentry is available
if (typeof window !== 'undefined') {
  // Client-side: check for NEXT_PUBLIC_SENTRY_DSN
  sentryInitialized = !!(process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN);
} else {
  // Server-side: check for SENTRY_DSN
  sentryInitialized = !!process.env.SENTRY_DSN;
}

/**
 * Capture an exception to Sentry (if configured)
 */
export function captureException(error: Error, context?: Record<string, any>) {
  if (!sentryInitialized) {
    // No-op if Sentry not configured
    console.error('[Error]', error, context);
    return;
  }

  try {
    // IMPORTANT:
    // We intentionally avoid a direct `import('@sentry/nextjs')` here because Next's bundler
    // will still trace the dependency and can emit warnings (e.g. OpenTelemetry/require-in-the-middle).
    // Using an indirect dynamic import keeps Sentry out of the bundle graph unless actually executed.
    const dynamicImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>;
    dynamicImport('@sentry/nextjs').then((Sentry) => {
      Sentry.captureException(error, {
        extra: sanitizeContext(context),
      });
    }).catch(() => {
      // Fallback if import fails
      console.error('[Error]', error, context);
    });
  } catch {
    console.error('[Error]', error, context);
  }
}

/**
 * Capture a message to Sentry (if configured)
 */
export function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info',
  context?: Record<string, any>
) {
  if (!sentryInitialized) {
    // No-op if Sentry not configured
    console.log(`[${level.toUpperCase()}]`, message, context);
    return;
  }

  try {
    const dynamicImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>;
    dynamicImport('@sentry/nextjs').then((Sentry) => {
      Sentry.captureMessage(message, {
        level: level as any,
        extra: sanitizeContext(context),
      });
    }).catch(() => {
      console.log(`[${level.toUpperCase()}]`, message, context);
    });
  } catch {
    console.log(`[${level.toUpperCase()}]`, message, context);
  }
}

/**
 * Sanitize context to remove sensitive data
 */
function sanitizeContext(context?: Record<string, any>): Record<string, any> | undefined {
  if (!context) return undefined;

  const sanitized = { ...context };
  const sensitiveKeys = [
    'stripeSecretKey',
    'stripeWebhookSecret',
    'firebasePrivateKey',
    'authorization',
    'token',
    'password',
    'apiKey',
  ];

  sensitiveKeys.forEach(key => {
    if (sanitized[key]) {
      sanitized[key] = '[REDACTED]';
    }
  });

  return sanitized;
}
