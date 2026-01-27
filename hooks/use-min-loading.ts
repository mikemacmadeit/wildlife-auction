'use client';

import { useState, useEffect } from 'react';

/**
 * Ensures a minimum loading/skeleton display time (e.g. 300ms) before revealing content.
 * Avoids skeleton "flash" when data loads very quickly.
 *
 * @param isReady - true when content is ready to show
 * @param minMs - minimum milliseconds to show loading state (default 300)
 * @returns true while we should show loading UI; false when ready and min time elapsed
 */
export function useMinLoading(isReady: boolean, minMs = 300): boolean {
  const [showLoading, setShowLoading] = useState(true);
  const [startedAt] = useState(() => Date.now());

  useEffect(() => {
    if (!isReady) {
      setShowLoading(true);
      return;
    }
    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(0, minMs - elapsed);
    if (remaining === 0) {
      setShowLoading(false);
      return;
    }
    const t = setTimeout(() => setShowLoading(false), remaining);
    return () => clearTimeout(t);
  }, [isReady, minMs, startedAt]);

  return !isReady || showLoading;
}
