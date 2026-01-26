/**
 * Sentry Capture Helpers
 * 
 * Safe wrappers around Sentry that no-op if Sentry is not configured.
 * Use these instead of importing Sentry directly.
 */

import * as Sentry from '@sentry/nextjs';

// Check if Sentry is configured
function isSentryConfigured(): boolean {
  if (typeof window !== 'undefined') {
    // Client-side: check for NEXT_PUBLIC_SENTRY_DSN
    return !!(process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN);
  } else {
    // Server-side: check for SENTRY_DSN
    return !!process.env.SENTRY_DSN;
  }
}

/**
 * Capture an exception to Sentry (if configured)
 */
export function captureException(error: Error, context?: Record<string, any>) {
  if (!isSentryConfigured()) {
    // No-op if Sentry not configured - log to console as fallback
    console.error('[Error]', error, context);
    return;
  }

  try {
    Sentry.captureException(error, {
      extra: sanitizeContext(context),
    });
  } catch (sentryError) {
    // If Sentry itself fails, fallback to console
    console.error('[Error] Failed to capture exception to Sentry:', sentryError);
    console.error('[Error] Original error:', error, context);
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
  if (!isSentryConfigured()) {
    // No-op if Sentry not configured - log to console as fallback
    console.log(`[${level.toUpperCase()}]`, message, context);
    return;
  }

  try {
    Sentry.captureMessage(message, {
      level: level as any,
      extra: sanitizeContext(context),
    });
  } catch (sentryError) {
    // If Sentry itself fails, fallback to console
    console.error('[Error] Failed to capture message to Sentry:', sentryError);
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
