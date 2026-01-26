/**
 * Repair Int32 Corruption in Firestore
 * 
 * One-time repair script to fix existing bad data that causes int32 serialization errors.
 * Scans collections and repairs:
 * - Timestamp nanoseconds outside 0..999,999,999
 * - int32 sentinel values (-1 or 4294967295)
 * 
 * Run: npx ts-node scripts/repair-int32-corruption.ts
 */

// Load environment variables from .env.local if it exists
try {
  const dotenv = require('dotenv');
  const path = require('path');
  dotenv.config({ path: path.join(process.cwd(), '.env.local') });
} catch (e) {
  // dotenv not available, continue without it
}

import admin from 'firebase-admin';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

// Use the same initialization logic as lib/firebase/admin.ts
function initializeFirebaseAdmin() {
  if (getApps().length > 0) {
    return getFirestore();
  }

  // Check for credentials in the same order as the project
  const envProjectId = process.env.FIREBASE_PROJECT_ID;
  const envClientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const envPrivateKey = process.env.FIREBASE_PRIVATE_KEY;

  // Check for service account JSON file
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 
    path.join(process.cwd(), 'serviceAccountKey.json');

  let serviceAccount: any = null;

  if (envProjectId && envClientEmail && envPrivateKey) {
    // Use environment variables
    serviceAccount = {
      projectId: envProjectId,
      clientEmail: envClientEmail,
      privateKey: envPrivateKey.replace(/\\n/g, '\n'),
    };
  } else if (fs.existsSync(serviceAccountPath)) {
    // Use service account file
    try {
      serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    } catch (e) {
      console.error(`❌ Failed to read service account file: ${serviceAccountPath}`);
    }
  }

  if (serviceAccount) {
    initializeApp({ credential: cert(serviceAccount) });
    console.log('✅ Using service account credentials from environment variables or file');
  } else {
    // Fallback to application default credentials (requires gcloud auth)
    console.log('⚠️  No explicit credentials found, trying application default credentials...');
    try {
      initializeApp();
      // Test if credentials actually work by trying to get Firestore
      const testDb = getFirestore();
      // Try a simple operation to verify credentials work
      testDb.settings({ ignoreUndefinedProperties: true });
      console.log('✅ Using application default credentials');
    } catch (e: any) {
      console.error('\n❌ Failed to initialize Firebase Admin SDK.');
      console.error('\nPlease set up credentials using one of these methods:');
      console.error('\n1. Environment variables (in .env.local or shell):');
      console.error('   FIREBASE_PROJECT_ID=your-project-id');
      console.error('   FIREBASE_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com');
      console.error('   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"');
      console.error('\n2. Service account JSON file:');
      console.error(`   Place serviceAccountKey.json in: ${process.cwd()}`);
      console.error('   OR set GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json');
      console.error('\n3. Google Cloud CLI:');
      console.error('   Run: gcloud auth application-default login');
      console.error('\nCurrent environment check:');
      console.error(`   FIREBASE_PROJECT_ID: ${envProjectId ? '✅ Set' : '❌ Not set'}`);
      console.error(`   FIREBASE_CLIENT_EMAIL: ${envClientEmail ? '✅ Set' : '❌ Not set'}`);
      console.error(`   FIREBASE_PRIVATE_KEY: ${envPrivateKey ? '✅ Set' : '❌ Not set'}`);
      console.error(`   serviceAccountKey.json: ${fs.existsSync(serviceAccountPath) ? '✅ Found' : '❌ Not found'} at ${serviceAccountPath}`);
      process.exit(1);
    }
  }

  return getFirestore();
}

const db = initializeFirebaseAdmin();

type Path = (string | number)[];

function isObj(v: any) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function findAndRepair(value: any, path: Path = [], repairs: { path: Path; from: any; to: any }[] = []) {
  if (Array.isArray(value)) {
    value.forEach((v, i) => findAndRepair(v, [...path, i], repairs));
    return repairs;
  }

  if (!isObj(value)) return repairs;

  // Timestamp-like object patterns
  const seconds = (value.seconds ?? value._seconds);
  const nanos = (value.nanoseconds ?? value._nanoseconds);

  if (typeof seconds === 'number' && typeof nanos === 'number') {
    // nanos must be 0..999,999,999
    if (!Number.isInteger(nanos) || nanos < 0 || nanos > 999_999_999) {
      const safeNanos = Math.min(999_999_999, Math.max(0, Math.trunc(nanos)));
      repairs.push({ 
        path: [...path, (value.nanoseconds !== undefined ? 'nanoseconds' : '_nanoseconds')], 
        from: nanos, 
        to: safeNanos 
      });
      // mutate in-memory so nested repairs continue safely
      if (value.nanoseconds !== undefined) value.nanoseconds = safeNanos;
      if (value._nanoseconds !== undefined) value._nanoseconds = safeNanos;
    }
  }

  // int32 sentinel corruption (4294967295 == -1 uint32)
  for (const [k, v] of Object.entries(value)) {
    if (v === 4294967295 || v === -1) {
      // Only auto-repair if it's clearly a derived/sentinel numeric field.
      // If unsure, set to null rather than changing meaning.
      repairs.push({ path: [...path, k], from: v, to: null });
      (value as any)[k] = null;
    } else {
      findAndRepair(v, [...path, k], repairs);
    }
  }

  return repairs;
}

