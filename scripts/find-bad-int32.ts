/**
 * Find Bad Int32 Values in Firestore
 * 
 * Scans Firestore collections for documents containing:
 * - nanoseconds: -1 or _nanoseconds: -1
 * - Other int32 values that could cause serialization errors
 * 
 * Run: npx ts-node scripts/find-bad-int32.ts
 */

import admin from 'firebase-admin';
import { getApps } from 'firebase-admin/app';

if (!getApps().length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();

interface BadField {
  path: string;
  value: any;
  type: 'nanoseconds' | 'limit' | 'count' | 'other';
}

function hasBadNanoseconds(obj: any, path: string[] = []): BadField[] {
  const hits: BadField[] = [];
  if (!obj || typeof obj !== 'object') return hits;

  // Check for direct timestamp-like object
  const ns = obj.nanoseconds ?? obj._nanoseconds;
  if (ns === -1 || ns === 4294967295) {
    hits.push({
      path: path.join('.') || '(root)',
      value: ns,
      type: 'nanoseconds',
    });
  }

  // Check for other suspicious int32 values
  if (typeof obj === 'number' && (obj === -1 || obj === 4294967295)) {
    hits.push({
      path: path.join('.') || '(root)',
      value: obj,
      type: 'other',
    });
  }

  // Recurse into arrays and objects
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => {
      hits.push(...hasBadNanoseconds(v, [...path, String(i)]));
    });
  } else {
    for (const [k, v] of Object.entries(obj)) {
      // Skip Firestore special types (they handle their own serialization)
      if (v && typeof v === 'object' && v.constructor?.name?.includes('Timestamp')) {
        continue;
      }
      hits.push(...hasBadNanoseconds(v, [...path, k]));
    }
  }

  return hits;
}

async function scanCollection(collectionName: string, limit: number = 2000) {
  console.log(`\n🔍 Scanning collection: ${collectionName} (limit: ${limit})`);
  const snap = await db.collection(collectionName).limit(limit).get();
  let badDocCount = 0;
  const allHits: Array<{ docPath: string; fields: BadField[] }> = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const hits = hasBadNanoseconds(data);
    if (hits.length > 0) {
      badDocCount++;
      allHits.push({ docPath: doc.ref.path, fields: hits });
      console.log(`❌ BAD DOC: ${doc.ref.path}`);
      hits.forEach((h) => {
        console.log(`   - ${h.path}: ${h.value} (${h.type})`);
      });
    }
  }

  console.log(`   Total docs scanned: ${snap.size}`);
  console.log(`   Bad docs found: ${badDocCount}`);
  return { badDocCount, allHits };
}

async function main() {
  console.log('🔍 Scanning Firestore for bad int32 values...\n');

  const collections = ['orders', 'events', 'emailJobs', 'orderReminders'];
  let totalBad = 0;

  for (const coll of collections) {
    try {
      const result = await scanCollection(coll, 2000);
      totalBad += result.badDocCount;
    } catch (error: any) {
      console.error(`   ⚠️  Error scanning ${coll}:`, error.message);
    }
  }

  console.log(`\n✅ Scan complete. Total bad documents: ${totalBad}`);
  
  if (totalBad > 0) {
    console.log('\n⚠️  ACTION REQUIRED: Run scripts/repair-bad-int32.ts to fix these documents.');
  } else {
    console.log('\n✅ No bad documents found. The issue may be in code paths that create new bad data.');
  }
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
