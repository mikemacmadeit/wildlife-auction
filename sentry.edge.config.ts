/**
 * Sentry Edge Configuration
 * 
 * This file configures Sentry for Edge runtime (middleware, edge functions).
 */

import * as Sentry from '@sentry/nextjs';

// Normalize DSN to handle common formatting issues
function normalizeDsn(dsn: string | undefined): string | undefined {
  if (!dsn) return undefined;
  
  // Remove leading/trailing whitespace
  dsn = dsn.trim();
  
  // Fix common issue: DSN starting with // instead of https://
  if (dsn.startsWith('//')) {
    dsn = 'https:' + dsn;
  }
  
  // Ensure it starts with https://
  if (!dsn.startsWith('http://') && !dsn.startsWith('https://')) {
    dsn = 'https://' + dsn;
  }
  
  return dsn;
}

const SENTRY_DSN = normalizeDsn(process.env.SENTRY_DSN);
const SENTRY_ENVIRONMENT = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development';
const SENTRY_TRACES_SAMPLE_RATE = parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1');
const SENTRY_RELEASE = process.env.SENTRY_RELEASE;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: SENTRY_ENVIRONMENT,
    tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
    release: SENTRY_RELEASE,
  });
}
