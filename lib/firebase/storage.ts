import {
  ref,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  UploadResult,
  UploadTask,
} from 'firebase/storage';
import { storage } from './config';

/**
 * Upload a file to Firebase Storage
 */
export const uploadFile = async (
  path: string,
  file: File | Blob,
  metadata?: { contentType?: string; customMetadata?: Record<string, string> }
): Promise<UploadResult> => {
  try {
    const storageRef = ref(storage, path);
    return await uploadBytes(storageRef, file, metadata);
  } catch (error) {
    console.error(`Error uploading file to ${path}:`, error);
    throw error;
  }
};

/**
 * Upload a file with progress tracking
 */
export const uploadFileWithProgress = (
  path: string,
  file: File | Blob,
  onProgress?: (progress: number) => void,
  metadata?: { contentType?: string; customMetadata?: Record<string, string> }
): UploadTask => {
  try {
    const storageRef = ref(storage, path);
    const uploadTask = uploadBytesResumable(storageRef, file, metadata);

    if (onProgress) {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          onProgress(progress);
        },
        (error) => {
          console.error('Upload error:', error);
          throw error;
        }
      );
    }

    return uploadTask;
  } catch (error) {
    console.error(`Error uploading file to ${path}:`, error);
    throw error;
  }
};

/**
 * Get download URL for a file
 */
export const getFileURL = async (path: string): Promise<string> => {
  try {
    const storageRef = ref(storage, path);
    return await getDownloadURL(storageRef);
  } catch (error) {
    console.error(`Error getting download URL for ${path}:`, error);
    throw error;
  }
};

/**
 * Delete a file from Firebase Storage
 */
export const deleteFile = async (path: string): Promise<void> => {
  try {
    const storageRef = ref(storage, path);
    await deleteObject(storageRef);
  } catch (error) {
    console.error(`Error deleting file ${path}:`, error);
    throw error;
  }
};

/**
 * Upload listing images
 * Helper function specifically for listing images
 */
export const uploadListingImage = async (
  listingId: string,
  file: File,
  imageIndex: number,
  onProgress?: (progress: number) => void
): Promise<string> => {
  const fileExtension = file.name.split('.').pop();
  const path = `listings/${listingId}/image-${imageIndex}.${fileExtension}`;

  if (onProgress) {
    const uploadTask = uploadFileWithProgress(
      path,
      file,
      onProgress,
      {
        contentType: file.type,
        customMetadata: {
          listingId,
          imageIndex: imageIndex.toString(),
          uploadedAt: new Date().toISOString(),
        },
      }
    );

    await uploadTask;
    return await getFileURL(path);
  } else {
    await uploadFile(path, file, {
      contentType: file.type,
      customMetadata: {
        listingId,
        imageIndex: imageIndex.toString(),
        uploadedAt: new Date().toISOString(),
      },
    });
    return await getFileURL(path);
  }
};

/**
 * Delete listing images
 */
export const deleteListingImages = async (
  listingId: string,
  imagePaths: string[]
): Promise<void> => {
  try {
    await Promise.all(
      imagePaths.map((path) => deleteFile(`listings/${listingId}/${path}`))
    );
  } catch (error) {
    console.error(`Error deleting listing images for ${listingId}:`, error);
    throw error;
  }
};
