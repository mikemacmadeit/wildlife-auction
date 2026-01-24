'use client';

import { useEffect } from 'react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[DASHBOARD ERROR BOUNDARY]', error);
  }, [error]);

  return (
    <div className="p-6">
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4">
        <div className="font-bold text-destructive">Dashboard crashed</div>
        <pre className="mt-3 text-xs whitespace-pre-wrap">
          {String(error?.message || error)}
          {error?.digest ? `\nDigest: ${error.digest}` : ''}
        </pre>
        <button className="mt-4 rounded-lg border px-3 py-2 text-sm" onClick={reset}>
          Try again
        </button>
      </div>
    </div>
  );
}
