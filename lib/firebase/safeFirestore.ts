/**
 * Safe Firestore Wrapper
 * 
 * This module provides a drop-in replacement for Firestore operations that
 * AUTOMATICALLY sanitizes all payloads. Use these functions instead of
 * direct Firestore operations to guarantee no int32 serialization errors.
 * 
 * IMPORTANT: Always use these functions instead of direct .update(), .set(), .add()
 */

import { Firestore, DocumentReference, CollectionReference, WriteBatch, Transaction, SetOptions } from 'firebase-admin/firestore';
import { sanitizeFirestorePayload } from './sanitizeFirestore';
import { assertNoCorruptInt32 } from './assertNoCorruptInt32';
import { panicScanForBadInt32 } from './firestorePanic';

/**
 * Safe document update - automatically sanitizes payload
 */
export async function safeUpdate(
  docRef: DocumentReference,
  data: any,
  options?: { merge?: boolean }
): Promise<void> {
  const sanitized = sanitizeFirestorePayload(data);
  // Panic guard: throws with exact field path BEFORE Firestore serializes
  panicScanForBadInt32(sanitized);
  if (process.env.NODE_ENV !== 'production') {
    assertNoCorruptInt32(sanitized);
  }
  await docRef.update(sanitized);
}

/**
 * Safe document set - automatically sanitizes payload
 */
export async function safeSet(
  docRef: DocumentReference,
  data: any,
  options?: SetOptions
): Promise<void> {
  const sanitized = sanitizeFirestorePayload(data);
  // Panic guard: throws with exact field path BEFORE Firestore serializes
  panicScanForBadInt32(sanitized);
  if (process.env.NODE_ENV !== 'production') {
    assertNoCorruptInt32(sanitized);
  }
  if (options) {
    await docRef.set(sanitized, options);
  } else {
    await docRef.set(sanitized);
  }
}

/**
 * Safe document create - automatically sanitizes payload
 */
export async function safeCreate(
  docRef: DocumentReference,
  data: any
): Promise<void> {
  const sanitized = sanitizeFirestorePayload(data);
  // Panic guard: throws with exact field path BEFORE Firestore serializes
  panicScanForBadInt32(sanitized);
  if (process.env.NODE_ENV !== 'production') {
    assertNoCorruptInt32(sanitized);
  }
  await docRef.create(sanitized);
}

/**
 * Safe collection add - automatically sanitizes payload
 */
export async function safeAdd(
  collectionRef: CollectionReference,
  data: any
): Promise<DocumentReference> {
  const sanitized = sanitizeFirestorePayload(data);
  // Panic guard: throws with exact field path BEFORE Firestore serializes
  panicScanForBadInt32(sanitized);
  if (process.env.NODE_ENV !== 'production') {
    assertNoCorruptInt32(sanitized);
  }
  return collectionRef.add(sanitized);
}

/**
 * Safe batch update - automatically sanitizes payload
 */
export function safeBatchUpdate(
  batch: WriteBatch,
  docRef: DocumentReference,
  data: any
): WriteBatch {
  const sanitized = sanitizeFirestorePayload(data);
  if (process.env.NODE_ENV !== 'production') {
    assertNoCorruptInt32(sanitized);
  }
  return batch.update(docRef, sanitized);
}

/**
 * Safe batch set - automatically sanitizes payload
 */
export function safeBatchSet(
  batch: WriteBatch,
  docRef: DocumentReference,
  data: any,
  options?: SetOptions
): WriteBatch {
  const sanitized = sanitizeFirestorePayload(data);
  if (process.env.NODE_ENV !== 'production') {
    assertNoCorruptInt32(sanitized);
  }
  if (options) {
    return batch.set(docRef, sanitized, options);
  } else {
    return batch.set(docRef, sanitized);
  }
}

/**
 * Safe batch create - automatically sanitizes payload
 */
export function safeBatchCreate(
  batch: WriteBatch,
  docRef: DocumentReference,
  data: any
): WriteBatch {
  const sanitized = sanitizeFirestorePayload(data);
  if (process.env.NODE_ENV !== 'production') {
    assertNoCorruptInt32(sanitized);
  }
  return batch.create(docRef, sanitized);
}

/**
 * Safe transaction update - automatically sanitizes payload
 */
export function safeTransactionUpdate(
  transaction: Transaction,
  docRef: DocumentReference,
  data: any
): Transaction {
  const sanitized = sanitizeFirestorePayload(data);
  if (process.env.NODE_ENV !== 'production') {
    assertNoCorruptInt32(sanitized);
  }
  return transaction.update(docRef, sanitized);
}

/**
 * Safe transaction set - automatically sanitizes payload
 */
export function safeTransactionSet(
  transaction: Transaction,
  docRef: DocumentReference,
  data: any,
  options?: SetOptions
): Transaction {
  const sanitized = sanitizeFirestorePayload(data);
  // Panic guard: throws with exact field path BEFORE Firestore serializes
  panicScanForBadInt32(sanitized);
  if (process.env.NODE_ENV !== 'production') {
    assertNoCorruptInt32(sanitized);
  }
  if (options) {
    return transaction.set(docRef, sanitized, options);
  } else {
    return transaction.set(docRef, sanitized);
  }
}

/**
 * Safe transaction create - automatically sanitizes payload
 */
export function safeTransactionCreate(
  transaction: Transaction,
  docRef: DocumentReference,
  data: any
): Transaction {
  const sanitized = sanitizeFirestorePayload(data);
  if (process.env.NODE_ENV !== 'production') {
    assertNoCorruptInt32(sanitized);
  }
  return transaction.create(docRef, sanitized);
}
