/**
 * Firebase Storage utilities for compliance documents
 * 
 * Storage Path Convention:
 * listings/{listingId}/documents/{docId}/{filename}
 * orders/{orderId}/documents/{docId}/{filename}
 * seller-permits/{sellerId}/{docId}/{filename}
 *
 * Size limit: MAX_DOCUMENT_SIZE_BYTES (default 10 MB). Change here to adjust.
 */

import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from './config';
import { nanoid } from 'nanoid';

/** Max file size for compliance documents (10 MB). Change this constant to adjust the limit. */
export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;

export interface DocumentUploadProgress {
  progress: number; // 0-100
  state: 'running' | 'paused' | 'success' | 'error';
}

export interface DocumentUploadResult {
  url: string;
  path: string;
  documentId: string;
}

/**
 * Upload a compliance document to Firebase Storage
 * 
 * @param entityType - 'listing' or 'order'
 * @param entityId - The listing/order ID
 * @param file - The document file (PDF, image, etc.)
 * @param onProgress - Optional progress callback
 * @returns Promise with upload result
 */
export async function uploadComplianceDocument(
  entityType: 'listing' | 'order',
  entityId: string,
  file: File,
  onProgress?: (progress: DocumentUploadProgress) => void
): Promise<DocumentUploadResult> {
  try {
    if (typeof file.size === 'number' && file.size > MAX_DOCUMENT_SIZE_BYTES) {
      const err: any = new Error(`File too large; max ${MAX_DOCUMENT_SIZE_BYTES / (1024 * 1024)} MB`);
      err.code = 'FILE_TOO_LARGE';
      throw err;
    }
    // Generate unique document ID
    const documentId = nanoid();
    const fileExtension = file.name.split('.').pop()?.toLowerCase() || 'pdf';
    const fileName = `${documentId}.${fileExtension}`;

    // Create storage reference
    const storagePath = `${entityType}s/${entityId}/documents/${documentId}/${fileName}`;
    const storageRef = ref(storage, storagePath);

    // Determine content type
    let contentType = 'application/pdf';
    if (file.type.startsWith('image/')) {
      contentType = file.type;
    }

    // Upload with progress tracking
    const uploadTask = uploadBytesResumable(storageRef, file, {
      contentType,
    });

    // Set up progress tracking
    if (onProgress) {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          onProgress({
            progress,
            state: snapshot.state as 'running' | 'paused' | 'success' | 'error',
          });
        },
        (error) => {
          console.error('Document upload error:', error);
          onProgress({
            progress: 0,
            state: 'error',
          });
        },
        () => {
          onProgress({
            progress: 100,
            state: 'success',
          });
        }
      );
    }

    // Wait for upload to complete
    await uploadTask;

    // Get download URL
    const url = await getDownloadURL(uploadTask.snapshot.ref);

    return {
      url,
      path: storagePath,
      documentId,
    };
  } catch (error: any) {
    console.error('Error uploading compliance document:', error);
    
    if (error.code) {
      const enhancedError = new Error(error.message || 'Failed to upload document');
      (enhancedError as any).code = error.code;
      throw enhancedError;
    }
    
    throw error;
  }
}

/**
 * Upload a seller-level breeder permit document to Firebase Storage.
 *
 * Path: seller-permits/{sellerId}/{docId}/{filename}
 */
export async function uploadSellerPermitDocument(
  sellerId: string,
  file: File,
  onProgress?: (progress: DocumentUploadProgress) => void
): Promise<DocumentUploadResult> {
  try {
    if (typeof file.size === 'number' && file.size > MAX_DOCUMENT_SIZE_BYTES) {
      const err: any = new Error(`File too large; max ${MAX_DOCUMENT_SIZE_BYTES / (1024 * 1024)} MB`);
      err.code = 'FILE_TOO_LARGE';
      throw err;
    }
    const documentId = nanoid();
    const fileExtension = file.name.split('.').pop()?.toLowerCase() || 'pdf';
    const fileName = `${documentId}.${fileExtension}`;

    const storagePath = `seller-permits/${sellerId}/${documentId}/${fileName}`;
    const storageRef = ref(storage, storagePath);

    let contentType = 'application/pdf';
    if (file.type.startsWith('image/')) {
      contentType = file.type;
    }

    const uploadTask = uploadBytesResumable(storageRef, file, { contentType });

    if (onProgress) {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          onProgress({
            progress,
            state: snapshot.state as 'running' | 'paused' | 'success' | 'error',
          });
        },
        (error) => {
          console.error('Seller permit upload error:', error);
          onProgress({ progress: 0, state: 'error' });
        },
        () => {
          onProgress({ progress: 100, state: 'success' });
        }
      );
    }

    await uploadTask;
    const url = await getDownloadURL(uploadTask.snapshot.ref);

    return { url, path: storagePath, documentId };
  } catch (error: any) {
    console.error('Error uploading seller permit document:', error);
    // Firebase Storage uploads can fail with an opaque network error when bucket CORS is misconfigured.
    // Surface an actionable message for ops instead of a generic "failed" toast.
    const msg = String(error?.message || '');
    if (!error?.code && (msg.includes('ERR_FAILED') || msg.toLowerCase().includes('cors') || msg.toLowerCase().includes('preflight'))) {
      throw new Error(
        'Upload blocked by Storage CORS configuration. Ops: apply scripts/storage-cors.json to the bucket. See docs/FIREBASE_STORAGE_CORS_SETUP.md.'
      );
    }
    if (error.code) {
      const enhancedError = new Error(error.message || 'Failed to upload document');
      (enhancedError as any).code = error.code;
      throw enhancedError;
    }
    throw error;
  }
}

/**
 * Delete a compliance document from Firebase Storage
 * 
 * @param storagePath - The full storage path (e.g., "listings/{id}/documents/{docId}/{filename}")
 */
export async function deleteComplianceDocument(storagePath: string): Promise<void> {
  try {
    const storageRef = ref(storage, storagePath);
    await deleteObject(storageRef);
    console.log('✅ Document deleted from Storage:', storagePath);
  } catch (error: any) {
    console.error('Error deleting document from Storage:', error);
    // If file doesn't exist, that's okay - just log and continue
    if (error.code !== 'storage/object-not-found') {
      throw error;
    }
  }
}
