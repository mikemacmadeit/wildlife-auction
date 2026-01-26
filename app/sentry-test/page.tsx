/**
 * SENTRY TEST PAGE - Client-Side Error Test
 * 
 * Purpose: Verify Sentry is capturing client-side errors in production.
 * 
 * How to verify:
 * 1. Visit /sentry-test in production
 * 2. Click "Trigger Client Error" button
 * 3. Check Sentry Dashboard → Issues (within 1-2 minutes)
 * 4. Look for error: "Sentry test - client"
 * 
 * This page should only exist for testing purposes.
 */

'use client';

import { captureException } from '@/lib/monitoring/capture';

export default function SentryTestPage() {
  const handleTriggerError = () => {
    const error = new Error('Sentry test - client');
    // Capture to Sentry
    captureException(error, {
      context: 'sentry-test',
      testType: 'client',
    });
    // Also throw so it appears in console and Sentry error boundary
    throw error;
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Sentry Test Page</h1>
      <p>This page is for testing Sentry error capture in production.</p>
      <button
        onClick={handleTriggerError}
        style={{
          padding: '1rem 2rem',
          fontSize: '1rem',
          backgroundColor: '#ef4444',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
        }}
      >
        Trigger Client Error
      </button>
      <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#666' }}>
        After clicking, check Sentry Dashboard → Issues for the error.
      </p>
    </div>
  );
}
