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
      return { id: docSnap.id, ...docSnap.data() } as T;
    }
    return null;
  } catch (error) {
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
      ...doc.data(),
    })) as T[];
  } catch (error) {
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
    await updateDoc(docRef, {
      ...data,
      updatedAt: Timestamp.now(),
    });
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
  data: T
): Promise<void> => {
  try {
    const docRef = doc(db, collectionName, documentId);
    await setDoc(docRef, {
      ...data,
      updatedAt: Timestamp.now(),
    });
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
