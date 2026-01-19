import test from 'node:test';
import assert from 'node:assert/strict';

import { getCategoryRequirements } from '../../lib/compliance/requirements';

test('horse requirements: texasOnly + billOfSale required', () => {
  const r = getCategoryRequirements('horse_equestrian');
  assert.equal(r.isAnimal, true);
  assert.equal(r.texasOnly, true);
  assert.equal(r.requireBillOfSaleAtCheckout, true);
  assert.deepEqual(r.requiredOrderDocuments, ['BILL_OF_SALE']);
});

