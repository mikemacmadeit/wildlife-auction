import type { DocumentType, ListingCategory } from '@/lib/types';

export type ComplianceDisclosureKey =
  | 'animalIdDisclosure'
  | 'healthDisclosure'
  | 'transportDisclosure'
  | 'identificationDisclosure'
  | 'titleOrLienDisclosure'
  | 'cwdAware'
  | 'cwdCompliant';

export type CategoryComplianceRequirements = {
  category: ListingCategory;
  isAnimal: boolean;
  texasOnly: boolean;
  requiredDisclosures: ComplianceDisclosureKey[];
  /**
   * Required docs that must exist under `orders/{orderId}/documents/*` for compliance completeness.
   * (Upload/verification can be phased; but the *requirement* is explicit and stored.)
   */
  requiredOrderDocuments: DocumentType[];
  /**
   * Supported (optional) docs users can attach for this category.
   */
  supportedOrderDocuments: DocumentType[];
  requireBillOfSaleAtCheckout: boolean;
  // Future: required health docs can be toggled per category.
  requireHealthDocsOptionalOrRequired: 'none' | 'optional' | 'required';
};

export const CATEGORY_REQUIREMENTS: Record<ListingCategory, CategoryComplianceRequirements> = {
  whitetail_breeder: {
    category: 'whitetail_breeder',
    isAnimal: true,
    texasOnly: true,
    requiredDisclosures: ['cwdAware', 'cwdCompliant'],
    requiredOrderDocuments: ['TPWD_TRANSFER_APPROVAL'],
    supportedOrderDocuments: ['TPWD_TRANSFER_APPROVAL', 'DELIVERY_PROOF', 'HEALTH_CERTIFICATE', 'BILL_OF_SALE', 'OTHER'],
    requireBillOfSaleAtCheckout: false,
    requireHealthDocsOptionalOrRequired: 'optional',
  },
  wildlife_exotics: {
    category: 'wildlife_exotics',
    isAnimal: true,
    texasOnly: true,
    requiredDisclosures: ['animalIdDisclosure', 'healthDisclosure', 'transportDisclosure'],
    requiredOrderDocuments: [],
    supportedOrderDocuments: ['DELIVERY_PROOF', 'HEALTH_CERTIFICATE', 'BILL_OF_SALE', 'OTHER'],
    requireBillOfSaleAtCheckout: false,
    requireHealthDocsOptionalOrRequired: 'optional',
  },
  cattle_livestock: {
    category: 'cattle_livestock',
    isAnimal: true,
    texasOnly: true,
    requiredDisclosures: ['identificationDisclosure', 'healthDisclosure'],
    requiredOrderDocuments: [],
    supportedOrderDocuments: ['TAHC_CVI', 'HEALTH_CERTIFICATE', 'BILL_OF_SALE', 'DELIVERY_PROOF', 'OTHER'],
    requireBillOfSaleAtCheckout: false,
    requireHealthDocsOptionalOrRequired: 'optional',
  },
  farm_animals: {
    category: 'farm_animals',
    isAnimal: true,
    texasOnly: true,
    requiredDisclosures: ['identificationDisclosure', 'healthDisclosure'],
    requiredOrderDocuments: [],
    supportedOrderDocuments: ['TAHC_CVI', 'HEALTH_CERTIFICATE', 'BILL_OF_SALE', 'DELIVERY_PROOF', 'OTHER'],
    requireBillOfSaleAtCheckout: false,
    requireHealthDocsOptionalOrRequired: 'optional',
  },
  horse_equestrian: {
    category: 'horse_equestrian',
    isAnimal: true,
    texasOnly: true,
    requiredDisclosures: ['identificationDisclosure', 'healthDisclosure', 'transportDisclosure', 'titleOrLienDisclosure'],
    requiredOrderDocuments: ['BILL_OF_SALE'],
    supportedOrderDocuments: ['BILL_OF_SALE', 'HEALTH_CERTIFICATE', 'TAHC_CVI', 'DELIVERY_PROOF', 'OTHER'],
    requireBillOfSaleAtCheckout: true,
    requireHealthDocsOptionalOrRequired: 'optional',
  },
  sporting_working_dogs: {
    category: 'sporting_working_dogs',
    isAnimal: true,
    texasOnly: true,
    requiredDisclosures: ['identificationDisclosure', 'healthDisclosure', 'transportDisclosure'],
    requiredOrderDocuments: [],
    supportedOrderDocuments: ['HEALTH_CERTIFICATE', 'TAHC_CVI', 'DELIVERY_PROOF', 'BILL_OF_SALE', 'OTHER'],
    requireBillOfSaleAtCheckout: false,
    requireHealthDocsOptionalOrRequired: 'optional',
  },
  hunting_outfitter_assets: {
    category: 'hunting_outfitter_assets',
    isAnimal: false,
    texasOnly: false,
    requiredDisclosures: [],
    requiredOrderDocuments: [],
    supportedOrderDocuments: ['BILL_OF_SALE', 'DELIVERY_PROOF', 'OTHER'],
    requireBillOfSaleAtCheckout: false,
    requireHealthDocsOptionalOrRequired: 'none',
  },
  ranch_equipment: {
    category: 'ranch_equipment',
    isAnimal: false,
    texasOnly: false,
    requiredDisclosures: [],
    requiredOrderDocuments: [],
    supportedOrderDocuments: ['TITLE', 'BILL_OF_SALE', 'DELIVERY_PROOF', 'OTHER'],
    requireBillOfSaleAtCheckout: false,
    requireHealthDocsOptionalOrRequired: 'none',
  },
  ranch_vehicles: {
    category: 'ranch_vehicles',
    isAnimal: false,
    texasOnly: false,
    requiredDisclosures: [],
    requiredOrderDocuments: [],
    supportedOrderDocuments: ['TITLE', 'BILL_OF_SALE', 'DELIVERY_PROOF', 'OTHER'],
    requireBillOfSaleAtCheckout: false,
    requireHealthDocsOptionalOrRequired: 'none',
  },
};

export function getCategoryRequirements(category: ListingCategory): CategoryComplianceRequirements {
  return CATEGORY_REQUIREMENTS[category];
}

export function isTexasOnlyCategory(category: ListingCategory): boolean {
  return CATEGORY_REQUIREMENTS[category].texasOnly;
}

export function isAnimalCategory(category: ListingCategory): boolean {
  return CATEGORY_REQUIREMENTS[category].isAnimal;
}

export function getRequiredOrderDocuments(category: ListingCategory): DocumentType[] {
  return CATEGORY_REQUIREMENTS[category].requiredOrderDocuments;
}

