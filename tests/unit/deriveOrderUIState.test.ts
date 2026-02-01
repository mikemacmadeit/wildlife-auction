import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveOrderUIState } from '../../lib/orders/deriveOrderUIState';
import type { Order } from '../../lib/types';

function baseOrder(partial: Partial<Order>): Order {
  return {
    id: 'ord_123',
    listingId: 'lst_123',
    buyerId: 'buyer_1',
    sellerId: 'seller_1',
    amount: 100,
    platformFee: 5,
    sellerAmount: 95,
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

test('deriveOrderUIState: delivered -> confirm receipt', () => {
  const s = deriveOrderUIState(baseOrder({ status: 'delivered' }));
  assert.equal(s.statusKey, 'delivered');
  assert.equal(s.needsAction, true);
  assert.equal(s.primaryAction.kind, 'confirm_receipt');
});

test('deriveOrderUIState: paid_held no address -> action needed', () => {
  const s = deriveOrderUIState(baseOrder({ status: 'paid_held' }));
  assert.equal(s.statusKey, 'action_needed');
  assert.equal(s.needsAction, true);
  assert.equal(s.currentStepLabel, 'Set delivery address');
});

test('deriveOrderUIState: paid_held with address -> preparing', () => {
  const s = deriveOrderUIState(baseOrder({
    status: 'paid_held',
    delivery: { buyerAddress: { line1: '123 Main St', city: 'Austin', state: 'TX', zip: '78701' } },
  } as any));
  assert.equal(s.statusKey, 'preparing');
  assert.equal(s.needsAction, false);
  assert.equal(s.primaryAction.kind, 'view_details');
});

test('deriveOrderUIState: transfer permit required and not approved -> awaiting permit', () => {
  const s = deriveOrderUIState(baseOrder({ transferPermitRequired: true, transferPermitStatus: 'none', status: 'paid_held' }));
  assert.equal(s.statusKey, 'awaiting_permit');
  assert.equal(s.primaryAction.kind, 'complete_transfer');
});

test('deriveOrderUIState: transactionStatus DELIVERY_PROPOSED -> action needed', () => {
  const s = deriveOrderUIState(baseOrder({ transactionStatus: 'DELIVERY_PROPOSED', status: 'paid_held' }));
  assert.equal(s.statusKey, 'action_needed');
  assert.equal(s.primaryAction.kind, 'agree_delivery');
});

test('deriveOrderUIState: transactionStatus DELIVERY_SCHEDULED -> scheduled', () => {
  const s = deriveOrderUIState(baseOrder({ transactionStatus: 'DELIVERY_SCHEDULED', status: 'paid_held' }));
  assert.equal(s.statusKey, 'scheduled');
  assert.equal(s.currentStepLabel, 'Delivery scheduled');
});

test('deriveOrderUIState: disputed overrides other statuses', () => {
  const s = deriveOrderUIState(baseOrder({ status: 'disputed', transferPermitRequired: true, transferPermitStatus: 'none' }));
  assert.equal(s.statusKey, 'disputed');
  assert.equal(s.primaryAction.kind, 'view_details');
});

test('deriveOrderUIState: completed -> transaction complete label', () => {
  const s = deriveOrderUIState(baseOrder({ status: 'completed', stripeTransferId: 'tr_123' }));
  assert.equal(s.statusKey, 'completed');
  assert.equal(s.currentStepLabel, 'Transaction complete');
});

