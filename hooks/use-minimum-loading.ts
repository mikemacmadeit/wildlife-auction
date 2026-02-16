'use client';

import { useEffect, useState } from 'react';

const DEFAULT_MIN_MS = 300;

/**
 * Returns true until both:
 * - loading has become false, and
 * - at least minMs have elapsed since the first time loading was true.
 * Use to avoid skeleton flash when data loads very quickly.
 */
export function useMinimumLoading(loading: boolean, minMs: number = DEFAULT_MIN_MS): boolean {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [showLoading, setShowLoading] = useState(loading);

  useEffect(() => {
    if (loading) {
      if (startedAt === null) setStartedAt(Date.now());
      setShowLoading(true);
      return;
    }
    if (startedAt === null) {
      setShowLoading(false);
      return;
    }
    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(0, minMs - elapsed);
    const t = setTimeout(() => {
      setShowLoading(false);
      setStartedAt(null);
    }, remaining);
    return () => clearTimeout(t);
  }, [loading, minMs, startedAt]);

  return showLoading;
}
