/**
 * Repair Bad Int32 Values in Firestore
 * 
 * Fixes documents containing nanoseconds: -1 or _nanoseconds: -1
 * by converting them to valid Firestore Timestamps or removing corrupted fields.
 * 
 * Run: npx ts-node scripts/repair-bad-int32.ts
 */

import admin from 'firebase-admin';
import { getApps, Timestamp } from 'firebase-admin/firestore';

if (!getApps().length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();

/**
 * Recursively repair bad nanoseconds in an object
 */
function repairBadNanoseconds(obj: any, path: string[] = []): { fixed: boolean; repaired: any } {
  if (!obj || typeof obj !== 'object') {
    return { fixed: false, repaired: obj };
  }

  let fixed = false;
  const repaired: any = Array.isArray(obj) ? [] : {};

  // Check for timestamp-like object with bad nanoseconds
  if (typeof obj.seconds === 'number' || typeof obj._seconds === 'number') {
    const seconds = obj.seconds ?? obj._seconds;
    const nanoseconds = obj.nanoseconds ?? obj._nanoseconds;

    if (nanoseconds === -1 || nanoseconds === 4294967295) {
      // Repair: create valid Timestamp
      const safeNanos = 0; // Reset to 0 (or use seconds * 1000 to create from millis if available)
      const safeSeconds = Math.trunc(seconds);
      
      // If we have seconds, create Timestamp from seconds (nanos = 0)
      if (typeof safeSeconds === 'number' && Number.isFinite(safeSeconds) && safeSeconds >= 0) {
        return {
          fixed: true,
          repaired: Timestamp.fromMillis(safeSeconds * 1000), // Convert to millis then back to Timestamp
        };
      }
      
      // If seconds are also bad, return null (field will be deleted)
      return { fixed: true, repaired: null };
    }
  }

  // Recurse into arrays and objects
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const result = repairBadNanoseconds(obj[i], [...path, String(i)]);
      if (result.fixed) fixed = true;
      repaired.push(result.repaired);
    }
  } else {
    for (const [k, v] of Object.entries(obj)) {
      // Skip Firestore special types
      if (v && typeof v === 'object' && v.constructor?.name?.includes('Timestamp')) {
        repaired[k] = v;
        continue;
      }
      
      const result = repairBadNanoseconds(v, [...path, k]);
      if (result.fixed) fixed = true;
      // Only include field if repaired value is not null (null means delete)
      if (result.repaired !== null) {
        repaired[k] = result.repaired;
      }
    }
  }

  return { fixed, repaired };
}

async function repairCollection(collectionName: string, dryRun: boolean = true) {
  console.log(`\n🔧 ${dryRun ? '[DRY RUN]' : '[REPAIRING]'} Collection: ${collectionName}`);
  
  const snap = await db.collection(collectionName).limit(1000).get();
  let repairedCount = 0;
  let errorCount = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const result = repairBadNanoseconds(data);

    if (result.fixed) {
      console.log(`   📝 ${doc.ref.path}: needs repair`);
      
      if (!dryRun) {
        try {
          // Remove null fields (deleted) and update with repaired values
          const updateData: any = {};
          const deleteFields: any = {};
          
          function extractUpdates(obj: any, prefix = '') {
            for (const [k, v] of Object.entries(obj)) {
              const fieldPath = prefix ? `${prefix}.${k}` : k;
              if (v === null) {
                deleteFields[fieldPath] = admin.firestore.FieldValue.delete();
              } else if (v instanceof Timestamp) {
                updateData[fieldPath] = v;
              } else if (typeof v === 'object' && !Array.isArray(v)) {
                extractUpdates(v, fieldPath);
              } else {
                updateData[fieldPath] = v;
              }
            }
          }
          
          extractUpdates(result.repaired);
          
          // Apply updates and deletes
          if (Object.keys(updateData).length > 0 || Object.keys(deleteFields).length > 0) {
            await doc.ref.update({ ...updateData, ...deleteFields });
            repairedCount++;
            console.log(`      ✅ Repaired`);
          }
        } catch (error: any) {
          errorCount++;
          console.error(`      ❌ Error: ${error.message}`);
        }
      }
    }
  }

  console.log(`   Total scanned: ${snap.size}`);
  console.log(`   ${dryRun ? 'Would repair' : 'Repaired'}: ${repairedCount}`);
  if (errorCount > 0) {
    console.log(`   Errors: ${errorCount}`);
  }

  return { repairedCount, errorCount };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made. Add --execute to actually repair.\n');
  } else {
    console.log('⚠️  EXECUTE MODE - Documents will be modified!\n');
  }

  const collections = ['orders', 'orderReminders'];
  let totalRepaired = 0;

  for (const coll of collections) {
    try {
      const result = await repairCollection(coll, dryRun);
      totalRepaired += result.repairedCount;
    } catch (error: any) {
      console.error(`   ⚠️  Error processing ${coll}:`, error.message);
    }
  }

  console.log(`\n✅ ${dryRun ? 'Scan' : 'Repair'} complete. Total ${dryRun ? 'found' : 'repaired'}: ${totalRepaired}`);
  
  if (dryRun && totalRepaired > 0) {
    console.log('\n💡 Run with --execute flag to apply repairs: npx ts-node scripts/repair-bad-int32.ts --execute');
  }
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
