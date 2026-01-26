/**
 * SENTRY TEST ENDPOINT - Server-Side Error Test
 * 
 * Purpose: Verify Sentry is capturing server-side/API errors in production.
 * 
 * How to verify:
 * 1. Visit /api/sentry-test in production browser (or use curl/fetch)
 * 2. Endpoint will return 500 error
 * 3. Check Sentry Dashboard → Issues (within 1-2 minutes)
 * 4. Look for error: "Sentry test - server"
 * 
 * This endpoint should only exist for testing purposes.
 */

// Ensure Sentry server config is loaded
import '../../../sentry.server.config';
import { captureException } from '@/lib/monitoring/capture';

export async function GET() {
  const error = new Error('Sentry test - server');
  
  // Capture to Sentry before returning error
  captureException(error, {
    context: 'sentry-test',
    testType: 'server',
    endpoint: '/api/sentry-test',
  });

  // Return 500 error response
  return new Response(
    JSON.stringify({ 
      error: 'Sentry test error triggered',
      message: 'Check Sentry Dashboard → Issues for this error',
    }),
    {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
}
