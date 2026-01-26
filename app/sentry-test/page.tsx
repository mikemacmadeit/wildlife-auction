/**
 * SENTRY TEST PAGE - Client-Side Error Test
 * 
 * Purpose: Verify Sentry is capturing client-side errors in production.
 * 
 * How to verify:
 * 1. Visit /sentry-test in production
 * 2. Check if Sentry is configured (status shown below)
 * 3. Click "Trigger Client Error" button
 * 4. Check Sentry Dashboard → Issues (within 1-2 minutes)
 * 5. Look for error: "Sentry test - client"
 * 
 * This page should only exist for testing purposes.
 */

'use client';

import { useState, useEffect } from 'react';
// Import Sentry client config to ensure it's initialized
import '../../sentry.client.config';
import { captureException } from '@/lib/monitoring/capture';

export default function SentryTestPage() {
  const [status, setStatus] = useState<string>('');

  // Check Sentry configuration status
  const checkSentryStatus = () => {
    try {
      // Check if Sentry is initialized by checking for DSN
      const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;
      
      if (dsn) {
        // Try to get Sentry client to verify it's actually initialized
        const client = (window as any).__SENTRY__?.hub?.getClient?.();
        if (client) {
          setStatus(`✅ Sentry is CONFIGURED and INITIALIZED\nDSN: ${dsn.substring(0, 40)}...\nEnvironment: ${client.getOptions()?.environment || 'unknown'}`);
        } else {
          setStatus(`⚠️ Sentry DSN is set but may not be initialized\nDSN: ${dsn.substring(0, 40)}...\n\nThis might be normal if Sentry loads asynchronously.`);
        }
      } else {
        setStatus('❌ Sentry is NOT CONFIGURED\n\nSet NEXT_PUBLIC_SENTRY_DSN environment variable in Netlify:\n1. Go to Site Settings → Environment Variables\n2. Add NEXT_PUBLIC_SENTRY_DSN with your Sentry DSN\n3. Redeploy the site');
      }
    } catch (error) {
      setStatus(`❌ Error checking Sentry status: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleTriggerError = () => {
    const error = new Error('Sentry test - client');
    
    // Capture to Sentry
    captureException(error, {
      context: 'sentry-test',
      testType: 'client',
      timestamp: new Date().toISOString(),
    });
    
    setStatus('✅ Error captured! Check Sentry Dashboard → Issues within 1-2 minutes.\n\nNote: You may also see the error in the browser console - this is normal.');
    
    // Don't throw - just capture, so the page doesn't crash
    // If you want to test error boundaries, uncomment the throw below
    // throw error;
  };

  // Check status on mount
  useEffect(() => {
    checkSentryStatus();
  }, []);

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto', fontFamily: 'system-ui' }}>
      <h1 style={{ marginBottom: '1rem' }}>Sentry Test Page</h1>
      <p style={{ marginBottom: '2rem', color: '#666' }}>
        This page is for testing Sentry error capture in production.
      </p>

      <div style={{ 
        padding: '1rem', 
        backgroundColor: '#f5f5f5', 
        borderRadius: '8px', 
        marginBottom: '2rem',
        whiteSpace: 'pre-wrap',
        fontFamily: 'monospace',
        fontSize: '0.875rem'
      }}>
        <strong>Sentry Status:</strong>
        <br />
        {status || 'Click "Check Status" to verify configuration'}
      </div>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        <button
          onClick={checkSentryStatus}
          style={{
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Check Sentry Status
        </button>
        <button
          onClick={handleTriggerError}
          style={{
            padding: '0.75rem 1.5rem',
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
      </div>

      <div style={{ 
        padding: '1rem', 
        backgroundColor: '#fef3c7', 
        borderRadius: '8px',
        border: '1px solid #fbbf24'
      }}>
        <strong>📋 Next Steps:</strong>
        <ol style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
          <li>Click "Check Sentry Status" to verify DSN is configured</li>
          <li>Click "Trigger Client Error" to send a test error</li>
          <li>Check your Sentry Dashboard → Issues (within 1-2 minutes)</li>
          <li>Look for error: "Sentry test - client"</li>
        </ol>
      </div>
    </div>
  );
}
