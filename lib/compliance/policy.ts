import type { DocumentType, ListingAttributes, ListingCategory, WildlifeAttributes } from '@/lib/types';
import { requiresComplianceReview } from '@/lib/compliance/validation';

export type ListingReviewMode = 'none' | 'pending_review';

// Explicit species policy sets (must match `WildlifeAttributes.speciesId` values in `lib/types.ts`).
const EXOTIC_CERVID_SPECIES = new Set<string>([
  // Cervids (exotic deer) — explicit list per policy
  'axis',
  'fallow',
  'red_deer',
  'red_stag',
  'sika',
  'elk',
  'sambar',
  'rusa',
  'chital',
  'muntjac',
  'barasingha',
]);

const ESA_CITES_OVERLAY_SPECIES = new Set<string>([
  // Explicit ESA/CITES overlay set per policy
  'scimitar_horned_oryx',
  'addax',
  'dama_gazelle',
  'bongo',
  'sitatunga',
]);

function getExoticSpeciesId(attributes: ListingAttributes): string | null {
  const a = attributes as Partial<WildlifeAttributes> | null | undefined;
  const v = a?.speciesId;
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export function getRequiredOrderDocsForListing(category: ListingCategory, attributes: ListingAttributes): DocumentType[] {
  if (category === 'whitetail_breeder') return ['TPWD_TRANSFER_APPROVAL'];
  // TAHC Certificate of Veterinary Inspection (CVI) is required for HORSES only (payout-side hold).
  // Do not add CVI requirements for exotics here.
  if (category === 'horse_equestrian') return ['TAHC_CVI']; // payout-only; checkout stays unchanged elsewhere

  // Disclosure-only or non-animal categories.
  return [];
}

export function getListingReviewMode(category: ListingCategory, attributes: ListingAttributes): ListingReviewMode {
  // Preserve existing whitetail behavior: always pending review.
  if (category === 'whitetail_breeder') return 'pending_review';

  if (category === 'wildlife_exotics') {
    const speciesId = getExoticSpeciesId(attributes);
    if (speciesId && ESA_CITES_OVERLAY_SPECIES.has(speciesId)) return 'pending_review';
    // Preserve existing behavior for `other_exotic` via the existing validator.
    if (requiresComplianceReview(category, attributes)) return 'pending_review';
  }

  return 'none';
}

export function getPayoutHoldRequirements(category: ListingCategory, attributes: ListingAttributes): {
  requiredVerifiedDocs: DocumentType[];
  requiresAdminApprovalBeforePayout: boolean;
  blockPayoutByDefault: boolean;
  holdReasonCode: string;
} {
  // IMPORTANT: whitetail payout enforcement remains the gold-standard path elsewhere.
  // This return value exists for completeness but should not override the existing TPWD flow.
  if (category === 'whitetail_breeder') {
    return {
      requiredVerifiedDocs: ['TPWD_TRANSFER_APPROVAL'],
      requiresAdminApprovalBeforePayout: false,
      blockPayoutByDefault: false,
      holdReasonCode: 'MISSING_TPWD_TRANSFER_APPROVAL',
    };
  }

  if (category === 'sporting_working_dogs') {
    return {
      requiredVerifiedDocs: [],
      requiresAdminApprovalBeforePayout: false,
      blockPayoutByDefault: false,
      holdReasonCode: 'NONE',
    };
  }

  if (category === 'cattle_livestock' || category === 'horse_equestrian') {
    // CVI hold is for horses only. Cattle/livestock do not require CVI by default in this policy.
    if (category === 'horse_equestrian') {
      return {
        requiredVerifiedDocs: ['TAHC_CVI'],
        requiresAdminApprovalBeforePayout: false,
        blockPayoutByDefault: false,
        holdReasonCode: 'MISSING_TAHC_CVI',
      };
    }

    return {
      requiredVerifiedDocs: [],
      requiresAdminApprovalBeforePayout: false,
      blockPayoutByDefault: false,
      holdReasonCode: 'NONE',
    };
  }

  if (category === 'wildlife_exotics') {
    const speciesId = getExoticSpeciesId(attributes);
    const isOther = speciesId === 'other_exotic';
    const isEsaOverlay = !!speciesId && ESA_CITES_OVERLAY_SPECIES.has(speciesId);
    const isCervid = !!speciesId && EXOTIC_CERVID_SPECIES.has(speciesId);

    if (isOther) {
      return {
        requiredVerifiedDocs: [],
        requiresAdminApprovalBeforePayout: true,
        blockPayoutByDefault: true,
        holdReasonCode: 'OTHER_EXOTIC_REVIEW_REQUIRED',
      };
    }

    if (isEsaOverlay) {
      return {
        requiredVerifiedDocs: [],
        requiresAdminApprovalBeforePayout: true,
        blockPayoutByDefault: true,
        holdReasonCode: 'ESA_REVIEW_REQUIRED',
      };
    }

    if (isCervid) {
      return {
        requiredVerifiedDocs: [],
        requiresAdminApprovalBeforePayout: true,
        blockPayoutByDefault: false,
        holdReasonCode: 'EXOTIC_CERVID_REVIEW_REQUIRED',
      };
    }

    // Exotics: no CVI requirement by default. Admin review applies only for the higher-risk cases above.
    return {
      requiredVerifiedDocs: [],
      requiresAdminApprovalBeforePayout: false,
      blockPayoutByDefault: false,
      holdReasonCode: 'NONE',
    };
  }

  // Default: no additional payout holds.
  return {
    requiredVerifiedDocs: [],
    requiresAdminApprovalBeforePayout: false,
    blockPayoutByDefault: false,
    holdReasonCode: 'NONE',
  };
}

