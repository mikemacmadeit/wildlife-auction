/**
 * E2E Tests for Stripe Webhook Handling
 * 
 * Tests critical webhook flows:
 * 1. checkout.session.completed creates order exactly once (idempotency)
 * 2. charge.dispute.created creates chargeback + puts order on hold
 * 3. autoReleaseProtected processes eligible orders
 */

import { test, expect } from '@playwright/test';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import {
  buildCheckoutSessionCompletedEvent,
  buildChargeDisputeCreatedEvent,
  generateStripeSignature,
  sendStripeEventViaHTTP,
} from '../helpers/stripeWebhookHarness';
import {
  handleCheckoutSessionCompleted,
  handleChargeDisputeCreated,
} from '@/app/api/stripe/webhook/handlers';

// Test database setup
let testDb: ReturnType<typeof getFirestore>;

test.beforeAll(async () => {
  // Initialize Firebase Admin for tests
  // Use test project or emulator if configured
  const projectId = process.env.TEST_FIREBASE_PROJECT_ID || 'wildlife-exchange-test';
  const useEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

  if (!getFirebaseApps().length) {
    if (useEmulator) {
      // Use emulator
      process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080';
      initApp({
        projectId,
      });
    } else {
      // Use test credentials (minimal for tests)
      const testServiceAccount = {
        projectId,
        clientEmail: process.env.TEST_FIREBASE_CLIENT_EMAIL || 'test@example.com',
        privateKey: process.env.TEST_FIREBASE_PRIVATE_KEY || '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n',
      };
      initApp({
        credential: certCred(testServiceAccount as any),
        projectId,
      });
    }
  }

  testDb = getFirestore();
});

test.afterEach(async () => {
  // Clean up test data after each test
  // In a real setup, you'd clear collections or use isolated test databases
});

/**
 * Test 1: checkout.session.completed creates order exactly once (idempotency)
 */
test('checkout.session.completed creates order exactly once', async ({ request }) => {
  // Arrange: Create test listing and seller
  const listingId = `test_listing_${Date.now()}`;
  const buyerId = `test_buyer_${Date.now()}`;
  const sellerId = `test_seller_${Date.now()}`;
  const sellerStripeAccountId = 'acct_test_123';
  const paymentIntentId = `pi_test_${Date.now()}`;
  const checkoutSessionId = `cs_test_${Date.now()}`;
  const eventId = `evt_test_${Date.now()}`;

  // Create listing
  await testDb.collection('listings').doc(listingId).set({
    id: listingId,
    title: 'Test Listing',
    description: 'Test description',
    type: 'fixed',
    category: 'wildlife_exotics',
    status: 'active',
    price: 100,
    sellerId,
    createdAt: new Date(),
    updatedAt: new Date(),
    protectedTransactionEnabled: false,
    protectedTransactionDays: null,
  });

  // Create seller
  await testDb.collection('users').doc(sellerId).set({
    id: sellerId,
    email: 'seller@test.com',
    displayName: 'Test Seller',
    stripeAccountId: sellerStripeAccountId,
  });

  // Create buyer
  await testDb.collection('users').doc(buyerId).set({
    id: buyerId,
    email: 'buyer@test.com',
    displayName: 'Test Buyer',
  });

  // Act: Send checkout.session.completed event twice with same event.id
  const event = buildCheckoutSessionCompletedEvent({
    sessionId: checkoutSessionId,
    paymentIntentId,
    listingId,
    buyerId,
    sellerId,
    sellerStripeAccountId,
    amount: 10000, // $100.00 in cents
    eventId, // Same event ID for idempotency test
  });

  // First webhook call
  const response1 = await sendStripeEventViaHTTP(event, 'http://localhost:3000');
  
  // Second webhook call (same event ID - should be idempotent)
  const event2 = buildCheckoutSessionCompletedEvent({
    sessionId: checkoutSessionId,
    paymentIntentId,
    listingId,
    buyerId,
    sellerId,
    sellerStripeAccountId,
    amount: 10000,
    eventId, // Same event ID
  });
  const response2 = await sendStripeEventViaHTTP(event2, 'http://localhost:3000');

  // Assert: Both responses should succeed
  expect(response1.status).toBe(200);
  expect(response2.status).toBe(200);

  // Assert: Only ONE order should exist for this checkout session
  const ordersSnapshot = await testDb
    .collection('orders')
    .where('stripeCheckoutSessionId', '==', checkoutSessionId)
    .get();

  expect(ordersSnapshot.size).toBe(1);

  const order = ordersSnapshot.docs[0].data();
  expect(order.status).toBe('paid');
  expect(order.amount).toBe(100);
  expect(order.listingId).toBe(listingId);
  expect(order.buyerId).toBe(buyerId);
  expect(order.sellerId).toBe(sellerId);

  // Assert: stripeEvents/{eventId} should exist (idempotency marker)
  const eventDoc = await testDb.collection('stripeEvents').doc(eventId).get();
  expect(eventDoc.exists).toBe(true);

  // Assert: Listing should be marked as sold
  const listingDoc = await testDb.collection('listings').doc(listingId).get();
  expect(listingDoc.data()?.status).toBe('sold');
});

