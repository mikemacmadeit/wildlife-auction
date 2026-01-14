/**
 * Sentry Client Configuration
 * 
 * This file configures Sentry for the client-side of the Next.js application.
 */

import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;
const SENTRY_ENVIRONMENT = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development';
const SENTRY_TRACES_SAMPLE_RATE = parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1');
const SENTRY_RELEASE = process.env.SENTRY_RELEASE;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: SENTRY_ENVIRONMENT,
    tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
    release: SENTRY_RELEASE,
    integrations: [
      new Sentry.BrowserTracing({
        // Set sampling rate for performance monitoring
        tracePropagationTargets: ['localhost', /^https:\/\/.*\.netlify\.app/],
      }),
      new Sentry.Replay({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    // Filter out sensitive data
    beforeSend(event, hint) {
      // Remove sensitive keys from event
      if (event.request?.headers) {
        const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];
        sensitiveHeaders.forEach(header => {
          if (event.request.headers[header]) {
            event.request.headers[header] = '[REDACTED]';
          }
        });
      }
      return event;
    },
  });
}
