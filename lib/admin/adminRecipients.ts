import type { Firestore } from 'firebase-admin/firestore';

/**
 * List admin recipient UIDs for admin notifications.
 *
 * Uses indexed queries (no full scan):
 * - users where role in ['admin','super_admin']
 * - users where legacy superAdmin == true
 *
 * NOTE: We intentionally do NOT write Firestore index files; create indexes via console if prompted.
 */
export async function listAdminRecipientUids(db: Firestore): Promise<string[]> {
  const out = new Set<string>();

  try {
    const snap = await db.collection('users').where('role', 'in', ['admin', 'super_admin']).get();
    snap.docs.forEach((d) => out.add(d.id));
  } catch {
    // Ignore: environments without the index can still be usable via the superAdmin flag query below.
  }

  try {
    const snap = await db.collection('users').where('superAdmin', '==', true).get();
    snap.docs.forEach((d) => out.add(d.id));
  } catch {
    // Ignore: if both queries fail, caller should handle empty list gracefully.
  }

  return Array.from(out);
}

