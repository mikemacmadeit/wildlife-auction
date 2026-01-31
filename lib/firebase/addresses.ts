/**
 * Firestore helpers for saved addresses and checkout delivery selection.
 * Collection: users/{uid}/addresses/{addressId}
 * Doc: users/{uid}/checkout/current
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
  query,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';
import { db } from './config';
import type { SavedAddress, CheckoutCurrent } from '@/lib/types';

export type SavedAddressInput = Omit<
  SavedAddress,
  'id' | 'createdAt' | 'updatedAt'
>;

function getDb() {
  if (!db) throw new Error('Firebase not initialized');
  return db;
}

function toSavedAddress(id: string, data: DocumentData): SavedAddress {
  const toDate = (v: unknown): Date =>
    v instanceof Date ? v : (v as Timestamp)?.toDate?.() ?? new Date(0);
  return {
    id,
    label: String(data.label ?? ''),
    isDefault: Boolean(data.isDefault),
    formattedAddress: String(data.formattedAddress ?? ''),
    line1: String(data.line1 ?? ''),
    line2: data.line2 != null ? String(data.line2) : undefined,
    city: String(data.city ?? ''),
    state: String(data.state ?? ''),
    postalCode: String(data.postalCode ?? ''),
    country: String(data.country ?? 'US'),
    lat: Number(data.lat) || 0,
    lng: Number(data.lng) || 0,
    provider: (data.provider as 'google' | 'manual') || 'google',
    placeId: String(data.placeId ?? ''),
    notes: data.notes != null ? String(data.notes) : undefined,
    gateCode: data.gateCode != null ? String(data.gateCode) : undefined,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

/**
 * Get all saved addresses for a user, default first.
 */
export async function getAddresses(uid: string): Promise<SavedAddress[]> {
  const firestore = getDb();
  const ref = collection(firestore, 'users', uid, 'addresses');
  const q = query(ref, orderBy('updatedAt', 'desc'));
  const snap = await getDocs(q);
  const list = snap.docs.map((d) => toSavedAddress(d.id, d.data()));
  // Sort so default is first
  return list.sort((a, b) => (a.isDefault ? -1 : b.isDefault ? 1 : 0));
}

/** Remove undefined fields; Firestore does not accept undefined. */
function withoutUndefined<T extends Record<string, unknown>>(obj: T): { [K in keyof T]: T[K] extends undefined ? never : T[K] } {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as { [K in keyof T]: T[K] extends undefined ? never : T[K] };
}

/**
 * Save a new or existing address. If makeDefault is true, unset other defaults.
 */
export async function saveAddress(
  uid: string,
  address: SavedAddressInput,
  options?: { addressId?: string; makeDefault?: boolean }
): Promise<SavedAddress> {
  const firestore = getDb();
  const addressId =
    options?.addressId ??
    doc(collection(firestore, 'users', uid, 'addresses')).id;
  const now = serverTimestamp();
  const ref = doc(firestore, 'users', uid, 'addresses', addressId);

  const makeDefault = options?.makeDefault ?? address.isDefault;
  const payload = withoutUndefined({
    ...address,
    isDefault: makeDefault ? true : (address.isDefault ?? false),
    createdAt: now,
    updatedAt: now,
  });

  if (makeDefault) {
    const batch = writeBatch(firestore);
    const addressesRef = collection(firestore, 'users', uid, 'addresses');
    const all = await getDocs(query(addressesRef));
    all.docs.forEach((d) => {
      if (d.id !== addressId && d.data().isDefault)
        batch.update(d.ref, { isDefault: false, updatedAt: now });
    });
    batch.set(ref, payload, { merge: true });
    await batch.commit();
  } else {
    await setDoc(ref, payload, { merge: true });
  }

  const updated = await getDoc(ref);
  if (!updated.exists()) throw new Error('Failed to read saved address');
  return toSavedAddress(addressId, updated.data());
}

/**
 * Set the selected delivery address for checkout (users/{uid}/checkout/current).
 */
export async function setCheckoutDeliveryAddress(
  uid: string,
  addressId: string | null
): Promise<void> {
  const firestore = getDb();
  const ref = doc(firestore, 'users', uid, 'checkout', 'current');
  await setDoc(
    ref,
    {
      deliveryAddressId: addressId,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Get the current checkout delivery address selection.
 */
export async function getCheckoutDeliveryAddress(
  uid: string
): Promise<CheckoutCurrent | null> {
  const firestore = getDb();
  const ref = doc(firestore, 'users', uid, 'checkout', 'current');
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const d = snap.data();
  const updatedAt = (d.updatedAt as Timestamp)?.toDate?.() ?? new Date(0);
  return {
    deliveryAddressId: d.deliveryAddressId ?? null,
    updatedAt,
  };
}

/**
 * Get a single address by id (for order snapshot or display).
 */
export async function getAddressById(
  uid: string,
  addressId: string
): Promise<SavedAddress | null> {
  const firestore = getDb();
  const ref = doc(firestore, 'users', uid, 'addresses', addressId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return toSavedAddress(snap.id, snap.data());
}

/**
 * Delete a saved address.
 */
export async function deleteAddress(
  uid: string,
  addressId: string
): Promise<void> {
  const firestore = getDb();
  const ref = doc(firestore, 'users', uid, 'addresses', addressId);
  await deleteDoc(ref);
}
