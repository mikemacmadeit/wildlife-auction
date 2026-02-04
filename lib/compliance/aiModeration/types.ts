/**
 * AI Listing Moderation Types
 *
 * Server-only. Used for auto-approve lane and audit trail.
 */

import type { ListingCategory } from '@/lib/types';

export type ListingAIModerationDecision =
  | 'auto_approved'
  | 'manual_required'
  | 'skipped_ai_disabled'
  | 'error_fallback_manual';

export interface ListingAIModeration {
  decision: ListingAIModerationDecision;
  policyVersion: number;
  evaluatedAt: import('firebase-admin/firestore').Timestamp;
  evaluatedBy: 'system';
  scores?: {
    textConfidence?: number;
    riskScore?: number;
  };
  flags: string[];
  reasons: string[];
  evidence?: Array<{ flag: string; snippet: string }>;
  model: string;
}

export interface ListingModerationConfig {
  aiAutoApproveEnabled: boolean;
  minTextConfidence: number;
  maxRiskScore: number;
  disallowedFlags: string[];
  manualOnlyCategories: ListingCategory[];
  manualOnlySellerUnverified: boolean;
  policyVersion: number;
  updatedAt: import('firebase-admin/firestore').Timestamp;
  updatedBy: string;
}

export interface TextModerationResult {
  confidence: number;
  riskScore: number;
  flags: string[];
  reasons: string[];
  evidence: Array<{ flag: string; snippet: string }>;
  model: string;
}

export interface AutoApproveDecision {
  canAutoApprove: boolean;
  decision: ListingAIModerationDecision;
  flags: string[];
  reasons: string[];
  scores: { textConfidence?: number; riskScore?: number };
}
