/**
 * AI Listing Moderation Config
 *
 * Loads adminConfig/listingModeration from Firestore with safe defaults.
 * AI is OFF by default when doc does not exist.
 */

import type { Firestore } from 'firebase-admin/firestore';
import type { ListingModerationConfig } from './types';
import type { ListingCategory } from '@/lib/types';
import { Timestamp } from 'firebase-admin/firestore';

const DEFAULT_MANUAL_ONLY_CATEGORIES: ListingCategory[] = ['whitetail_breeder'];

export const DEFAULT_CONFIG: Omit<ListingModerationConfig, 'updatedAt' | 'updatedBy'> = {
  aiAutoApproveEnabled: false,
  minTextConfidence: 0.85,
  maxRiskScore: 0.2,
  disallowedFlags: [
    'illegal_species',
    'permit_required_missing',
    'interstate_shipping',
    'prohibited_language',
    'scam_pricing',
    'misrepresentation',
    'uncertain',
  ],
  manualOnlyCategories: DEFAULT_MANUAL_ONLY_CATEGORIES,
  manualOnlySellerUnverified: true,
  policyVersion: 1,
};

export async function getListingModerationConfig(
  db: Firestore
): Promise<ListingModerationConfig> {
  const doc = await db.collection('adminConfig').doc('listingModeration').get();
  if (!doc.exists) {
    const now = Timestamp.now();
    return {
      ...DEFAULT_CONFIG,
      updatedAt: now,
      updatedBy: 'system',
    };
  }
  const data = doc.data() as Partial<ListingModerationConfig> | undefined;
  const updatedAt = data?.updatedAt instanceof Timestamp ? data.updatedAt : Timestamp.now();
  const updatedBy = typeof data?.updatedBy === 'string' ? data.updatedBy : 'system';
  return {
    aiAutoApproveEnabled: data?.aiAutoApproveEnabled === true,
    minTextConfidence: typeof data?.minTextConfidence === 'number' ? data.minTextConfidence : DEFAULT_CONFIG.minTextConfidence,
    maxRiskScore: typeof data?.maxRiskScore === 'number' ? data.maxRiskScore : DEFAULT_CONFIG.maxRiskScore,
    disallowedFlags: Array.isArray(data?.disallowedFlags) ? (data as { disallowedFlags: string[] }).disallowedFlags : DEFAULT_CONFIG.disallowedFlags,
    manualOnlyCategories: Array.isArray(data?.manualOnlyCategories) ? (data as { manualOnlyCategories: ListingCategory[] }).manualOnlyCategories : DEFAULT_CONFIG.manualOnlyCategories,
    manualOnlySellerUnverified: data?.manualOnlySellerUnverified !== false,
    policyVersion: typeof data?.policyVersion === 'number' ? data.policyVersion : DEFAULT_CONFIG.policyVersion,
    updatedAt,
    updatedBy,
  };
}
