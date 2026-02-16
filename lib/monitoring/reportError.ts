/**
 * Error reporting utility
 *
 * Centralized error reporting. Wired to Sentry (client and server) when
 * SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN is set.
 *
 * Safe to use in both server and client contexts.
 */

import { captureException, captureMessage } from '@/lib/monitoring/capture';

/**
 * Report an error to monitoring services
 *
 * Logs to console and sends to Sentry when configured (server and client).
 *
 * @param error - The error object to report
 * @param context - Additional context about the error
 * @param severity - Error severity level
 */
export function reportError(
  error: Error | unknown,
  context?: Record<string, unknown>,
  severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'
): void {
  const errorObj = error instanceof Error
    ? error
    : new Error(String(error));

  console.error('[Error Report]', {
    message: errorObj.message,
    stack: errorObj.stack,
    context,
    severity,
    timestamp: new Date().toISOString(),
  });

  captureException(errorObj, context as Record<string, any>);
}

/**
 * Report a non-error issue (warning, info)
 */
export function reportWarning(
  message: string,
  context?: Record<string, unknown>
): void {
  console.warn('[Warning]', {
    message,
    context,
    timestamp: new Date().toISOString(),
  });

  captureMessage(message, 'warning', context as Record<string, any>);
}
