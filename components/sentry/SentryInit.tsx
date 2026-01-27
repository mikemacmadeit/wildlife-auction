/**
 * Sentry Client Initialization Component
 *
 * Sentry auto-instruments Next.js and loads sentry.client.config.ts at build time.
 * Do NOT manually import sentry.client.config here — that pulls server-only
 * deps (require-in-the-middle, etc.) into the client bundle and can cause
 * "Cannot read properties of undefined (reading 'call')" or chunk errors.
 * This component is a no-op placeholder; remove from layout if not needed.
 */

'use client';

export function SentryInit() {
  return null;
}
