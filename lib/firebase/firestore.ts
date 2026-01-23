import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  Query,
  QueryConstraint,
  Timestamp,
  DocumentData,
  QueryDocumentSnapshot,
  addDoc,
} from 'firebase/firestore';
import { db } from './config';

let warnedFirestorePermissionDenied = false;
function isPermissionDenied(error: any) {
  const code = String(error?.code || '');
  const msg = String(error?.message || '');
  return (
    code === 'permission-denied' ||
    code === 'auth/permission-denied' ||
    msg.toLowerCase().includes('missing or insufficient permissions') ||
    msg.toLowerCase().includes('permission denied')
  );
}

function warnPermissionDeniedOnce(context: string, error: any) {
  if (warnedFirestorePermissionDenied) return;
  warnedFirestorePermissionDenied = true;
  console.warn(
    `[firestore] permission-denied (${context}). This usually means your deployed Firestore rules are out of sync with this repo. ` +
      `Deploy project/firestore.rules (or use the emulator).`,
    error
  );
}

function isPlainObject(value: any): boolean {
  if (!value) return false;
  if (typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Firestore does not allow `undefined` values. Strip them recursively from plain objects/arrays.
 * Important: only traverses plain objects so we don't corrupt Firestore SDK sentinels.
 */
function stripUndefinedDeep<T>(value: T): T {
  if (value === undefined) return undefined as any;

  if (Array.isArray(value)) {
    // Firestore also rejects undefined array elements.
    return value.filter((v) => v !== undefined).map((v) => stripUndefinedDeep(v)) as any;
  }

  if (isPlainObject(value)) {
    const out: any = {};
    for (const [k, v] of Object.entries(value as any)) {
      if (v === undefined) continue;
      out[k] = stripUndefinedDeep(v);
    }
    return out;
  }

  return value;
}

/**
 * Convert Firestore Timestamp values into JS Date recursively.
 * This prevents runtime crashes when UI code calls `.getTime()` or date-fns on Timestamp-like values.
 */
function convertTimestampsDeep<T>(value: T): T {
  // Timestamp (Firebase client)
  if (value instanceof Timestamp) {
    return value.toDate() as any;
  }

  // Arrays
  if (Array.isArray(value)) {
    return value.map((v) => convertTimestampsDeep(v)) as any;
  }

  // Plain objects only (avoid mutating DocumentReference and other SDK objects)
  if (isPlainObject(value)) {
    const out: any = {};
    for (const [k, v] of Object.entries(value as any)) {
      out[k] = convertTimestampsDeep(v);
    }
    return out;
  }

  return value;
}

/**
 * Generic function to get a document by ID
 */
export const getDocument = async <T = DocumentData>(
  collectionName: string,
  documentId: string
): Promise<T | null> => {
  try {
    const docRef = doc(db, collectionName, documentId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = convertTimestampsDeep(docSnap.data());
      return { id: docSnap.id, ...(data as any) } as T;
    }
    return null;
  } catch (error) {
    if (isPermissionDenied(error)) warnPermissionDeniedOnce(`getDocument(${collectionName}/${documentId})`, error);
    console.error(`Error getting document ${documentId}:`, error);
    throw error;
  }
};

/**
 * Generic function to get all documents from a collection
 */
export const getDocuments = async <T = DocumentData>(
  collectionName: string,
  constraints: QueryConstraint[] = []
): Promise<T[]> => {
  try {
    const collectionRef = collection(db, collectionName);
    let q: Query<DocumentData> = query(collectionRef, ...constraints);
    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...(convertTimestampsDeep(doc.data()) as any),
    })) as T[];
  } catch (error) {
    if (isPermissionDenied(error)) warnPermissionDeniedOnce(`getDocuments(${collectionName})`, error);
    console.error(`Error getting documents from ${collectionName}:`, error);
    throw error;
  }
};

/**
 * Create a new document
 */
export const createDocument = async <T = DocumentData>(
  collectionName: string,
  data: Omit<T, 'id'>
): Promise<string> => {
  try {
    const collectionRef = collection(db, collectionName);
    const docRef = await addDoc(collectionRef, {
      ...data,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    return docRef.id;
  } catch (error) {
    console.error(`Error creating document in ${collectionName}:`, error);
    throw error;
  }
};

/**
 * Update an existing document
 */
export const updateDocument = async <T = DocumentData>(
  collectionName: string,
  documentId: string,
  data: Partial<T>
): Promise<void> => {
  try {
    const docRef = doc(db, collectionName, documentId);
    const sanitized = stripUndefinedDeep({
      ...(data as any),
      updatedAt: Timestamp.now(),
    });
    await updateDoc(docRef, sanitized as any);
  } catch (error) {
    console.error(`Error updating document ${documentId}:`, error);
    throw error;
  }
};

/**
 * Set a document (creates if doesn't exist, updates if exists)
 */
export const setDocument = async <T = DocumentData>(
  collectionName: string,
  documentId: string,
  data: T,
  merge: boolean = false
): Promise<void> => {
  try {
    const docRef = doc(db, collectionName, documentId);
    const sanitized = stripUndefinedDeep({
      ...(data as any),
      updatedAt: Timestamp.now(),
    });
    await setDoc(docRef, sanitized as any, { merge });
  } catch (error) {
    console.error(`Error setting document ${documentId}:`, error);
    throw error;
  }
};

/**
 * Delete a document
 */
export const deleteDocument = async (
  collectionName: string,
  documentId: string
): Promise<void> => {
  try {
    const docRef = doc(db, collectionName, documentId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error(`Error deleting document ${documentId}:`, error);
    throw error;
  }
};

/**
 * Query helper functions
 */
export const queryHelpers = {
  where: (field: string, operator: any, value: any) => where(field, operator, value),
  orderBy: (field: string, direction: 'asc' | 'desc' = 'asc') => orderBy(field, direction),
  limit: (count: number) => limit(count),
  startAfter: (doc: QueryDocumentSnapshot) => startAfter(doc),
};

/**
 * Example usage for listings:
 * 
 * // Get all active listings
 * const listings = await getDocuments<Listing>('listings', [
 *   queryHelpers.where('status', '==', 'active'),
 *   queryHelpers.orderBy('createdAt', 'desc'),
 *   queryHelpers.limit(10),
 * ]);
 * 
 * // Get a single listing
 * const listing = await getDocument<Listing>('listings', listingId);
 * 
 * // Create a listing
 * const newListingId = await createDocument<Listing>('listings', {
 *   title: 'Example Listing',
 *   price: 1000,
 *   // ... other fields
 * });
 */
