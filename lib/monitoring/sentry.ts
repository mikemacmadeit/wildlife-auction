/**
 * Sentry Error Monitoring Configuration
 * 
 * To enable:
 * 1. Install: npm install @sentry/nextjs
 * 2. Run: npx @sentry/wizard@latest -i nextjs
 * 3. Add SENTRY_DSN to environment variables
 * 4. Uncomment the initialization code below
 */

// Uncomment when Sentry is installed:
/*
import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

if (SENTRY_DSN && typeof window !== 'undefined') {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 1.0, // Adjust based on traffic
    integrations: [
      new Sentry.BrowserTracing(),
      new Sentry.Replay({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
  });
}
*/

/**
 * Report error to Sentry (when enabled)
 */
export function reportError(error: Error, context?: Record<string, any>) {
  // Uncomment when Sentry is installed:
  /*
  if (typeof window !== 'undefined') {
    Sentry.captureException(error, {
      extra: context,
    });
  }
  */
  console.error('Error reported:', error, context);
}

/**
 * Report message to Sentry (when enabled)
 */
export function reportMessage(message: string, level: 'info' | 'warning' | 'error' = 'info', context?: Record<string, any>) {
  // Uncomment when Sentry is installed:
  /*
  if (typeof window !== 'undefined') {
    Sentry.captureMessage(message, {
      level: level as Sentry.SeverityLevel,
      extra: context,
    });
  }
  */
  console.log(`[${level.toUpperCase()}]`, message, context);
}
