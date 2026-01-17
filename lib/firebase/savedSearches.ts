import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from './config';
import type { FilterState } from '@/lib/types';

let warnedPermissions = false;
function handleListenerError(source: string, error: any, cb: (searches: SavedSearch[]) => void) {
  const code = String(error?.code || '');
  if (code === 'permission-denied') {
    if (!warnedPermissions) {
      warnedPermissions = true;
      console.warn(
        `[${source}] Firestore permission denied while subscribing to saved searches. ` +
          `This typically means your deployed Firestore rules are missing the /users/{uid}/savedSearches rule. ` +
          `Deploy firestore.rules (or point local dev at the emulator).`
      );
    }
    cb([]);
    return;
  }
  console.error(`${source} error:`, error);
  cb([]);
}

export type SavedSearchAlertFrequency = 'instant' | 'daily' | 'weekly' | 'off';

export type SavedSearchDoc = {
  name: string;
  criteria: FilterState;
  alertFrequency: SavedSearchAlertFrequency;
  channels: { inApp: boolean; email: boolean; push: boolean };
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastNotifiedAt?: Timestamp | null;
  // Simple index keys used by scheduled matchers (array-contains-any)
  keys: string[];
};

export type SavedSearch = SavedSearchDoc & { id: string };

export function buildSavedSearchKeys(criteria: FilterState): string[] {
  const keys: string[] = [];
  if (criteria.type) keys.push(`type:${criteria.type}`);
  if (criteria.category) keys.push(`category:${criteria.category}`);
  if (criteria.location?.state) keys.push(`state:${criteria.location.state}`);
  if (criteria.species && criteria.species.length > 0) keys.push(`species:${criteria.species[0]}`);
  // Ensure non-empty to avoid unusable docs
  if (keys.length === 0) keys.push('all');
  return Array.from(new Set(keys)).slice(0, 20);
}

export function subscribeSavedSearches(userId: string, cb: (searches: SavedSearch[]) => void): Unsubscribe {
  const ref = collection(db, 'users', userId, 'savedSearches');
  const q = query(ref, orderBy('updatedAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      const items: SavedSearch[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      cb(items);
    },
    (err) => handleListenerError('subscribeSavedSearches', err, cb)
  );
}

export async function upsertSavedSearch(userId: string, params: { id?: string; data: Omit<SavedSearchDoc, 'createdAt' | 'updatedAt'> }) {
  const ref = params.id
    ? doc(db, 'users', userId, 'savedSearches', params.id)
    : doc(collection(db, 'users', userId, 'savedSearches'));

  await setDoc(
    ref,
    {
      ...params.data,
      ...(params.id ? {} : { createdAt: serverTimestamp() }),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  return ref.id;
}

export async function deleteSavedSearch(userId: string, searchId: string) {
  await deleteDoc(doc(db, 'users', userId, 'savedSearches', searchId));
}

export async function getSavedSearch(userId: string, searchId: string): Promise<SavedSearch | null> {
  const snap = await getDoc(doc(db, 'users', userId, 'savedSearches', searchId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as any) } as SavedSearch;
}

