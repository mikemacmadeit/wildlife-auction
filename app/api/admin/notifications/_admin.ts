import { getAdminDb } from '@/lib/firebase/admin';

export async function isAdminUid(uid: string): Promise<boolean> {
  const db = getAdminDb();
  const doc = await db.collection('users').doc(uid).get();
  const role = doc.exists ? (doc.data() as any)?.role : null;
  const superAdmin = doc.exists ? (doc.data() as any)?.superAdmin : null;
  return role === 'admin' || role === 'super_admin' || superAdmin === true;
}

