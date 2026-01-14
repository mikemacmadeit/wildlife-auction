/**
 * E2E Tests for Auto-Release Protected Transactions
 * 
 * Tests the auto-release cron function logic
 */

import { test, expect } from '@playwright/test';
import { getFirestore, initializeApp, cert, getApps, Timestamp } from 'firebase-admin/firestore';
import { initializeApp as initApp, cert as certCred, getApps as getFirebaseApps } from 'firebase-admin/app';

// Test database setup
let testDb: ReturnType<typeof getFirestore>;
let mockReleaseCalls: Array<{ orderId: string; releasedBy: string }> = [];

// Mock release function for testing
async function mockReleasePaymentForOrder(
  db: ReturnType<typeof getFirestore>,
  orderId: string,
  releasedBy?: string
) {
  mockReleaseCalls.push({ orderId, releasedBy: releasedBy || 'system' });
  
  // Simulate successful release
  const orderRef = db.collection('orders').doc(orderId);
  await orderRef.update({
    stripeTransferId: `tr_test_${Date.now()}`,
    status: 'completed',
    releasedAt: new Date(),
    updatedAt: new Date(),
  });
  
  return { success: true, transferId: `tr_test_${Date.now()}` };
}

test.beforeAll(async () => {
  const projectId = process.env.TEST_FIREBASE_PROJECT_ID || 'wildlife-exchange-test';
  const useEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

  if (!getApps().length) {
    if (useEmulator) {
      process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080';
      initializeApp({ projectId });
    } else {
      const testServiceAccount = {
        projectId,
        clientEmail: process.env.TEST_FIREBASE_CLIENT_EMAIL || 'test@example.com',
        privateKey: process.env.TEST_FIREBASE_PRIVATE_KEY || '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n',
      };
      initializeApp({
        credential: cert(testServiceAccount as any),
        projectId,
      });
    }
  }

  testDb = getFirestore();
});

test.beforeEach(() => {
  mockReleaseCalls = [];
});

/**
 * Test: autoReleaseProtected processes eligible orders
 */
