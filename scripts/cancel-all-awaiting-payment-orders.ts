/**
 * One-off script: cancel ALL orders that are "awaiting payment" (pending / awaiting_bank_transfer / awaiting_wire).
 *
 * These orders were created when a Checkout Session was created but payment never completed.
 * They should not appear in anyone's "My purchases". This script cancels them and clears
 * listing reservations so they no longer show up.
 *
 * Usage:
 *   npx tsx scripts/cancel-all-awaiting-payment-orders.ts [--dry-run] [--limit=500]
 *
 * Prerequisites:
 *   - Firebase Admin (GOOGLE_APPLICATION_CREDENTIALS or serviceAccountKey.json)
 */

import fs from 'fs';
import path from 'path';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';

function loadEnvLocal() {
  const p = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(p)) return;
  const raw = fs.readFileSync(p, 'utf8');
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (process.env[key] !== undefined) continue;
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    process.env[key] = val;
  }
}

function flag(name: string): boolean {
  return process.argv.includes(name);
}
function arg(name: string): string | null {
  const i = process.argv.findIndex((a) => a === name || a.startsWith(name + '='));
  if (i === -1) return null;
  const v = process.argv[i];
  if (v.startsWith(name + '=')) return v.slice(name.length + 1).trim() || null;
  return process.argv[i + 1] || null;
}

const AWAITING_STATUSES = ['pending', 'awaiting_bank_transfer', 'awaiting_wire'] as const;

async function main() {
  loadEnvLocal();

  const dryRun = flag('--dry-run');
  const limit = Math.min(2000, Math.max(1, parseInt(arg('--limit') || '500', 10)));

  const db = getAdminDb();

  const snap = await db
    .collection('orders')
    .where('status', 'in', AWAITING_STATUSES)
    .limit(limit)
    .get();

  console.log(`Found ${snap.size} order(s) with status in [${AWAITING_STATUSES.join(', ')}].`);
  if (dryRun) console.log('--dry-run: no writes will be performed.\n');

  let cancelled = 0;
  let errors = 0;

  for (const doc of snap.docs) {
    const orderId = doc.id;
    const d = doc.data() as { listingId?: string };

    try {
      if (dryRun) {
        console.log(`  ${orderId}  would cancel (status=${(d as any).status})`);
        cancelled++;
        continue;
      }

      const now = new Date();
      await db.collection('orders').doc(orderId).set(
        { status: 'cancelled', updatedAt: now, lastUpdatedByRole: 'admin' },
        { merge: true }
      );
      cancelled++;
      console.log(`  ${orderId}  cancelled`);

      const listingId = d.listingId;
      if (listingId) {
        try {
          const listingRef = db.collection('listings').doc(String(listingId));
          const reservationRef = listingRef.collection('purchaseReservations').doc(orderId);
          await db.runTransaction(async (tx) => {
            const listSnap = await tx.get(listingRef);
            if (!listSnap.exists) return;
            const l = listSnap.data() as any;
            const rs = await tx.get(reservationRef);
            if (rs.exists) {
              const r = rs.data() as any;
              const q = typeof r?.quantity === 'number' ? Math.max(1, Math.floor(r.quantity)) : 0;
              if (q > 0 && typeof l?.quantityAvailable === 'number' && Number.isFinite(l.quantityAvailable)) {
                tx.update(listingRef, {
                  quantityAvailable: Math.max(0, Math.floor(l.quantityAvailable)) + q,
                  updatedAt: Timestamp.fromDate(now),
                  updatedBy: 'system',
                });
              }
              tx.delete(reservationRef);
            }
            if (l?.purchaseReservedByOrderId === orderId) {
              tx.update(listingRef, {
                purchaseReservedByOrderId: null,
                purchaseReservedAt: null,
                purchaseReservedUntil: null,
                updatedAt: Timestamp.fromDate(now),
                updatedBy: 'system',
              });
            }
          });
        } catch (e: any) {
          console.warn(`    warning: listing reservation clear failed: ${e?.message || e}`);
        }
      }
    } catch (e: any) {
      console.error(`  ${orderId}  error: ${e?.message || e}`);
      errors++;
    }
  }

  console.log(`\nDone. cancelled=${cancelled} errors=${errors}${dryRun ? ' (dry run)' : ''}.`);
  if (!dryRun && cancelled > 0 && snap.size >= limit) {
    console.log('Tip: If more awaiting-payment orders exist, run again (or raise --limit).');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
