/**
 * Deterministic Auto-Approve Gate
 *
 * Evaluates whether a listing can be auto-approved based on config and text moderation result.
 * Conservative: any uncertainty → manual review.
 */

import type { ListingModerationConfig, TextModerationResult, AutoApproveDecision, ListingAIModerationDecision } from './types';
import type { Listing } from '@/lib/types';

export interface EvaluateInputs {
  listing: Record<string, any>;
  sellerVerified: boolean;
  config: ListingModerationConfig;
  textResult: TextModerationResult | null;
}

export function evaluateAutoApprove(inputs: EvaluateInputs): AutoApproveDecision {
  const { listing, sellerVerified, config, textResult } = inputs;

  const flags: string[] = [];
  const reasons: string[] = [];

  // 1. AI disabled → manual
  if (!config.aiAutoApproveEnabled) {
    return {
      canAutoApprove: false,
      decision: 'skipped_ai_disabled',
      flags: [],
      reasons: ['AI auto-approve is disabled'],
      scores: {},
    };
  }

  // 2. Category in manual-only → manual
  const category = String(listing?.category || '').trim();
  if (config.manualOnlyCategories.includes(category as any)) {
    reasons.push(`Category "${category}" requires manual review`);
    return {
      canAutoApprove: false,
      decision: 'manual_required',
      flags: ['manual_only_category'],
      reasons,
      scores: {},
    };
  }

  // 3. Unverified seller and config requires manual → manual
  if (config.manualOnlySellerUnverified && !sellerVerified) {
    reasons.push('Seller is not verified');
    return {
      canAutoApprove: false,
      decision: 'manual_required',
      flags: ['seller_unverified'],
      reasons,
      scores: {},
    };
  }

  // 4. Text moderation missing or error → manual (fail closed)
  if (!textResult) {
    return {
      canAutoApprove: false,
      decision: 'error_fallback_manual',
      flags: ['ai_moderation_failed'],
      reasons: ['Text moderation could not be completed'],
      scores: {},
    };
  }

  // 4b. Disallowed flags present → manual (check before factor override)
  const hasDisallowed = textResult.flags.some((f) => config.disallowedFlags.includes(f));
  if (hasDisallowed) {
    flags.push(...textResult.flags);
    reasons.push('Listing has disallowed flags');
    reasons.push(...textResult.reasons);
    return {
      canAutoApprove: false,
      decision: 'manual_required',
      flags,
      reasons,
      scores: {
        textConfidence: textResult.confidence,
        riskScore: textResult.riskScore,
      },
    };
  }

  // 4c. Factor override: when all factors passed, trust that over raw scores (less aggressive)
  if (config.allowFactorOverride && textResult.factorBreakdown && textResult.factorBreakdown.length >= 5) {
    const allPassed = textResult.factorBreakdown.every((f) => f.passed === true);
    if (allPassed) {
      return {
        canAutoApprove: true,
        decision: 'auto_approved',
        flags: textResult.flags,
        reasons: [...textResult.reasons, 'All factor checks passed; factor override applied'],
        scores: {
          textConfidence: textResult.confidence,
          riskScore: textResult.riskScore,
        },
      };
    }
  }

  // 5. Confidence below threshold → manual
  if (textResult.confidence < config.minTextConfidence) {
    flags.push(...textResult.flags);
    reasons.push(`Confidence ${(textResult.confidence * 100).toFixed(0)}% below threshold ${config.minTextConfidence * 100}%`);
    return {
      canAutoApprove: false,
      decision: 'manual_required',
      flags,
      reasons,
      scores: {
        textConfidence: textResult.confidence,
        riskScore: textResult.riskScore,
      },
    };
  }

  // 6. Risk score above threshold → manual
  if (textResult.riskScore > config.maxRiskScore) {
    flags.push(...textResult.flags);
    reasons.push(`Risk score ${(textResult.riskScore * 100).toFixed(0)}% exceeds max ${config.maxRiskScore * 100}%`);
    return {
      canAutoApprove: false,
      decision: 'manual_required',
      flags,
      reasons: [...reasons, ...textResult.reasons],
      scores: {
        textConfidence: textResult.confidence,
        riskScore: textResult.riskScore,
      },
    };
  }

  // All gates passed → auto-approve
  return {
    canAutoApprove: true,
    decision: 'auto_approved',
    flags: textResult.flags,
    reasons: textResult.reasons,
    scores: {
      textConfidence: textResult.confidence,
      riskScore: textResult.riskScore,
    },
  };
}
