import test from 'node:test';
import assert from 'node:assert/strict';

import { computeNextState, getMinIncrementCents, type AutoBidEntry } from '../../lib/auctions/proxyBidding';

test('increment ladder: minimum $50 and rounds to $1', () => {
  assert.equal(getMinIncrementCents(0), 5000);
  assert.equal(getMinIncrementCents(100_00), 5000); // $100 -> 5% = $5, min $50
  assert.equal(getMinIncrementCents(1_000_00), 5000); // $1000 -> 5% = $50
  assert.equal(getMinIncrementCents(1_234_56) % 100, 0);
});

test('single max bidder keeps price at current', () => {
  const set: AutoBidEntry[] = [
    { userId: 'u1', maxBidCents: 50_000, enabled: true, createdAtMs: 1 },
  ];
  const out = computeNextState({ currentBidCents: 10_000, highBidderId: null, autoBidSet: set });
  assert.equal(out.newHighBidderId, 'u1');
  assert.equal(out.newCurrentBidCents, 10_000);
  assert.equal(out.syntheticBidsToWrite.length, 0);
});

test('two max bidders: current becomes min(secondMax+inc, topMax)', () => {
  const set: AutoBidEntry[] = [
    { userId: 'u1', maxBidCents: 200_000, enabled: true, createdAtMs: 1 },
    { userId: 'u2', maxBidCents: 120_000, enabled: true, createdAtMs: 2 },
  ];
  const out = computeNextState({ currentBidCents: 10_000, highBidderId: null, autoBidSet: set });
  const inc = getMinIncrementCents(120_000);
  assert.equal(out.newHighBidderId, 'u1');
  assert.equal(out.newCurrentBidCents, Math.min(120_000 + inc, 200_000));
  assert.equal(out.syntheticBidsToWrite.length, 1);
  assert.equal(out.syntheticBidsToWrite[0]!.bidderId, 'u1');
});

test('tie max bids: earliest createdAt wins', () => {
  const set: AutoBidEntry[] = [
    { userId: 'u1', maxBidCents: 100_000, enabled: true, createdAtMs: 1 },
    { userId: 'u2', maxBidCents: 100_000, enabled: true, createdAtMs: 2 },
  ];
  const out = computeNextState({ currentBidCents: 10_000, highBidderId: null, autoBidSet: set });
  assert.equal(out.newHighBidderId, 'u1');
});

