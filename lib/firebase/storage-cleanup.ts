/**
 * Server-only Storage cleanup helpers (FC-8).
 * Use from API routes when upload registration fails — delete uploaded paths best-effort.
 * Never throws; never crashes the request.
 */

import { getStorage } from 'firebase-admin/storage';

export function getStoragePathFromUrl(url: string): string | null {
  try {
    const match = String(url || '').match(/\/o\/(.+?)\?/);
    if (match) return decodeURIComponent(match[1]);
    return null;
  } catch {
    return null;
  }
}

/**
 * Delete the given Storage paths. Best-effort only; ignores not-found and other errors.
 * Never throws. Use when Firestore write fails after client upload (e.g. images/add, documents/upload).
 */
export async function deleteStoragePathsBestEffort(paths: string[]): Promise<void> {
  const bucket = getStorage().bucket();
  for (const p of paths) {
    if (!p || typeof p !== 'string') continue;
    try {
      await bucket.file(p).delete({ ignoreNotFound: true } as any);
    } catch (e: any) {
      // Best-effort; do not fail the request.
      console.warn('[storage-cleanup] Failed to delete path', p, e?.message || e);
    }
  }
}
