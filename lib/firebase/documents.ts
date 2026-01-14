/**
 * Document Management for Compliance
 * 
 * Handles upload, retrieval, and verification of compliance documents
 * (TPWD permits, transfer approvals, CVIs, etc.)
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './config';
import { ComplianceDocument, DocumentType, DocumentStatus } from '@/lib/types';

/**
 * Upload a compliance document
 */
export async function uploadDocument(params: {
  entityType: 'listing' | 'order';
  entityId: string;
  type: DocumentType;
  documentUrl: string;
  uploadedBy: string;
  permitNumber?: string;
  issuedBy?: string;
  issuedAt?: Date;
  expiresAt?: Date;
  metadata?: Record<string, any>;
}): Promise<string> {
  const { entityType, entityId, type, documentUrl, uploadedBy, permitNumber, issuedBy, issuedAt, expiresAt, metadata } = params;

  console.log('uploadDocument called with:', {
    entityType,
    entityId,
    type,
    documentUrl,
    uploadedBy,
    permitNumber,
  });

  const documentsRef = collection(db, `${entityType}s`, entityId, 'documents');
  
  // Build document data, only including defined fields
  const docData: Record<string, any> = {
    type,
    documentUrl,
    status: 'uploaded' as DocumentStatus,
    uploadedBy,
    uploadedAt: serverTimestamp(),
  };

  // Only include optional fields if they are defined
  if (permitNumber !== undefined && permitNumber !== null && permitNumber !== '') {
    docData.permitNumber = permitNumber;
  }
  if (issuedBy !== undefined && issuedBy !== null && issuedBy !== '') {
    docData.issuedBy = issuedBy;
  }
  if (issuedAt !== undefined && issuedAt !== null) {
    docData.issuedAt = Timestamp.fromDate(issuedAt);
  }
  if (expiresAt !== undefined && expiresAt !== null) {
    docData.expiresAt = Timestamp.fromDate(expiresAt);
  }
  if (metadata !== undefined && metadata !== null && Object.keys(metadata).length > 0) {
    docData.metadata = metadata;
  }

  console.log('Creating Firestore document with data:', docData);

  try {
    const docRef = await addDoc(documentsRef, docData);

    console.log('✅ Firestore document created successfully! ID:', docRef.id);
    console.log('Document path:', `${entityType}s/${entityId}/documents/${docRef.id}`);
    
    return docRef.id;
  } catch (error: any) {
    console.error('❌ Error creating Firestore document:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Get documents for an entity
 */
export async function getDocuments(
  entityType: 'listing' | 'order',
  entityId: string,
  type?: DocumentType
): Promise<ComplianceDocument[]> {
  const documentsRef = collection(db, `${entityType}s`, entityId, 'documents');
  
  let q;
  if (type) {
    // Filter by type only - sort client-side to avoid index requirement
    q = query(documentsRef, where('type', '==', type));
  } else {
    // No filter - get all documents, sort client-side
    q = query(documentsRef);
  }

  const snapshot = await getDocs(q);
  
  // Sort client-side by uploadedAt descending
  const docs = snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      uploadedAt: data.uploadedAt?.toDate() || new Date(),
      issuedAt: data.issuedAt?.toDate(),
      expiresAt: data.expiresAt?.toDate(),
      verifiedAt: data.verifiedAt?.toDate(),
    } as ComplianceDocument;
  });
  
  // Sort by uploadedAt descending
  docs.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
  
  return docs;
}

/**
 * Get a specific document
 */
export async function getDocument(
  entityType: 'listing' | 'order',
  entityId: string,
  documentId: string
): Promise<ComplianceDocument | null> {
  const docRef = doc(db, `${entityType}s`, entityId, 'documents', documentId);
  const docSnap = await getDoc(docRef);
  
  if (!docSnap.exists()) {
    return null;
  }

  const data = docSnap.data();
  return {
    id: docSnap.id,
    ...data,
    uploadedAt: data.uploadedAt?.toDate() || new Date(),
    issuedAt: data.issuedAt?.toDate(),
    expiresAt: data.expiresAt?.toDate(),
    verifiedAt: data.verifiedAt?.toDate(),
  } as ComplianceDocument;
}

/**
 * Check if entity has verified document of specific type
 */
export async function hasVerifiedDocument(
  entityType: 'listing' | 'order',
  entityId: string,
  type: DocumentType
): Promise<boolean> {
  const documents = await getDocuments(entityType, entityId, type);
  return documents.some(doc => doc.status === 'verified');
}

/**
 * Delete a document from Firestore
 */
export async function deleteDocument(
  entityType: 'listing' | 'order',
  entityId: string,
  documentId: string
): Promise<void> {
  const docRef = doc(db, `${entityType}s`, entityId, 'documents', documentId);
  await deleteDoc(docRef);
  console.log('✅ Document deleted from Firestore:', documentId);
}
