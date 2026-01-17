/**
 * Phase 1 (Uploads Library): user-scoped photo library utilities.
 *
 * Storage path convention:
 *   users/{uid}/uploads/{photoId}/original.jpg
 *
 * Firestore doc:
 *   users/{uid}/photos/{photoId}
 */

import { auth } from '@/lib/firebase/config';
import { db, storage } from '@/lib/firebase/config';
import { collection, doc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { nanoid } from 'nanoid';

export type UserPhotoDoc = {
  photoId: string;
  uid: string;
  storagePath: string;
  downloadUrl: string;
  createdAt: any;
  updatedAt: any;
  width?: number;
  height?: number;
  bytes?: number;
  contentType?: string;
  sha256?: string;
  tags?: string[];
  albumId?: string;
  usedInListingIds?: string[];
  status: 'active' | 'deleted';
};

export type UploadUserPhotoResult = {
  photoId: string;
  uid: string;
  storagePath: string;
  downloadUrl: string;
  width: number;
  height: number;
  bytes: number;
  contentType: string;
};

type Rect = { width: number; height: number };

async function resizeToJpeg(file: File, maxDimension = 2000, quality = 0.86): Promise<{ blob: Blob; rect: Rect }> {
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

export async function uploadUserPhoto(
  file: File,
  onProgress?: (pct: number) => void
): Promise<UploadUserPhotoResult> {
  const user = auth.currentUser;
  if (!user) throw new Error('User must be authenticated');

  const photoId = nanoid();
  const { blob, rect } = await resizeToJpeg(file);
  const storagePath = `users/${user.uid}/uploads/${photoId}/original.jpg`;
  const storageRef = ref(storage, storagePath);

  const task = uploadBytesResumable(storageRef, blob, { contentType: 'image/jpeg' });
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
  const downloadUrl = await getDownloadURL(task.snapshot.ref);

  const docRef = doc(db, 'users', user.uid, 'photos', photoId);
  const docData: UserPhotoDoc = {
    photoId,
    uid: user.uid,
    storagePath,
    downloadUrl,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    width: rect.width,
    height: rect.height,
    bytes: blob.size,
    contentType: 'image/jpeg',
    tags: [],
    status: 'active',
  };

  await setDoc(docRef, docData, { merge: true });

  return {
    photoId,
    uid: user.uid,
    storagePath,
    downloadUrl,
    width: rect.width,
    height: rect.height,
    bytes: blob.size,
    contentType: 'image/jpeg',
  };
}

export async function listUserPhotos(uid: string, opts?: { includeDeleted?: boolean }) {
  const refCol = collection(db, 'users', uid, 'photos');
  const includeDeleted = opts?.includeDeleted === true;

  function toMillisSafe(v: any): number {
    if (!v) return 0;
    if (typeof v?.toMillis === 'function') {
      try {
        return Number(v.toMillis()) || 0;
      } catch {
        return 0;
      }
    }
    if (typeof v?.toDate === 'function') {
      try {
        const d = v.toDate();
        return d instanceof Date ? d.getTime() : 0;
      } catch {
        return 0;
      }
    }
    if (typeof v?.seconds === 'number') return v.seconds * 1000;
    if (v instanceof Date) return v.getTime();
    return 0;
  }

  try {
    // Preferred: deterministic ordering (requires composite index when combined with where(status==active)).
    const q = includeDeleted
      ? query(refCol, orderBy('updatedAt', 'desc'))
      : query(refCol, where('status', '==', 'active'), orderBy('updatedAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as UserPhotoDoc);
  } catch (e: any) {
    // Fallback: avoid blocking uploads if the composite index is missing or still building.
    // NOTE: Firestore can require an index even when the collection is empty.
    if (e?.code === 'failed-precondition' || String(e?.message || '').includes('requires an index')) {
      const q2 = includeDeleted ? query(refCol) : query(refCol, where('status', '==', 'active'));
      const snap2 = await getDocs(q2);
      const docs = snap2.docs.map((d) => d.data() as UserPhotoDoc);
      docs.sort((a, b) => toMillisSafe(b.updatedAt) - toMillisSafe(a.updatedAt));
      return docs;
    }
    throw e;
  }
}

export async function softDeleteUserPhoto(uid: string, photoId: string): Promise<void> {
  const refDoc = doc(db, 'users', uid, 'photos', photoId);
  await updateDoc(refDoc, { status: 'deleted', updatedAt: serverTimestamp() });
}

export async function restoreUserPhoto(uid: string, photoId: string): Promise<void> {
  const refDoc = doc(db, 'users', uid, 'photos', photoId);
  await updateDoc(refDoc, { status: 'active', updatedAt: serverTimestamp() });
}

