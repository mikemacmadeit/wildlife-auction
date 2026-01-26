/**
 * Sentry Client Initialization Component
 * 
 * This component ensures Sentry is initialized on the client side.
 * Must be a client component to run in the browser.
 */

'use client';

// Import Sentry client config to ensure it's initialized
import '../../sentry.client.config';

export function SentryInit() {
  // This component just ensures the config file is imported
  // The actual initialization happens in sentry.client.config.ts
  return null;
}
