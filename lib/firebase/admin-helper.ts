/**
 * Firebase Admin SDK Helper
 * 
 * This module provides helper functions for Firestore operations using Admin SDK.
 * It bypasses security rules, so it can be used for administrative tasks.
 * 
 * Prerequisites:
 * - serviceAccountKey.json must exist in project root
 * - OR set GOOGLE_APPLICATION_CREDENTIALS environment variable
 */

const admin = require('firebase-admin');
import * as path from 'path';
import * as fs from 'fs';

// Initialize Firebase Admin SDK if not already initialized
if (!admin.apps.length) {
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 
    path.join(process.cwd(), 'serviceAccountKey.json');
  
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } else {
    throw new Error(
      `Service account key not found at ${serviceAccountPath}. ` +
      `Please download it from Firebase Console > Project Settings > Service Accounts ` +
      `and save it as serviceAccountKey.json`
    );
  }
}

export const db = admin.firestore();

/**
 * Get a document from any collection
 */
export async function getDocument<T = any>(collection: string, docId: string): Promise<T | null> {
  const doc = await db.collection(collection).doc(docId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() } as T;
}

/**
 * Set/update a document in any collection
 */
export async function setDocument(collection: string, docId: string, data: any): Promise<void> {
  await db.collection(collection).doc(docId).set(data, { merge: true });
}

/**
 * Create a new document (auto-generated ID)
 */
export async function createDocument(collection: string, data: any): Promise<string> {
  const docRef = await db.collection(collection).add(data);
  return docRef.id;
}

/**
 * Update a document
 */
export async function updateDocument(collection: string, docId: string, updates: any): Promise<void> {
  await db.collection(collection).doc(docId).update(updates);
}

/**
 * Delete a document
 */
export async function deleteDocument(collection: string, docId: string): Promise<void> {
  await db.collection(collection).doc(docId).delete();
}

/**
 * Query documents from a collection
 */
export async function queryDocuments<T = any>(
  collection: string,
  constraints?: {
    where?: [string, FirebaseFirestore.WhereFilterOp, any][];
    orderBy?: [string, 'asc' | 'desc'][];
    limit?: number;
  }
): Promise<T[]> {
  let query: admin.firestore.Query = db.collection(collection);
  
  if (constraints?.where) {
    for (const [field, op, value] of constraints.where) {
      query = query.where(field, op, value);
    }
  }
  
  if (constraints?.orderBy) {
    for (const [field, direction] of constraints.orderBy) {
      query = query.orderBy(field, direction);
    }
  }
  
  if (constraints?.limit) {
    query = query.limit(constraints.limit);
  }
  
  const snapshot = await query.get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as T));
}

/**
 * Batch write operations
 */
export function batch(): admin.firestore.WriteBatch {
  return db.batch();
}

/**
 * Get Firestore server timestamp
 */
export function serverTimestamp(): admin.firestore.FieldValue {
  return admin.firestore.FieldValue.serverTimestamp();
}

/**
 * Check if Admin SDK is initialized
 */
export function isInitialized(): boolean {
  return admin.apps.length > 0;
}
