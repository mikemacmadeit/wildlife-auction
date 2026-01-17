/**
 * POST /api/listings/[id]/delete
 *
 * Authenticated seller-only (or admin): deletes a listing from Firestore and best-effort cleans up
 * any listing-owned Storage files + listing documents subcollection.
 *
 * Notes:
 * - This DOES NOT delete user upload-library photos (users/{uid}/uploads/...). Only paths under listings/{listingId}/...
 * - Firestore does not cascade-delete subcollections; we explicitly delete listings/{id}/documents first.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getStorage } from 'firebase-admin/storage';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';

function json(body: any, init?: { status?: number }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

function isAdminClaims(decoded: any): boolean {
  const role = decoded?.role;
  const superAdmin = decoded?.superAdmin === true;
  return role === 'admin' || role === 'super_admin' || superAdmin;
}

async function isAdminUserDoc(db: FirebaseFirestore.Firestore, uid: string): Promise<boolean> {
  try {
    const snap = await db.collection('users').doc(uid).get();
    const data = snap.exists ? (snap.data() as any) : null;
    const role = data?.role;
    const superAdmin = data?.superAdmin === true;
    return role === 'admin' || role === 'super_admin' || superAdmin;
  } catch {
    return false;
  }
}

function getStoragePathFromUrl(url: string): string | null {
  try {
    const match = String(url || '').match(/\/o\/(.+?)\?/);
    if (match) return decodeURIComponent(match[1]);
    return null;
  } catch {
    return null;
  }
}

async function deleteStoragePathIfExists(path: string) {
  try {
    const bucket = getStorage().bucket();
    await bucket.file(path).delete({ ignoreNotFound: true } as any);
  } catch (e: any) {
    // Best-effort cleanup; don't fail the whole deletion on Storage flakiness.
    console.warn('[listings.delete] Failed to delete storage path', path, e?.message || e);
  }
}

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const listingId = String(ctx?.params?.id || '').trim();
  if (!listingId) return json({ ok: false, error: 'Missing listing id' }, { status: 400 });

  let auth: ReturnType<typeof getAdminAuth>;
  let db: ReturnType<typeof getAdminDb>;
  try {
    auth = getAdminAuth();
    db = getAdminDb();
  } catch (e: any) {
    return json({ ok: false, error: 'Server not configured', message: e?.message }, { status: 503 });
  }

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const token = authHeader.slice('Bearer '.length);

  let decoded: any;
  try {
    decoded = await auth.verifyIdToken(token);
  } catch {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const uid = decoded?.uid as string | undefined;
  if (!uid) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const listingRef = db.collection('listings').doc(listingId);
  const snap = await listingRef.get();
  if (!snap.exists) return json({ ok: false, error: 'Listing not found' }, { status: 404 });

  const listing = snap.data() as any;
  const sellerId = String(listing?.sellerId || '');
  const requesterIsAdmin = isAdminClaims(decoded) || (await isAdminUserDoc(db, uid));

  if (!sellerId) return json({ ok: false, error: 'Listing is missing sellerId' }, { status: 400 });
  if (!requesterIsAdmin && sellerId !== uid) return json({ ok: false, error: 'Forbidden' }, { status: 403 });

  // 1) Delete listing documents subcollection docs and any listing-owned Storage files they reference.
  try {
    const docsSnap = await listingRef.collection('documents').get();
    const batch = db.batch();
    for (const d of docsSnap.docs) {
      const data = d.data() as any;
      const url = typeof data?.documentUrl === 'string' ? data.documentUrl : null;
      const storagePath = url ? getStoragePathFromUrl(url) : null;
      if (storagePath && storagePath.startsWith(`listings/${listingId}/documents/`)) {
        await deleteStoragePathIfExists(storagePath);
      }
      batch.delete(d.ref);
    }
    if (docsSnap.size > 0) await batch.commit();
  } catch (e: any) {
    console.warn('[listings.delete] Failed to cleanup listing documents subcollection', e?.message || e);
  }

  // 2) Delete listing-owned images (best-effort): only paths under listings/{id}/images/*
  const urls: string[] = [];
  if (Array.isArray(listing?.images)) {
    for (const u of listing.images) if (typeof u === 'string') urls.push(u);
  }
  if (Array.isArray(listing?.photos)) {
    for (const p of listing.photos) if (typeof p?.url === 'string') urls.push(p.url);
  }
  const uniqueUrls = Array.from(new Set(urls));
  for (const u of uniqueUrls) {
    const storagePath = getStoragePathFromUrl(u);
    if (storagePath && storagePath.startsWith(`listings/${listingId}/images/`)) {
      await deleteStoragePathIfExists(storagePath);
    }
  }

  // 3) Delete the listing doc (no cascade).
  await listingRef.delete();

  // 4) Optional: create an audit marker for internal ops (best-effort, non-blocking).
  try {
    await db.collection('auditLogs').add({
      action: 'listing_deleted',
      listingId,
      sellerId,
      actorId: uid,
      actorIsAdmin: requesterIsAdmin,
      createdAt: Timestamp.now(),
    });
  } catch {
    // ignore
  }

  return json({ ok: true });
}

