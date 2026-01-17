import test from 'node:test';
import assert from 'node:assert/strict';

import { getEligiblePaymentMethods } from '../../lib/payments/gating';

test('payment gating: always includes card', () => {
  assert.deepEqual(
    getEligiblePaymentMethods({ totalUsd: 1, isAuthenticated: false, isEmailVerified: false }),
    ['card']
  );
});

test('payment gating: ACH requires auth+verified and >= $2,500', () => {
  assert.deepEqual(
    getEligiblePaymentMethods({ totalUsd: 2499.99, isAuthenticated: true, isEmailVerified: true }),
    ['card']
  );
  assert.deepEqual(
    getEligiblePaymentMethods({ totalUsd: 2500, isAuthenticated: true, isEmailVerified: true }),
    ['card', 'ach_debit']
  );
  assert.deepEqual(
    getEligiblePaymentMethods({ totalUsd: 2500, isAuthenticated: true, isEmailVerified: false }),
    ['card']
  );
});

test('payment gating: Wire requires auth+verified and >= $10,000', () => {
  assert.deepEqual(
    getEligiblePaymentMethods({ totalUsd: 9999.99, isAuthenticated: true, isEmailVerified: true }),
    ['card', 'ach_debit']
  );
  assert.deepEqual(
    getEligiblePaymentMethods({ totalUsd: 10000, isAuthenticated: true, isEmailVerified: true }),
    ['card', 'ach_debit', 'wire']
  );
});

