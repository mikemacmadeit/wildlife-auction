/**
 * Message attachment uploads (Firebase Storage)
 *
 * Storage Path:
 * messageThreads/{threadId}/attachments/{attachmentId}/{filename}
 *
 * NOTE:
 * - Storage rules gate access to buyer/seller participants of the thread.
 * - Uploads are client-side; message creation still goes through the server route.
 */

'use client';

import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from './config';
import { nanoid } from 'nanoid';
import type { MessageAttachment } from '@/lib/types';

export interface UploadProgress {
  progress: number; // 0-100
  state: 'running' | 'paused' | 'success' | 'error';
}

async function compressImageToWebp(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_DIMENSION = 2000;
        let width = img.width;
        let height = img.height;

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

        canvas.width = Math.max(1, Math.round(width));
        canvas.height = Math.max(1, Math.round(height));

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to compress image'));
              return;
            }
            resolve({ blob, width: canvas.width, height: canvas.height });
          },
          'image/webp',
          0.82
        );
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function safeFileName(input: string): string {
  const name = String(input || 'upload.webp');
  // Prevent path traversal and weird separators in Storage paths.
  return name.replace(/[\\\/]/g, '_').slice(0, 120);
}

export async function uploadMessageImageAttachment(
  threadId: string,
  file: File,
  onProgress?: (p: UploadProgress) => void
): Promise<MessageAttachment> {
  if (!threadId) throw new Error('Missing threadId');
  if (!file) throw new Error('Missing file');

  // Basic client-side validation (rules + server validation still apply)
  if (!String(file.type || '').startsWith('image/')) {
    const err: any = new Error('Only image attachments are supported');
    err.code = 'UNSUPPORTED_ATTACHMENT_TYPE';
    throw err;
  }
  const maxBytes = 10 * 1024 * 1024; // 10MB
  if (typeof file.size === 'number' && file.size > maxBytes) {
    const err: any = new Error('Image is too large (max 10MB)');
    err.code = 'ATTACHMENT_TOO_LARGE';
    throw err;
  }

  const attachmentId = nanoid();
  const { blob, width, height } = await compressImageToWebp(file);
  const fileName = safeFileName(`${attachmentId}.webp`);
  const path = `messageThreads/${threadId}/attachments/${attachmentId}/${fileName}`;

  const storageRef = ref(storage, path);
  const uploadTask = uploadBytesResumable(storageRef, blob, { contentType: 'image/webp' });

  if (onProgress) {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = snapshot.totalBytes ? (snapshot.bytesTransferred / snapshot.totalBytes) * 100 : 0;
        onProgress({
          progress,
          state: snapshot.state as 'running' | 'paused' | 'success' | 'error',
        });
      },
      () => {
        onProgress({ progress: 0, state: 'error' });
      },
      () => {
        onProgress({ progress: 100, state: 'success' });
      }
    );
  }

  await uploadTask;
  const url = await getDownloadURL(uploadTask.snapshot.ref);

  return {
    id: attachmentId,
    kind: 'image',
    url,
    contentType: 'image/webp',
    sizeBytes: blob.size,
    width,
    height,
    name: file.name ? safeFileName(file.name) : undefined,
  };
}

