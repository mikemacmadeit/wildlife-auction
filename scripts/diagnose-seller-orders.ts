/**
 * Diagnose why "Sold" tab and "Pending payouts" may disagree for a seller.
 * Run: npx tsx scripts/diagnose-seller-orders.ts [email]
 * Default email: usalandspecialist@gmail.com
 *
 * Explains:
 * - Sold tab uses getOrdersForUser(uid, 'seller') → filterSellerRelevantOrders (orders where sellerId === uid).
 * - Pending payouts used to count every non-completed order as pending; with destination charges,
 *   paid orders are now treated as completed. This script shows counts by status either way.
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
  try {
    const envPath = resolve(process.cwd(), '.env.local');
    const envFile = readFileSync(envPath, 'utf-8');
    const envVars: Record<string, string> = {};
    envFile.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').replace(/^["']|["']$/g, '');
          envVars[key.trim()] = value.trim();
        }
      }
    });
    Object.assign(process.env, envVars);
  } catch (_) {
    // ignore
  }
}

loadEnv();

if (!getApps().length) {
  const serviceAccount = process.env.FIREBASE_PRIVATE_KEY
    ? {
        projectId:
          process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }
    : undefined;
  if (serviceAccount?.projectId && serviceAccount?.clientEmail && serviceAccount?.privateKey) {
    initializeApp({ credential: cert(serviceAccount as any) });
  } else {
    throw new Error('Firebase Admin credentials not found. Set FIREBASE_* in .env.local');
  }
}

const db = getFirestore();
const auth = getAuth();

const AWAITING_PAYMENT = ['pending', 'awaiting_bank_transfer', 'awaiting_wire'];
const PAID_OR_TERMINAL = [
  'completed',
  'paid',
  'paid_held',
  'in_transit',
  'delivered',
  'buyer_confirmed',
  'accepted',
  'ready_to_release',
  'refunded',
  'cancelled',
  'disputed',
];

function bucketOrder(d: FirebaseFirestore.DocumentSnapshot): { pending: number; completed: number } {
  const data = d.data() || {};
  const status = String(data.status || '');
  const amount = Number(data.amount || 0);
  const platformFee = Number(data.platformFee || 0);
  const sellerAmount = Number(data.sellerAmount ?? Math.max(0, amount - platformFee));
  const stripeTransferId = data.stripeTransferId;

  const isAwaiting = AWAITING_PAYMENT.includes(status);
  const isPaidOrTerminal =
    !!stripeTransferId || PAID_OR_TERMINAL.includes(status as any);

  if (isAwaiting) return { pending: sellerAmount, completed: 0 };
  if (isPaidOrTerminal) return { pending: 0, completed: sellerAmount };
  return { pending: sellerAmount, completed: 0 };
}

async function run(email: string) {
  console.log('=== Seller orders diagnostic ===\n');
  console.log('Email:', email);

  let uid: string;
  try {
    const user = await auth.getUserByEmail(email);
    uid = user.uid;
    console.log('Firebase Auth UID:', uid);
  } catch (e: any) {
    console.error('User not found by email:', e?.message || e);
    return;
  }

  // Orders where sellerId === uid (what Sold tab and Payouts use)
  const byUidSnap = await db.collection('orders').where('sellerId', '==', uid).get();
  console.log('\nOrders with sellerId === uid:', byUidSnap.size);

  // Orders where sellerId === email (legacy/mock data)
  const byEmailSnap = await db.collection('orders').where('sellerId', '==', email).get();
  console.log('Orders with sellerId === email:', byEmailSnap.size);

  if (byUidSnap.size === 0 && byEmailSnap.size > 0) {
    console.log(
      '\n>>> Sold tab shows 0 because it queries by uid. Your orders are stored with sellerId = email. Fix: re-link those orders to this uid, or create new orders under this account.'
    );
  }

  // Bucket by status for uid-based orders (what payouts page uses)
  let pendingSum = 0;
  let completedSum = 0;
  const statusCounts: Record<string, number> = {};
  byUidSnap.docs.forEach((d) => {
    const st = String((d.data() || {}).status || '');
    statusCounts[st] = (statusCounts[st] || 0) + 1;
    const { pending, completed } = bucketOrder(d);
    pendingSum += pending;
    completedSum += completed;
  });

  console.log('\n--- Payout semantics (orders where sellerId === uid) ---');
  console.log('Status counts:', statusCounts);
  console.log('Sum "Pending" (awaiting payment only):', pendingSum);
  console.log('Sum "Completed" (paid/terminal):', completedSum);

  // Simulate OLD logic: pending = everything that wasn’t completed/available
  let oldPendingSum = 0;
  byUidSnap.docs.forEach((d) => {
    const data = d.data() || {};
    const status = String(data.status || '');
    const sellerAmount = Number(
      data.sellerAmount ?? Math.max(0, (data.amount || 0) - (data.platformFee || 0))
    );
    const isCompleted = !!data.stripeTransferId || status === 'completed';
    const isAvailable = !isCompleted && status === 'ready_to_release';
    if (!isCompleted && !isAvailable && (data.listingId && (data.amount || 0) > 0)) {
      oldPendingSum += sellerAmount;
    }
  });
  console.log(
    '\n>>> Old logic "Pending" sum (everything not completed/ready_to_release):',
    oldPendingSum
  );
  if (oldPendingSum > 0 && pendingSum < oldPendingSum) {
    console.log(
      '>>> That old number is why you saw a large "Pending" (e.g. ~162k). It’s now fixed: only orders awaiting buyer payment count as pending.'
    );
  }

  // Sold tab: filterSellerRelevantOrders applied to getOrdersForUser(uid,'seller')
  const excludedPending = byUidSnap.docs.filter((d) => {
    const d_ = d.data() || {};
    return d_.status === 'pending' && d_.stripeCheckoutSessionId;
  }).length;
  const excludedCancelled = byUidSnap.docs.filter((d) => {
    const d_ = d.data() || {};
    return d_.status === 'cancelled' && !d_.paidAt;
  }).length;
  const afterFilter = byUidSnap.size - excludedPending - excludedCancelled;
  console.log('\n--- Sold tab (filterSellerRelevantOrders) ---');
  console.log(
    'Excluded: pending-with-checkout-session:',
    excludedPending,
    '| cancelled-without-paidAt:',
    excludedCancelled
  );
  console.log('Visible orders on Sold tab:', afterFilter);
}

const email = process.argv[2] || 'usalandspecialist@gmail.com';
run(email)
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
