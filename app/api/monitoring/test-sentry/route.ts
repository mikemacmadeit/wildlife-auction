/**
 * GET /api/monitoring/test-sentry
 * 
 * Test endpoint to verify Sentry error capture is working.
 * Only available in non-production environments.
 */

import { captureException, captureMessage } from '@/lib/monitoring/capture';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Only allow in non-production
  if (process.env.NODE_ENV === 'production') {
    return new Response(JSON.stringify({ error: 'Not available in production' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
  }

  const { searchParams } = new URL(request.url);
  const testType = searchParams.get('type') || 'exception';

  try {
    if (testType === 'exception') {
      // Test exception capture
      const testError = new Error('Test Sentry exception capture - this is intentional');
      captureException(testError, {
        test: true,
        endpoint: '/api/monitoring/test-sentry',
        timestamp: new Date().toISOString(),
      });
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Test exception sent to Sentry',
          type: 'exception',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      );
    } else if (testType === 'message') {
      // Test message capture
      captureMessage('Test Sentry message capture - this is intentional', 'info', {
        test: true,
        endpoint: '/api/monitoring/test-sentry',
        timestamp: new Date().toISOString(),
      });
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Test message sent to Sentry',
          type: 'message',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      );
    } else {
      return new Response(
        JSON.stringify({
          error: 'Invalid test type. Use ?type=exception or ?type=message',
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }
      );
    }
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        error: 'Failed to test Sentry',
        message: error.message,
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }
    );
  }
}