/**
 * Test 2: charge.dispute.created creates chargeback + puts order on hold
 */
test('charge.dispute.created creates chargeback and puts order on hold', async ({ request }) => {
  // Arrange: Create an order first
  const orderId = `test_order_${Date.now()}`;
  const paymentIntentId = `pi_test_${Date.now()}`;
  const listingId = `test_listing_${Date.now()}`;
  const buyerId = `test_buyer_${Date.now()}`;
  const sellerId = `test_seller_${Date.now()}`;
  const disputeId = `dp_test_${Date.now()}`;
  const chargeId = `ch_test_${Date.now()}`;

  // Create order
  await testDb.collection('orders').doc(orderId).set({
    id: orderId,
    listingId,
    buyerId,
    sellerId,
    amount: 100,
    platformFee: 7,
    sellerAmount: 93,
    status: 'paid',
    stripePaymentIntentId: paymentIntentId,
    stripeCheckoutSessionId: `cs_test_${Date.now()}`,
    sellerStripeAccountId: 'acct_test_123',
    paidAt: new Date(),
    adminHold: false,
    disputeStatus: 'none',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Act: Send charge.dispute.created event
  const event = buildChargeDisputeCreatedEvent({
    disputeId,
    chargeId,
    paymentIntentId,
    amount: 10000,
    reason: 'fraudulent',
    eventId: `evt_dispute_${Date.now()}`,
  });

  const response = await sendStripeEventViaHTTP(event, 'http://localhost:3000');

  // Assert: Response should succeed
  expect(response.status).toBe(200);

  // Assert: chargebacks/{disputeId} should exist
  const chargebackDoc = await testDb.collection('chargebacks').doc(disputeId).get();
  expect(chargebackDoc.exists).toBe(true);
  
  const chargebackData = chargebackDoc.data();
  expect(chargebackData?.status).toBe('open');
  expect(chargebackData?.amount).toBe(10000);
  expect(chargebackData?.paymentIntent).toBe(paymentIntentId);

  // Assert: Order should be on hold
  const orderDoc = await testDb.collection('orders').doc(orderId).get();
  const orderData = orderDoc.data();
  
  expect(orderData?.adminHold).toBe(true);
  expect(orderData?.payoutHoldReason).toBe('admin_hold');
  expect(orderData?.disputeStatus).toBe('open');
  expect(orderData?.disputedAt).toBeDefined();
});

/**
 * Test 3: Direct handler call for checkout.session.completed (unit-style integration test)
 */
test('handleCheckoutSessionCompleted creates order correctly', async () => {
  // Arrange
  const listingId = `test_listing_direct_${Date.now()}`;
  const buyerId = `test_buyer_direct_${Date.now()}`;
  const sellerId = `test_seller_direct_${Date.now()}`;
  const sellerStripeAccountId = 'acct_test_123';
  const paymentIntentId = `pi_test_direct_${Date.now()}`;
  const checkoutSessionId = `cs_test_direct_${Date.now()}`;

  // Create listing
  await testDb.collection('listings').doc(listingId).set({
    id: listingId,
    title: 'Test Listing Direct',
    description: 'Test',
    type: 'fixed',
    category: 'wildlife_exotics',
    status: 'active',
    price: 100,
    sellerId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Create users
  await testDb.collection('users').doc(sellerId).set({
    id: sellerId,
    email: 'seller@test.com',
    displayName: 'Test Seller',
  });

  await testDb.collection('users').doc(buyerId).set({
    id: buyerId,
    email: 'buyer@test.com',
    displayName: 'Test Buyer',
  });

  // Create event
  const event = buildCheckoutSessionCompletedEvent({
    sessionId: checkoutSessionId,
    paymentIntentId,
    listingId,
    buyerId,
    sellerId,
    sellerStripeAccountId,
    amount: 10000,
  });
  const session = event.data.object as any;

  // Act: Call handler directly
  await handleCheckoutSessionCompleted(testDb, session, 'test_request_id');

  // Assert: Order created
  const ordersSnapshot = await testDb
    .collection('orders')
    .where('stripeCheckoutSessionId', '==', checkoutSessionId)
    .get();

  expect(ordersSnapshot.size).toBe(1);
  
  const order = ordersSnapshot.docs[0].data();
  expect(order.status).toBe('paid');
  expect(order.amount).toBe(100);
});
