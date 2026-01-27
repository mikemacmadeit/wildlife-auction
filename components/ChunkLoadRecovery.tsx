'use client';

import { useEffect } from 'react';

const CHUNK_RELOAD_KEY = 'chunk-reload-at';

function isChunkLoadError(msg: string, err?: { name?: string; message?: string } | null): boolean {
  const s = (msg ?? '') + (err?.message ?? '') + (err?.name ?? '');
  return (
    s.includes('ChunkLoadError') ||
    s.includes('Loading chunk') ||
    s.includes('Loading CSS chunk') ||
    err?.name === 'ChunkLoadError'
  );
}

function tryReloadForChunkError(): void {
  try {
    const last = sessionStorage.getItem(CHUNK_RELOAD_KEY);
    const lastAt = last ? parseInt(last, 10) : 0;
    if (Date.now() - lastAt < 30_000) return;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
  window.location.reload();
}

/**
 * On ChunkLoadError (e.g. after deploy, stale HTML references old chunk URLs that 404),
 * trigger a full reload so the user gets fresh HTML and new chunk URLs.
 * Limits to one reload per 30s to avoid loops.
 */
export function ChunkLoadRecovery() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      if (isChunkLoadError(e.message ?? '', e.error)) tryReloadForChunkError();
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const err = e.reason;
      const msg = typeof err === 'object' && err && 'message' in err ? String((err as Error).message) : String(err);
      if (isChunkLoadError(msg, typeof err === 'object' && err ? (err as Error) : null)) tryReloadForChunkError();
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
  return null;
}