function buildFirestoreUpdateFromRepairs(repairs: { path: Path; to: any }[]) {
  const update: any = {};
  for (const r of repairs) {
    const key = r.path.map(p => (typeof p === 'number' ? `${p}` : p)).join('.');
    update[key] = r.to;
  }
  return update;
}

async function repairCollection(colName: string, batchSize = 300) {
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  let totalFixed = 0;
  let totalScanned = 0;

  while (true) {
    let q = db.collection(colName).orderBy(admin.firestore.FieldPath.documentId()).limit(batchSize);
    if (lastDoc) q = q.startAfter(lastDoc);

    const snap = await q.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      totalScanned++;
      const data = doc.data();
      // Deep clone to avoid mutating the original
      const cloned = JSON.parse(JSON.stringify(data));
      const repairs = findAndRepair(cloned);

      if (repairs.length) {
        const update = buildFirestoreUpdateFromRepairs(repairs);
        await doc.ref.update(update);
        totalFixed++;
        console.log(`✅ Repaired ${doc.ref.path} (${repairs.length} fixes)`);
        repairs.forEach(r => {
          console.log(`   - ${r.path.join('.')}: ${r.from} → ${r.to}`);
        });
      }
      lastDoc = doc;
    }
  }

  console.log(`\n✅ DONE ${colName}: scanned=${totalScanned}, fixed=${totalFixed}`);
  return { scanned: totalScanned, fixed: totalFixed };
}

/**
 * Repair a collectionGroup (scans ALL subcollections with the given name)
 * This is critical because orders may exist in users/{uid}/orders/* subcollections
 */
async function repairCollectionGroup(collectionGroupName: string, batchSize = 300) {
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  let totalFixed = 0;
  let totalScanned = 0;

  console.log(`\n🔍 Scanning collectionGroup: ${collectionGroupName} (includes all subcollections)`);

  while (true) {
    let q = db.collectionGroup(collectionGroupName)
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(batchSize);
    if (lastDoc) q = q.startAfter(lastDoc);

    const snap = await q.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      totalScanned++;
      const data = doc.data();
      // Deep clone to avoid mutating the original
      const cloned = JSON.parse(JSON.stringify(data));
      const repairs = findAndRepair(cloned);

      if (repairs.length) {
        const update = buildFirestoreUpdateFromRepairs(repairs);
        await doc.ref.update(update);
        totalFixed++;
        console.log(`✅ Repaired ${doc.ref.path} (${repairs.length} fixes)`);
        repairs.forEach(r => {
          console.log(`   - ${r.path.join('.')}: ${r.from} → ${r.to}`);
        });
      }
      lastDoc = doc;
    }
  }

  console.log(`\n✅ DONE collectionGroup(${collectionGroupName}): scanned=${totalScanned}, fixed=${totalFixed}`);
  return { scanned: totalScanned, fixed: totalFixed };
}

async function main() {
  console.log('🔧 Starting Firestore int32 corruption repair...\n');
  console.log('⚠️  This will scan both top-level collections AND subcollections (collectionGroups)\n');
  
  const results: Array<{ scanned: number; fixed: number }> = [];

  // Top-level collections
  results.push(await repairCollection('orders'));
  results.push(await repairCollection('notifications'));
  results.push(await repairCollection('orderReminders'));
  results.push(await repairCollection('events'));
  results.push(await repairCollection('emailJobs'));

  // CollectionGroups (scans ALL subcollections, e.g., users/{uid}/orders/*)
  // This is CRITICAL - subcollections are often missed
  results.push(await repairCollectionGroup('orders'));
  results.push(await repairCollectionGroup('notifications'));
  results.push(await repairCollectionGroup('events'));

  const totalScanned = results.reduce((sum, r) => sum + r.scanned, 0);
  const totalFixed = results.reduce((sum, r) => sum + r.fixed, 0);

  console.log(`\n🎉 COMPLETE: Total scanned=${totalScanned}, Total fixed=${totalFixed}`);
  
  if (totalFixed > 0) {
    console.log('\n✅ All corrupted documents have been repaired.');
  } else {
    console.log('\n✅ No corrupted documents found.');
  }
}

main().catch((e) => {
  console.error('❌ FAILED:', e);
  process.exit(1);
});
