/**
 * Compliance Validation Utilities
 * 
 * Server-side validation for Texas wildlife/livestock compliance
 */

import { ListingCategory, ListingType, ListingAttributes, WhitetailBreederAttributes, WildlifeAttributes, CattleAttributes, EquipmentAttributes, EXOTIC_SPECIES } from '@/lib/types';

// Prohibited keywords that cannot appear in listings
const PROHIBITED_KEYWORDS = [
  'venison',
  'meat',
  'backstrap',
  'deer meat',
  'hunting tag',
  'tags',
  'license',
  'licenses',
  'wild whitetail',
  'game tag',
  'permit sale',
  'tag sale'
];

/**
 * Check if text contains prohibited keywords
 */
export function containsProhibitedKeywords(text: string): boolean {
  const lowerText = text.toLowerCase();
  return PROHIBITED_KEYWORDS.some(keyword => lowerText.includes(keyword));
}

/**
 * Validate Texas-only requirement for animal listings
 */
export function validateTexasOnly(category: ListingCategory, locationState: string): void {
  const animalCategories: ListingCategory[] = ['whitetail_breeder', 'wildlife_exotics', 'cattle_livestock'];
  
  if (animalCategories.includes(category) && locationState !== 'TX') {
    throw new Error(`Animal listings must be located in Texas. Current location: ${locationState}`);
  }
}

/**
 * Validate single-mode listing (no hybrid auction + buy now)
 */
export function validateSingleMode(type: ListingType, data: { price?: number; startingBid?: number; reservePrice?: number }): void {
  if (type === 'auction') {
    // Auction cannot have fixed price
    if (data.price !== undefined && data.price !== null) {
      throw new Error('Auction listings cannot have a fixed price. Use startingBid instead.');
    }
  } else if (type === 'fixed') {
    // Fixed price cannot have auction fields
    if (data.startingBid !== undefined || data.reservePrice !== undefined) {
      throw new Error('Fixed price listings cannot have auction fields (startingBid, reservePrice).');
    }
  }
  // classified can have asking price but no checkout
}

/**
 * Validate prohibited items in listing content
 */
export function validateProhibitedContent(title: string, description: string, attributes: ListingAttributes): void {
  // Check title and description
  if (containsProhibitedKeywords(title)) {
    throw new Error('Listing title contains prohibited keywords. Cannot list venison, meat, hunting tags, licenses, or wild whitetail.');
  }
  
  if (containsProhibitedKeywords(description)) {
    throw new Error('Listing description contains prohibited keywords. Cannot list venison, meat, hunting tags, licenses, or wild whitetail.');
  }
  
  // Check species field for wildlife/exotics (use `speciesId`)
  if ('speciesId' in attributes) {
    const species = String((attributes as any).speciesId || '');
    if (containsProhibitedKeywords(species)) {
      throw new Error('Species field contains prohibited keywords. Cannot list venison, meat, hunting tags, licenses, or wild whitetail.');
    }
    // Additional check: block whitetail in species field if category is wildlife_exotics
    const speciesLower = species.toLowerCase();
    if (speciesLower.includes('whitetail') || speciesLower.includes('white-tail')) {
      throw new Error('Whitetail deer cannot be listed in Wildlife/Exotics category. Use "Whitetail Breeder" category instead.');
    }
  }
}

/**
 * Validate whitetail breeder compliance requirements
 */
export function validateWhitetailBreeder(attributes: WhitetailBreederAttributes): void {
  if (!attributes.tpwdBreederPermitNumber || attributes.tpwdBreederPermitNumber.trim() === '') {
    throw new Error('TPWD Breeder Permit Number is required for whitetail breeder listings.');
  }
  
  if (!attributes.breederFacilityId || attributes.breederFacilityId.trim() === '') {
    throw new Error('Breeder Facility ID is required for whitetail breeder listings.');
  }

  if (!attributes.tpwdPermitExpirationDate) {
    throw new Error('TPWD permit expiration date is required for whitetail breeder listings.');
  }

  // Normalize Firestore Timestamp/Date to Date (defensive)
  const exp: any = (attributes as any).tpwdPermitExpirationDate;
  const expDate: Date | null =
    exp?.toDate?.() ||
    (exp instanceof Date ? exp : null);

  if (!expDate || Number.isNaN(expDate.getTime())) {
    throw new Error('Invalid TPWD permit expiration date. Please enter a valid date.');
  }

  if (expDate.getTime() < Date.now()) {
    throw new Error('Your TPWD Deer Breeder Permit is expired. Please renew your permit before submitting a whitetail breeder listing.');
  }
  
  if (!attributes.deerIdTag || attributes.deerIdTag.trim() === '') {
    throw new Error('Deer ID Tag is required for whitetail breeder listings.');
  }
  
  if (!attributes.cwdDisclosureChecklist?.cwdAware) {
    throw new Error('CWD awareness disclosure is required for whitetail breeder listings.');
  }
  
  if (!attributes.cwdDisclosureChecklist?.cwdCompliant) {
    throw new Error('CWD compliance disclosure is required for whitetail breeder listings.');
  }
}

/**
 * Compute whitetail permit expiration status for UI/admin display.
 * (Does not block; blocking happens in validateWhitetailBreeder above.)
 */
