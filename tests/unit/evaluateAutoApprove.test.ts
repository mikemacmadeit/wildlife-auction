import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateAutoApprove } from '../../lib/compliance/aiModeration/evaluateAutoApprove';
import { DEFAULT_CONFIG } from '../../lib/compliance/aiModeration/config';

const baseConfig = {
  ...DEFAULT_CONFIG,
  aiAutoApproveEnabled: true,
  manualOnlyCategories: ['whitetail_breeder'],
  manualOnlySellerUnverified: true,
};

const baseListing = {
  category: 'wildlife_exotics',
  title: 'Axis Doe',
  description: 'Healthy axis deer',
};

const baseTextResult = {
  confidence: 0.9,
  riskScore: 0.1,
  flags: [],
  reasons: [],
  evidence: [],
  model: 'gpt-4o-mini',
};

test('AI disabled → manual', () => {
  const result = evaluateAutoApprove({
    listing: baseListing,
    sellerVerified: true,
    config: { ...baseConfig, aiAutoApproveEnabled: false },
    textResult: baseTextResult,
  });
  assert.equal(result.canAutoApprove, false);
  assert.equal(result.decision, 'skipped_ai_disabled');
});

test('low confidence → manual', () => {
  const result = evaluateAutoApprove({
    listing: baseListing,
    sellerVerified: true,
    config: baseConfig,
    textResult: { ...baseTextResult, confidence: 0.7 },
  });
  assert.equal(result.canAutoApprove, false);
  assert.equal(result.decision, 'manual_required');
});

test('high riskScore → manual', () => {
  const result = evaluateAutoApprove({
    listing: baseListing,
    sellerVerified: true,
    config: baseConfig,
    textResult: { ...baseTextResult, riskScore: 0.5 },
  });
  assert.equal(result.canAutoApprove, false);
  assert.equal(result.decision, 'manual_required');
});

test('disallowed flags → manual', () => {
  const result = evaluateAutoApprove({
    listing: baseListing,
    sellerVerified: true,
    config: baseConfig,
    textResult: { ...baseTextResult, flags: ['prohibited_language'] },
  });
  assert.equal(result.canAutoApprove, false);
  assert.equal(result.decision, 'manual_required');
});

test('manualOnlyCategories → manual', () => {
  const result = evaluateAutoApprove({
    listing: { ...baseListing, category: 'whitetail_breeder' },
    sellerVerified: true,
    config: baseConfig,
    textResult: baseTextResult,
  });
  assert.equal(result.canAutoApprove, false);
  assert.equal(result.decision, 'manual_required');
});

test('manualOnlySellerUnverified + unverified → manual', () => {
  const result = evaluateAutoApprove({
    listing: baseListing,
    sellerVerified: false,
    config: baseConfig,
    textResult: baseTextResult,
  });
  assert.equal(result.canAutoApprove, false);
  assert.equal(result.decision, 'manual_required');
});

test('text moderation missing → manual (error_fallback)', () => {
  const result = evaluateAutoApprove({
    listing: baseListing,
    sellerVerified: true,
    config: baseConfig,
    textResult: null,
  });
  assert.equal(result.canAutoApprove, false);
  assert.equal(result.decision, 'error_fallback_manual');
});

test('happy path → auto-approve', () => {
  const result = evaluateAutoApprove({
    listing: baseListing,
    sellerVerified: true,
    config: baseConfig,
    textResult: baseTextResult,
  });
  assert.equal(result.canAutoApprove, true);
  assert.equal(result.decision, 'auto_approved');
});
