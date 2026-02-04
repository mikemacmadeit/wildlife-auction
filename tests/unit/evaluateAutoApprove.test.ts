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

test('factor override: all factors passed → auto-approve even with borderline scores', () => {
  const result = evaluateAutoApprove({
    listing: baseListing,
    sellerVerified: true,
    config: baseConfig,
    textResult: {
      ...baseTextResult,
      confidence: 0.8,
      riskScore: 0.3,
      flags: [],
      factorBreakdown: [
        { factor: 'prohibited_language', passed: true, note: 'None found' },
        { factor: 'scam_pricing', passed: true, note: 'Normal' },
        { factor: 'misrepresentation', passed: true, note: 'None' },
        { factor: 'illegal_species', passed: true, note: 'None' },
        { factor: 'interstate_shipping', passed: true, note: 'None' },
        { factor: 'description_clarity', passed: true, note: 'OK' },
      ],
    },
  });
  assert.equal(result.canAutoApprove, true);
  assert.equal(result.decision, 'auto_approved');
});

test('factor override disabled → borderline scores still fail', () => {
  const result = evaluateAutoApprove({
    listing: baseListing,
    sellerVerified: true,
    config: { ...baseConfig, allowFactorOverride: false },
    textResult: {
      ...baseTextResult,
      confidence: 0.8,
      riskScore: 0.3,
      flags: [],
      factorBreakdown: [
        { factor: 'prohibited_language', passed: true },
        { factor: 'scam_pricing', passed: true },
        { factor: 'misrepresentation', passed: true },
        { factor: 'illegal_species', passed: true },
        { factor: 'interstate_shipping', passed: true },
        { factor: 'description_clarity', passed: true },
      ],
    },
  });
  assert.equal(result.canAutoApprove, false);
  assert.equal(result.decision, 'manual_required');
});

test('factor override: disallowed flags still block', () => {
  const result = evaluateAutoApprove({
    listing: baseListing,
    sellerVerified: true,
    config: baseConfig,
    textResult: {
      ...baseTextResult,
      confidence: 0.9,
      riskScore: 0.1,
      flags: ['prohibited_language'],
      factorBreakdown: [
        { factor: 'prohibited_language', passed: false, note: 'Found' },
        { factor: 'scam_pricing', passed: true },
        { factor: 'misrepresentation', passed: true },
        { factor: 'illegal_species', passed: true },
        { factor: 'interstate_shipping', passed: true },
        { factor: 'description_clarity', passed: true },
      ],
    },
  });
  assert.equal(result.canAutoApprove, false);
  assert.equal(result.decision, 'manual_required');
});
