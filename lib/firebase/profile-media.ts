/**
 * Profile media (avatar/logo) upload utilities.
 *
 * Storage path convention:
 *   users/{uid}/profile/avatar.jpg
 *
 * NOTE: `storage.rules` must allow public read for this path if we want buyers to see it.
 */

import { auth, storage } from '@/lib/firebase/config';
import { updateUserProfile } from '@/lib/firebase/users';
import { updateProfile } from 'firebase/auth';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';

type Rect = { width: number; height: number };

async function resizeToJpeg(file: File, maxDimension = 900, quality = 0.86): Promise<{ blob: Blob; rect: Rect }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Failed to load image'));
    el.src = dataUrl;
  });

  let w = img.width || 1;
  let h = img.height || 1;

  if (w > h) {
    if (w > maxDimension) {
      h = Math.round((h * maxDimension) / w);
      w = maxDimension;
    }
  } else {
    if (h > maxDimension) {
      w = Math.round((w * maxDimension) / h);
      h = maxDimension;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to create canvas context');
  ctx.drawImage(img, 0, 0, w, h);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('Failed to encode JPEG'));
      },
      'image/jpeg',
      quality
    );
  });

  return { blob, rect: { width: w, height: h } };
}

export async function uploadUserAvatar(
  file: File,
  onProgress?: (pct: number) => void
): Promise<{ downloadUrl: string; storagePath: string; width: number; height: number; bytes: number }> {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User must be authenticated');

    const { blob, rect } = await resizeToJpeg(file, 900, 0.86);
    const storagePath = `users/${user.uid}/profile/avatar.jpg`;
    const storageRef = ref(storage, storagePath);

    const task = uploadBytesResumable(storageRef, blob, {
      contentType: 'image/jpeg',
      cacheControl: 'public,max-age=3600',
    } as any);

    task.on(
      'state_changed',
      (snap) => {
        if (!onProgress) return;
        const pct = snap.totalBytes ? (snap.bytesTransferred / snap.totalBytes) * 100 : 0;
        onProgress(Math.max(0, Math.min(100, pct)));
      },
      () => {
        if (onProgress) onProgress(0);
      }
    );

    await task;
    const downloadUrlBase = await getDownloadURL(task.snapshot.ref);

    // Bust client caches even if the underlying token/path didn't change.
    const downloadUrl = downloadUrlBase.includes('?') ? `${downloadUrlBase}&v=${Date.now()}` : `${downloadUrlBase}?v=${Date.now()}`;

    return { downloadUrl, storagePath, width: rect.width, height: rect.height, bytes: blob.size };
  } catch (e: any) {
    const msg = String(e?.message || '');
    if (msg.includes('ERR_FAILED') || msg.toLowerCase().includes('cors') || msg.toLowerCase().includes('preflight')) {
      throw new Error(
        'Upload blocked by Storage CORS configuration. Ops: apply scripts/storage-cors.json to the bucket. See docs/FIREBASE_STORAGE_CORS_SETUP.md.'
      );
    }
    throw e;
  }
}

export async function setCurrentUserAvatarUrl(url: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('User must be authenticated');

  // Update Auth profile (best-effort; some providers may restrict fields).
  try {
    await updateProfile(user, { photoURL: url });
  } catch {
    // ignore
  }

  // Update Firestore user doc + publicProfiles mirror.
  await updateUserProfile(user.uid, { photoURL: url });
}

