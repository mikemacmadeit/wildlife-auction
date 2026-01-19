import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeCategory } from '../../lib/listings/normalizeCategory';

test('normalizeCategory maps legacy categories', () => {
  assert.equal(normalizeCategory('horses'), 'horse_equestrian');
  assert.equal(normalizeCategory('wildlife'), 'wildlife_exotics');
  assert.equal(normalizeCategory('cattle'), 'cattle_livestock');
  assert.equal(normalizeCategory('equipment'), 'ranch_equipment');
});

test('normalizeCategory passes through canonical categories', () => {
  assert.equal(normalizeCategory('horse_equestrian'), 'horse_equestrian');
  assert.equal(normalizeCategory('whitetail_breeder'), 'whitetail_breeder');
});

test('normalizeCategory fails closed on unknown', () => {
  assert.throws(() => normalizeCategory('made_up_category'), /Unknown category/i);
  assert.throws(() => normalizeCategory(''), /Missing category/i);
  assert.throws(() => normalizeCategory(null), /Missing category/i);
});

