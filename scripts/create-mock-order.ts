/**
 * Create a mock listing + mock order for testing the Order page + timeline.
 *
 * Usage:
 *   npx --yes tsx scripts/create-mock-order.ts --buyer usalandspecialist@gmail.com
 *
 * Notes:
 * - Uses Firebase Admin via `lib/firebase/admin.ts`
 * - Creates:
 *   - a sold listing (minimal required fields)
 *   - a delivered order (with protection window active) so buyer can test confirm-receipt flow
 *   - notification events (Order.Confirmed, Order.InTransit, Order.DeliveryConfirmed) so emailJobs/in-app can be tested
 */

import fs from 'fs';
import path from 'path';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { emitEventForUser } from '@/lib/notifications';
import { getSiteUrl } from '@/lib/site-url';

function loadEnvLocalIfPresent() {
  try {
    const p = path.resolve(process.cwd(), '.env.local');
    if (!fs.existsSync(p)) return;
    const raw = fs.readFileSync(p, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (!key) continue;
      // Preserve existing process env if already provided by the shell/CI.
      if (process.env[key] !== undefined) continue;
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {
    // ignore
  }
}

function arg(name: string): string | null {
  const idx = process.argv.findIndex((a) => a === name);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

async function main() {
  // Ensure local scripts can use the same env vars Next loads.
  loadEnvLocalIfPresent();

  const buyerEmail = arg('--buyer') || 'usalandspecialist@gmail.com';
  const sellerEmail = arg('--seller') || 'mock-seller@wildlife.exchange';
  const paymentMethod = arg('--payment') || 'card';

  const auth = getAdminAuth();
  const db = getAdminDb();

  const buyer = await auth.getUserByEmail(buyerEmail);

  let seller = null as any;
  try {
    seller = await auth.getUserByEmail(sellerEmail);
  } catch {
    // Create a placeholder seller account (no password; meant only for linking data).
    seller = await auth.createUser({
      email: sellerEmail,
      displayName: 'Mock Seller',
      emailVerified: true,
      disabled: false,
    });
  }

  const now = new Date();
  const deliveredAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const protectionDays = 7;
  const protectionStartAt = deliveredAt;
  const protectionEndsAt = new Date(deliveredAt.getTime() + protectionDays * 24 * 60 * 60 * 1000);

  // 1) Create listing
  const listingRef = db.collection('listings').doc();
  await listingRef.set({
    title: 'Mock Listing — Axis Doe (Breeder Stock)',
    description:
      'Mock listing created for testing order timelines, notifications, and buyer/seller flows. Not a real transaction.',
    type: 'fixed',
    category: 'wildlife_exotics',
    status: 'sold',
    price: 12500,
    images: [],
    location: { city: 'Austin', state: 'TX' },
    sellerId: seller.uid,
    trust: { verified: false, insuranceAvailable: true, transportReady: true },
    attributes: { speciesId: 'axis', sex: 'female', quantity: 1 },
    metrics: { views: 0, favorites: 0, bidCount: 0 },
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    createdBy: seller.uid,
    updatedBy: seller.uid,
    publishedAt: Timestamp.now(),
    // Sold metadata (public-safe)
    soldAt: Timestamp.fromDate(now),
    soldPriceCents: 12500 * 100,
    saleType: 'buy_now',
  });

  // 2) Create order (delivered + protection window active)
  const orderRef = db.collection('orders').doc();
  const amount = 12500;
  const platformFee = Math.round(amount * 0.05);
  const sellerAmount = amount - platformFee;

  await orderRef.set({
    listingId: listingRef.id,
    buyerId: buyer.uid,
    sellerId: seller.uid,
    amount,
    platformFee,
    sellerAmount,
    status: 'delivered',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    paidAt: Timestamp.fromDate(new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)),
    deliveredAt: Timestamp.fromDate(deliveredAt),
    deliveryConfirmedAt: Timestamp.fromDate(deliveredAt),
    protectionStartAt: Timestamp.fromDate(protectionStartAt),
    protectionEndsAt: Timestamp.fromDate(protectionEndsAt),
    payoutHoldReason: 'protection_window',
    protectedTransactionDaysSnapshot: protectionDays,
    protectedTermsVersion: 'v1',
    lastUpdatedByRole: 'admin',
    // Helpful debug fields
    paymentMethod,
  });

  const orderId = orderRef.id;
  const siteUrl = getSiteUrl();
  const buyerOrderUrl = `${siteUrl}/dashboard/orders/${orderId}`;
  const sellerOrderUrl = `${siteUrl}/seller/orders/${orderId}`;

  // 3) Emit events so notifications / emailJobs can be tested
  await emitEventForUser({
    type: 'Order.Confirmed',
    actorId: null,
    entityType: 'order',
    entityId: orderId,
    targetUserId: buyer.uid,
    payload: {
      type: 'Order.Confirmed',
      orderId,
      listingId: listingRef.id,
      listingTitle: 'Mock Listing — Axis Doe (Breeder Stock)',
      orderUrl: buyerOrderUrl,
      amount,
      paymentMethod,
    },
    optionalHash: `mock:confirmed:${orderId}`,
    test: true,
  });

  await emitEventForUser({
    type: 'Order.InTransit',
    actorId: seller.uid,
    entityType: 'order',
    entityId: orderId,
    targetUserId: buyer.uid,
    payload: {
      type: 'Order.InTransit',
      orderId,
      listingId: listingRef.id,
      listingTitle: 'Mock Listing — Axis Doe (Breeder Stock)',
      orderUrl: buyerOrderUrl,
    },
    optionalHash: `mock:in_transit:${orderId}`,
    test: true,
  });

  await emitEventForUser({
    type: 'Order.DeliveryConfirmed',
    actorId: seller.uid,
    entityType: 'order',
    entityId: orderId,
    targetUserId: buyer.uid,
    payload: {
      type: 'Order.DeliveryConfirmed',
      orderId,
      listingId: listingRef.id,
      listingTitle: 'Mock Listing — Axis Doe (Breeder Stock)',
      orderUrl: buyerOrderUrl,
      deliveryDate: deliveredAt.toISOString(),
    },
    optionalHash: `mock:delivered:${orderId}`,
    test: true,
  });

  // Note: Order.Received is emitted when the buyer confirms receipt.
  // That’s the exact behavior we want to test from the Buyer Order page.

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, buyerEmail, sellerEmail, listingId: listingRef.id, orderId, buyerOrderUrl, sellerOrderUrl }, null, 2));
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('Failed to create mock order:', e);
  process.exit(1);
});

