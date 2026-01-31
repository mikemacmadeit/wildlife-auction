/**
 * Firebase Realtime Database helpers for live delivery tracking.
 * Only initializes when NEXT_PUBLIC_FIREBASE_DATABASE_URL is set.
 */

import { ref as rtdbRef, set as rtdbSet, onValue as rtdbOnValue, off as rtdbOff, type DatabaseReference } from 'firebase/database';
import { rtdb } from './config';

export type RTDB = NonNullable<typeof rtdb>;

/**
 * Get the Realtime Database instance. Returns null if databaseURL is not configured.
 */
export function getDatabase(): RTDB | null {
  return rtdb ?? null;
}

/**
 * Create a reference to a path. Throws if RTDB is not configured.
 */
export function ref(path: string): DatabaseReference {
  const db = getDatabase();
  if (!db) throw new Error('Realtime Database is not configured. Set NEXT_PUBLIC_FIREBASE_DATABASE_URL.');
  return rtdbRef(db, path);
}

/**
 * Write data at the given path (overwrites). Only use when RTDB is configured.
 */
export async function set(path: string, value: object): Promise<void> {
  const db = getDatabase();
  if (!db) throw new Error('Realtime Database is not configured.');
  await rtdbSet(rtdbRef(db, path), value);
}

/**
 * Subscribe to value at path. Returns unsubscribe function.
 * No-op if RTDB is not configured (returns a no-op function).
 * Optional errorCallback is invoked if the subscription is canceled (e.g. permission denied).
 */
export function onValue(
  path: string,
  callback: (data: unknown) => void,
  errorCallback?: (error: Error) => void
): () => void {
  const db = getDatabase();
  if (!db) {
    return () => {};
  }
  const r = rtdbRef(db, path);
  rtdbOnValue(
    r,
    (snapshot) => {
      callback(snapshot.val());
    },
    errorCallback
  );
  return () => rtdbOff(r);
}

/**
 * Remove a listener (same ref as used in onValue).
 */
export function off(reference: DatabaseReference): void {
  rtdbOff(reference);
}