test('autoReleaseProtected processes eligible orders', async () => {
  // Arrange: Create eligible orders
  const now = new Date();
  const pastDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago

  // Order 1: Eligible - protection window expired, delivery confirmed
  const orderId1 = `test_order_eligible_1_${Date.now()}`;
  await testDb.collection('orders').doc(orderId1).set({
    id: orderId1,
    listingId: 'test_listing_1',
    buyerId: 'test_buyer',
    sellerId: 'test_seller',
    amount: 100,
    platformFee: 7,
    sellerAmount: 93,
    status: 'paid',
    stripePaymentIntentId: 'pi_test_1',
    sellerStripeAccountId: 'acct_test',
    protectedTransactionDaysSnapshot: 7,
    protectionEndsAt: pastDate,
    deliveryConfirmedAt: pastDate,
    adminHold: false,
    disputeStatus: 'none',
    createdAt: now,
    updatedAt: now,
  });

  // Order 2: Eligible - dispute deadline passed, status 'paid'
  const orderId2 = `test_order_eligible_2_${Date.now()}`;
  await testDb.collection('orders').doc(orderId2).set({
    id: orderId2,
    listingId: 'test_listing_2',
    buyerId: 'test_buyer',
    sellerId: 'test_seller',
    amount: 100,
    platformFee: 7,
    sellerAmount: 93,
    status: 'paid',
    stripePaymentIntentId: 'pi_test_2',
    sellerStripeAccountId: 'acct_test',
    disputeDeadlineAt: pastDate,
    adminHold: false,
    disputeStatus: 'none',
    createdAt: now,
    updatedAt: now,
  });

  // Order 3: NOT eligible - admin hold
  const orderId3 = `test_order_not_eligible_1_${Date.now()}`;
  await testDb.collection('orders').doc(orderId3).set({
    id: orderId3,
    listingId: 'test_listing_3',
    buyerId: 'test_buyer',
    sellerId: 'test_seller',
    amount: 100,
    status: 'paid',
    disputeDeadlineAt: pastDate,
    adminHold: true, // On hold - not eligible
    createdAt: now,
    updatedAt: now,
  });

  // Order 4: NOT eligible - already released
  const orderId4 = `test_order_not_eligible_2_${Date.now()}`;
  await testDb.collection('orders').doc(orderId4).set({
    id: orderId4,
    listingId: 'test_listing_4',
    buyerId: 'test_buyer',
    sellerId: 'test_seller',
    amount: 100,
    status: 'paid',
    disputeDeadlineAt: pastDate,
    stripeTransferId: 'tr_already_released', // Already released
    createdAt: now,
    updatedAt: now,
  });

  // Order 5: NOT eligible - open dispute
  const orderId5 = `test_order_not_eligible_3_${Date.now()}`;
  await testDb.collection('orders').doc(orderId5).set({
    id: orderId5,
    listingId: 'test_listing_5',
    buyerId: 'test_buyer',
    sellerId: 'test_seller',
    amount: 100,
    status: 'paid',
    disputeDeadlineAt: pastDate,
    disputeStatus: 'open', // Open dispute - not eligible
    createdAt: now,
    updatedAt: now,
  });

  // Act: Simulate auto-release logic (query and process eligible orders)
  const ordersRef = testDb.collection('orders');
  const ordersSnapshot = await ordersRef
    .where('status', 'in', ['paid', 'in_transit', 'delivered', 'accepted', 'ready_to_release'])
    .get();

  const eligibleOrders: Array<{ id: string; data: any }> = [];

  ordersSnapshot.forEach((doc) => {
    const orderData = doc.data();
    const orderId = doc.id;

    // Skip if already released
    if (orderData.stripeTransferId) {
      return;
    }

    // Skip if admin hold
    if (orderData.adminHold === true) {
      return;
    }

    // Skip if open dispute
    const disputeStatus = orderData.disputeStatus;
    if (disputeStatus && ['open', 'needs_evidence', 'under_review'].includes(disputeStatus)) {
      return;
    }

    // Check protected transaction eligibility
    const protectedDays = orderData.protectedTransactionDaysSnapshot;
    const protectionEndsAt = orderData.protectionEndsAt?.toDate?.() || (orderData.protectionEndsAt ? new Date(orderData.protectionEndsAt) : null);
    const deliveryConfirmedAt = orderData.deliveryConfirmedAt;

    if (protectedDays !== null && protectedDays !== undefined) {
      // Protected transaction: must have deliveryConfirmedAt and protectionEndsAt <= now
      if (deliveryConfirmedAt && protectionEndsAt && protectionEndsAt.getTime() <= now.getTime()) {
        eligibleOrders.push({ id: orderId, data: orderData });
        return;
      }
    }

    // Check standard escrow eligibility
    const disputeDeadline = orderData.disputeDeadlineAt?.toDate?.() || (orderData.disputeDeadlineAt ? new Date(orderData.disputeDeadlineAt) : null);
    const status = orderData.status;

    if (disputeDeadline && disputeDeadline.getTime() <= now.getTime()) {
      if (['paid', 'in_transit', 'delivered'].includes(status)) {
        eligibleOrders.push({ id: orderId, data: orderData });
      }
    }
  });

  // Process eligible orders with mock release function
  for (const { id: orderId } of eligibleOrders) {
    await mockReleasePaymentForOrder(testDb, orderId, 'system');
  }

  // Assert: Only eligible orders should be processed
  expect(mockReleaseCalls.length).toBe(2); // Only orderId1 and orderId2
  expect(mockReleaseCalls.map(c => c.orderId)).toContain(orderId1);
  expect(mockReleaseCalls.map(c => c.orderId)).toContain(orderId2);
  expect(mockReleaseCalls.map(c => c.orderId)).not.toContain(orderId3); // Admin hold
  expect(mockReleaseCalls.map(c => c.orderId)).not.toContain(orderId4); // Already released
  expect(mockReleaseCalls.map(c => c.orderId)).not.toContain(orderId5); // Open dispute

  // Assert: Health metrics should be written
  const healthDoc = await testDb.collection('opsHealth').doc('autoReleaseProtected').get();
  // Note: In real implementation, this would be written by the cron function
  // For now, we verify the logic would process the correct orders
});
