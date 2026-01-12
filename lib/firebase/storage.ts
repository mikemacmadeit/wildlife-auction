/**
 * Firebase Storage utilities for listing images
 * 
 * Storage Path Convention:
 * listings/{listingId}/images/{imageId}.webp
 */

import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from './config';
import { nanoid } from 'nanoid';

export interface UploadProgress {
  progress: number; // 0-100
  state: 'running' | 'paused' | 'success' | 'error';
}

export interface UploadResult {
  url: string;
  path: string;
  imageId: string;
}

/**
 * Compress and convert image to WebP format
 * Max dimension: 2000px, Quality: 0.8
 */
async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_DIMENSION = 2000;
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions
        if (width > height) {
          if (width > MAX_DIMENSION) {
            height = (height * MAX_DIMENSION) / width;
            width = MAX_DIMENSION;
          }
        } else {
          if (height > MAX_DIMENSION) {
            width = (width * MAX_DIMENSION) / height;
            height = MAX_DIMENSION;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Convert to WebP
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to compress image'));
            }
          },
          'image/webp',
          0.8 // Quality
        );
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Upload a listing image to Firebase Storage
 * 
 * @param listingId - The listing ID (must exist in Firestore)
 * @param file - The image file to upload
 * @param onProgress - Optional progress callback
 * @returns Promise with upload result (url, path, imageId)
 */
export async function uploadListingImage(
  listingId: string,
  file: File,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadResult> {
  try {
    // Generate unique image ID
    const imageId = nanoid();
    const fileExtension = file.name.split('.').pop()?.toLowerCase() || 'webp';
    const fileName = `${imageId}.webp`; // Always save as WebP after compression

    // Compress image
    const compressedBlob = await compressImage(file);

    // Create storage reference
    const storagePath = `listings/${listingId}/images/${fileName}`;
    const storageRef = ref(storage, storagePath);

    // Upload with progress tracking
    const uploadTask = uploadBytesResumable(storageRef, compressedBlob, {
      contentType: 'image/webp',
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
          console.error('Upload error:', error);
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
      imageId,
    };
  } catch (error) {
    console.error('Error uploading listing image:', error);
    throw error;
  }
}

/**
 * Delete a listing image from Firebase Storage
 * 
 * @param storagePath - The storage path of the image to delete
 */
export async function deleteListingImage(storagePath: string): Promise<void> {
  try {
    const storageRef = ref(storage, storagePath);
    await deleteObject(storageRef);
  } catch (error: any) {
    // Ignore "not found" errors (image may already be deleted)
    if (error.code !== 'storage/object-not-found') {
      console.error('Error deleting listing image:', error);
      throw error;
    }
  }
}

/**
 * Delete all images for a listing
 * 
 * @param listingId - The listing ID
 * @param imagePaths - Array of storage paths to delete
 */
export async function deleteListingImages(listingId: string, imagePaths: string[]): Promise<void> {
  const deletePromises = imagePaths.map((path) => deleteListingImage(path));
  await Promise.allSettled(deletePromises);
}

/**
 * Get storage path from URL
 * Extracts the path from a Firebase Storage download URL
 */
export function getStoragePathFromUrl(url: string): string | null {
  try {
    // Firebase Storage URLs have the format:
    // https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{encodedPath}?alt=media&token=...
    const match = url.match(/\/o\/(.+?)\?/);
    if (match) {
      return decodeURIComponent(match[1]);
    }
    return null;
  } catch {
    return null;
  }
}
