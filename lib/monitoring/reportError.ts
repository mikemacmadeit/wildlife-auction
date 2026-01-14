/**
 * Error reporting utility
 * 
 * Centralized error reporting for future integration with monitoring services
 * (e.g., Sentry, LogRocket, etc.)
 * 
 * Safe to use in both server and client contexts.
 */

interface ErrorReport {
  error: Error;
  context?: Record<string, unknown>;
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Report an error to monitoring services
 * 
 * Currently logs to console. In production, this should integrate with:
 * - Sentry (recommended for Next.js)
 * - LogRocket
 * - Custom error tracking service
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
  // Normalize error to Error object
  const errorObj = error instanceof Error 
    ? error 
    : new Error(String(error));

  // Log to console (always, for development)
  console.error('[Error Report]', {
    message: errorObj.message,
    stack: errorObj.stack,
    context,
    severity,
    timestamp: new Date().toISOString(),
  });

  // Sentry integration available in lib/monitoring/sentry.ts
  // Import and use reportError from that file when Sentry is installed
  // if (typeof window !== 'undefined' && window.Sentry) {
  //   window.Sentry.captureException(errorObj, {
  //     level: severity === 'critical' ? 'error' : 'warning',
  //     contexts: { custom: context },
  //   });
  // }

  // TODO: Integrate with server-side monitoring
  // In server context, you might want to send to a logging service
  // if (typeof window === 'undefined') {
  //   // Server-side logging
  // }
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

  // TODO: Integrate with monitoring service for warnings
}