export function getPermitExpirationStatus(expiration: unknown): {
  expired: boolean;
  expiringSoon: boolean;
  daysRemaining: number | null;
} {
  const exp: any = expiration as any;
  const expDate: Date | null =
    exp?.toDate?.() ||
    (exp instanceof Date ? exp : null);

  if (!expDate || Number.isNaN(expDate.getTime())) {
    return { expired: false, expiringSoon: false, daysRemaining: null };
  }

  const msRemaining = expDate.getTime() - Date.now();
  const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));
  return {
    expired: msRemaining < 0,
    expiringSoon: msRemaining >= 0 && daysRemaining <= 60,
    daysRemaining,
  };
}

/**
 * Validate wildlife exotics compliance requirements
 */
export function validateWildlifeExotics(attributes: WildlifeAttributes): void {
  if (!attributes.speciesId || attributes.speciesId.trim() === '') {
    throw new Error('Species ID is required for wildlife/exotics listings.');
  }
  
  // CRITICAL: Block whitetail in wildlife_exotics (must use whitetail_breeder category)
  const speciesLower = attributes.speciesId.toLowerCase();
  if (speciesLower.includes('whitetail') || speciesLower.includes('white-tail') || speciesLower === 'whitetail_deer') {
    throw new Error('Whitetail deer must be listed under "Whitetail Breeder" category, not Wildlife/Exotics. This ensures proper TPWD permit verification.');
  }
  
  // Check if species is in controlled list
  if (!EXOTIC_SPECIES.includes(attributes.speciesId as any)) {
    throw new Error(`Invalid species ID: ${attributes.speciesId}. Must be one of: ${EXOTIC_SPECIES.join(', ')}`);
  }
  
  if (attributes.animalIdDisclosure === undefined || attributes.animalIdDisclosure === false) {
    throw new Error('Animal identification disclosure is required for wildlife/exotics listings.');
  }
  
  if (attributes.healthDisclosure === undefined || attributes.healthDisclosure === false) {
    throw new Error('Health disclosure is required for wildlife/exotics listings.');
  }
  
  if (attributes.transportDisclosure === undefined || attributes.transportDisclosure === false) {
    throw new Error('Transport disclosure (TX-only) is required for wildlife/exotics listings.');
  }
}

/**
 * Validate cattle compliance requirements
 */
export function validateCattle(attributes: CattleAttributes): void {
  if (!attributes.breed || attributes.breed.trim() === '') {
    throw new Error('Breed is required for cattle listings.');
  }
  
  // Require either age or weightRange
  if (!attributes.age && !attributes.weightRange) {
    throw new Error('Either age or weight range is required for cattle listings.');
  }
  
  // Require registration number if registered
  if (attributes.registered && (!attributes.registrationNumber || attributes.registrationNumber.trim() === '')) {
    throw new Error('Registration number is required when animal is registered.');
  }
  
  if (attributes.identificationDisclosure === undefined || attributes.identificationDisclosure === false) {
    throw new Error('Identification disclosure (ear tags/brand) is required for cattle listings.');
  }
  
  if (attributes.healthDisclosure === undefined || attributes.healthDisclosure === false) {
    throw new Error('Health disclosure is required for cattle listings.');
  }
}

/**
 * Validate equipment compliance requirements
 */
export function validateEquipment(attributes: EquipmentAttributes): void {
  const vehiclesRequiringTitle: EquipmentAttributes['equipmentType'][] = ['utv', 'atv', 'trailer'];
  
  if (vehiclesRequiringTitle.includes(attributes.equipmentType)) {
    if (attributes.hasTitle === undefined) {
      throw new Error('Title status (hasTitle) is required for vehicles (UTV, ATV, Trailer).');
    }
    
    if (!attributes.vinOrSerial || attributes.vinOrSerial.trim() === '') {
      throw new Error('VIN or Serial Number is required for vehicles (UTV, ATV, Trailer).');
    }
  }
}

/**
 * Validate listing compliance based on category
 */
export function validateListingCompliance(
  category: ListingCategory,
  attributes: ListingAttributes,
  locationState: string,
  title: string,
  description: string,
  type: ListingType,
  pricingData: { price?: number; startingBid?: number; reservePrice?: number }
): void {
  // P0: Texas-only for animals
  validateTexasOnly(category, locationState);
  
  // P0: Single-mode validation
  validateSingleMode(type, pricingData);
  
  // P0: Prohibited content
  validateProhibitedContent(title, description, attributes);
  
  // Category-specific validation
  switch (category) {
    case 'whitetail_breeder':
      validateWhitetailBreeder(attributes as WhitetailBreederAttributes);
      break;
    case 'wildlife_exotics':
      validateWildlifeExotics(attributes as WildlifeAttributes);
      break;
    case 'cattle_livestock':
      validateCattle(attributes as CattleAttributes);
      break;
    case 'ranch_equipment':
      validateEquipment(attributes as EquipmentAttributes);
      break;
  }
}

/**
 * Check if listing requires compliance review
 */
export function requiresComplianceReview(category: ListingCategory, attributes: ListingAttributes): boolean {
  if (category === 'whitetail_breeder') {
    // Always requires review for whitetail breeder
    return true;
  }
  
  if (category === 'wildlife_exotics') {
    const exoticsAttrs = attributes as WildlifeAttributes;
    // Requires review if species is 'other_exotic'
    return exoticsAttrs.speciesId === 'other_exotic';
  }
  
  // Cattle and equipment don't require review by default
  return false;
}
