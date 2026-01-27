/**
 * One-off script: delete Stripe-risky test listings from Firestore
 *
 * Removes listings created by test users that are problematic for payment
 * processor review (e.g. Lion, zebra). These were not from mock/seed data.
 *
 * Run with: npx tsx scripts/delete-stripe-risky-listings.ts [--dry-run]
 *
 * Prerequisites:
 * - Firebase Admin SDK (same as seed-listings-admin)
 * - GOOGLE_APPLICATION_CREDENTIALS or project/serviceAccountKey.json
 *
 * --dry-run  List matching listings only; do not delete.
 */

const admin = require('firebase-admin');
import * as path from 'path';
import * as fs from 'fs';

const dryRun = process.argv.includes('--dry-run');

const TITLES_TO_DELETE = ['Lion', 'Frank the Zebro'] as const;

function shouldDelete(title: string): boolean {
  const t = (title || '').trim();
  return TITLES_TO_DELETE.some((s) => t === s);
}

async function main() {
  if (!admin.apps.length) {
    const serviceAccountPath =
      process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, '../serviceAccountKey.json');
    if (fs.existsSync(serviceAccountPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } else {
      try {
        admin.initializeApp({
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'wildlife-exchange',
        });
      } catch (e) {
        console.error('❌ Could not initialize Firebase Admin. Set GOOGLE_APPLICATION_CREDENTIALS or use serviceAccountKey.json');
        process.exit(1);
      }
    }
  }

  const db = admin.firestore();
  const snapshot = await db.collection('listings').get();
  const toDelete = snapshot.docs.filter((d) => shouldDelete((d.data() as { title?: string }).title));

  if (toDelete.length === 0) {
    console.log('No listings matched titles:', TITLES_TO_DELETE.join(', '));
    return;
  }

  console.log(`Found ${toDelete.length} listing(s) to remove (titles: ${TITLES_TO_DELETE.join(', ')}):`);
  toDelete.forEach((d) => {
    const data = d.data() as { title?: string; status?: string };
    console.log(`  - ${d.id}  "${data.title ?? ''}"  status=${data.status ?? '?'}`);
  });

  if (dryRun) {
    console.log('\n[--dry-run] No deletions performed. Run without --dry-run to delete.');
    return;
  }

  const batch = db.batch();
  toDelete.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  console.log(`\nDeleted ${toDelete.length} listing(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
