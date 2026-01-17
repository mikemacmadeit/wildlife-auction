import test from 'node:test';
import assert from 'node:assert/strict';

import { getSoldSummary, formatUsdFromCents } from '../../lib/listings/sold';

test('formatUsdFromCents formats dollars', () => {
  assert.equal(formatUsdFromCents(12345), '$123.45');
  assert.equal(formatUsdFromCents(10000), '$100');
});

test('getSoldSummary returns nulls for non-sold', () => {
  const res = getSoldSummary({
    status: 'active' as any,
    type: 'fixed' as any,
    price: 100,
    currentBid: undefined,
    soldAt: null,
    soldPriceCents: null,
  });
  assert.equal(res.isSold, false);
  assert.equal(res.soldPriceLabel, null);
  assert.equal(res.soldDateLabel, null);
});

test('getSoldSummary returns price+date for sold listing with metadata', () => {
  const d = new Date('2026-01-01T00:00:00Z');
  const res = getSoldSummary({
    status: 'sold' as any,
    type: 'fixed' as any,
    price: 100,
    currentBid: undefined,
    soldAt: d,
    soldPriceCents: 250000,
  });
  assert.equal(res.isSold, true);
  assert.ok(res.soldPriceLabel?.includes('Sold for $2,500'));
  assert.ok(res.soldDateLabel?.includes('Sold on'));
});

