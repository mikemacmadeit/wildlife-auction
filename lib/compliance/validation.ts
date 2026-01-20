/**
 * Compliance Validation Utilities
 * 
 * Server-side validation for Texas wildlife/livestock compliance
 */

import {
  ListingCategory,
  ListingType,
  ListingAttributes,
  WhitetailBreederAttributes,
  WildlifeAttributes,
  CattleAttributes,
  EquipmentAttributes,
  HorseAttributes,
  SportingWorkingDogAttributes,
  EXOTIC_SPECIES,
} from '@/lib/types';
import { isTexasOnlyCategory } from '@/lib/compliance/requirements';

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
  if (isTexasOnlyCategory(category) && locationState !== 'TX') {
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
export function validateProhibitedContent(
  category: ListingCategory,
  title: string,
  description: string,
  attributes: ListingAttributes
): void {
  // Check title and description
  if (containsProhibitedKeywords(title)) {
    throw new Error('Listing title contains prohibited keywords. Cannot list venison, meat, hunting tags, licenses, or wild whitetail.');
  }
  
  if (containsProhibitedKeywords(description)) {
    throw new Error('Listing description contains prohibited keywords. Cannot list venison, meat, hunting tags, licenses, or wild whitetail.');
  }
  
  // Category hard rule: whitetail can NEVER be listed under wildlife_exotics
  if (category === 'wildlife_exotics') {
    const combined = `${title}\n${description}`.toLowerCase();
    if (combined.includes('whitetail') || combined.includes('white-tail') || combined.includes('white tail')) {
      throw new Error('Whitetail deer cannot be listed in Wildlife/Exotics category. Use "Whitetail Breeder" category instead.');
    }
  }

  // Check attributes (speciesId) for prohibited keywords
  if ('speciesId' in attributes) {
    const species = String((attributes as any).speciesId || '');
    if (containsProhibitedKeywords(species)) {
      throw new Error('Species field contains prohibited keywords. Cannot list venison, meat, hunting tags, licenses, or wild whitetail.');
    }

    if (category === 'wildlife_exotics') {
      const speciesLower = species.toLowerCase();
      if (speciesLower.includes('whitetail') || speciesLower.includes('white-tail') || speciesLower.includes('white tail')) {
        throw new Error('Whitetail deer cannot be listed in Wildlife/Exotics category. Use "Whitetail Breeder" category instead.');
      }
    }
  }
}

/**
 * Validate whitetail breeder compliance requirements
 */
export function validateWhitetailBreeder(attributes: WhitetailBreederAttributes): void {
  // Core required fields
  if (!attributes.sex || String(attributes.sex).trim() === '') {
    throw new Error('Sex is required for whitetail breeder listings.');
  }
  if (typeof (attributes as any).quantity !== 'number' || !Number.isFinite((attributes as any).quantity) || (attributes as any).quantity < 1) {
    throw new Error('Quantity is required and must be at least 1 for whitetail breeder listings.');
  }

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

  if (!attributes.sex || String(attributes.sex).trim() === '') {
    throw new Error('Sex is required for wildlife/exotics listings.');
  }

  if (typeof (attributes as any).quantity !== 'number' || !Number.isFinite((attributes as any).quantity) || (attributes as any).quantity < 1) {
    throw new Error('Quantity is required and must be at least 1 for wildlife/exotics listings.');
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

  if (!attributes.sex || String(attributes.sex).trim() === '') {
    throw new Error('Sex is required for cattle listings.');
  }

  if (typeof (attributes as any).quantity !== 'number' || !Number.isFinite((attributes as any).quantity) || (attributes as any).quantity < 1) {
    throw new Error('Quantity is required and must be at least 1 for cattle listings.');
  }
  
  // Require either age or weightRange
  const hasAge =
    typeof (attributes as any).age === 'number'
      ? Number.isFinite((attributes as any).age)
      : !!String((attributes as any).age || '').trim();
  const hasWeight = !!String(attributes.weightRange || '').trim();
  if (!hasAge && !hasWeight) {
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
  // Core required fields for all equipment-like categories
  if (!attributes || typeof attributes !== 'object') {
    throw new Error('Equipment attributes are required.');
  }
  if (!attributes.equipmentType || String(attributes.equipmentType).trim() === '') {
    throw new Error('Equipment type is required.');
  }
  if (!attributes.condition || String((attributes as any).condition).trim() === '') {
    throw new Error('Condition is required.');
  }
  const qty = Number((attributes as any).quantity);
  if (!Number.isFinite(qty) || qty < 1) {
    throw new Error('Quantity is required and must be at least 1.');
  }

  const vehiclesRequiringTitle: EquipmentAttributes['equipmentType'][] = [
    'utv',
    'atv',
    'truck',
    'trailer',
    'stock_trailer',
    'gooseneck_trailer',
    'flatbed_trailer',
    'utility_trailer',
    'dump_trailer',
    'horse_trailer',
    'equipment_trailer',
  ];
  
  if (vehiclesRequiringTitle.includes(attributes.equipmentType)) {
    if (attributes.hasTitle === undefined) {
      throw new Error('Title status (hasTitle) is required for vehicles (UTV, ATV, Trailer, Truck).');
    }
    
    if (!attributes.vinOrSerial || attributes.vinOrSerial.trim() === '') {
      throw new Error('VIN or Serial Number is required for vehicles (UTV, ATV, Trailer, Truck).');
    }
  }
}

/**
 * Validate hunting/outfitter assets (restricted allowlist).
 */
export function validateHuntingOutfitterAssets(attributes: EquipmentAttributes): void {
  // Reuse generic equipment validation first (condition/quantity/etc are enforced elsewhere in UI,
  // but VIN/title rules should still apply if someone picks a vehicle type somehow).
  validateEquipment(attributes);

  const allowed: EquipmentAttributes['equipmentType'][] = [
    'camera_system',
    'surveillance_system',
    'thermal_optics',
    'blind',
    'water_system',
  ];
  if (!allowed.includes(attributes.equipmentType)) {
    throw new Error(
      'Hunting & Outfitter Assets must be an allowed asset type (Camera System, Blind, or Water/Well System).'
    );
  }

  // Ensure we have enough identifying info for high-value camera systems.
  if (attributes.equipmentType === 'camera_system' || attributes.equipmentType === 'surveillance_system' || attributes.equipmentType === 'thermal_optics') {
    if (!String(attributes.make || '').trim() || !String(attributes.model || '').trim()) {
      throw new Error('This asset type must include make and model.');
    }
  }
}

/**
 * Validate horse/equestrian compliance requirements
 */
export function validateHorse(attributes: HorseAttributes): void {
  if (!attributes || typeof attributes !== 'object') {
    throw new Error('Horse attributes are required.');
  }

  if (attributes.speciesId !== 'horse') {
    throw new Error('Horse listings must have speciesId = "horse".');
  }

  const sex = String((attributes as any).sex || '').trim();
  if (!sex) {
    throw new Error('Sex is required for horse listings.');
  }

  // Registered must be explicitly set
  if (typeof (attributes as any).registered !== 'boolean') {
    throw new Error('Registered status is required for horse listings.');
  }

  const qty = Number((attributes as any).quantity);
  if (!Number.isFinite(qty) || qty < 1) {
    throw new Error('Quantity is required and must be at least 1 for horse listings.');
  }

  if (attributes.registered) {
    if (!attributes.registrationNumber || String(attributes.registrationNumber).trim() === '') {
      throw new Error('Registration number is required when the horse is registered.');
    }
  }

  // Disclosures must be explicitly true (seller attestation)
  const d: any = (attributes as any).disclosures || {};
  if (d.identificationDisclosure !== true) throw new Error('Identification disclosure is required for horse listings.');
  if (d.healthDisclosure !== true) throw new Error('Health disclosure is required for horse listings.');
  if (d.transportDisclosure !== true) throw new Error('Transport disclosure is required for horse listings.');
  if (d.titleOrLienDisclosure !== true) throw new Error('Title/lien disclosure is required for horse listings.');
}

/**
 * Validate sporting/working dogs compliance requirements
 */
export function validateSportingWorkingDogs(attributes: SportingWorkingDogAttributes): void {
  if (!attributes || typeof attributes !== 'object') {
    throw new Error('Dog attributes are required.');
  }

  if ((attributes as any).speciesId !== 'dog') {
    throw new Error('Sporting & Working Dogs listings must have speciesId = "dog".');
  }

  if (!String((attributes as any).breed || '').trim()) {
    throw new Error('Breed is required for Sporting & Working Dogs listings.');
  }

  const hasAge =
    typeof (attributes as any).age === 'number'
      ? Number.isFinite((attributes as any).age)
      : !!String((attributes as any).age || '').trim();
  if (!hasAge) {
    throw new Error('Age is required for Sporting & Working Dogs listings.');
  }

  const sex = String((attributes as any).sex || '').trim();
  if (!sex) {
    throw new Error('Sex is required for Sporting & Working Dogs listings.');
  }

  if ((attributes as any).identificationDisclosure !== true) {
    throw new Error('Identification disclosure is required for Sporting & Working Dogs listings.');
  }
  if ((attributes as any).healthDisclosure !== true) {
    throw new Error('Health disclosure is required for Sporting & Working Dogs listings.');
  }
  if ((attributes as any).transportDisclosure !== true) {
    throw new Error('Transport disclosure is required for Sporting & Working Dogs listings.');
  }

  const qty = Number((attributes as any).quantity);
  if (!Number.isFinite(qty) || qty < 1) {
    throw new Error('Quantity is required and must be at least 1.');
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
  validateProhibitedContent(category, title, description, attributes);
  
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
    case 'horse_equestrian':
      validateHorse(attributes as HorseAttributes);
      break;
    case 'sporting_working_dogs':
      validateSportingWorkingDogs(attributes as SportingWorkingDogAttributes);
      break;
    case 'ranch_equipment':
      validateEquipment(attributes as EquipmentAttributes);
      break;
    case 'ranch_vehicles':
      // Equipment-like category. Reuse equipment validation rules.
      validateEquipment(attributes as EquipmentAttributes);
      break;
    case 'hunting_outfitter_assets':
      validateHuntingOutfitterAssets(attributes as EquipmentAttributes);
      break;
    default:
      // Fail closed so newly-added/unknown categories cannot bypass compliance.
      throw new Error(`Unsupported category: ${String(category)}`);
  }
}

/**
 * Check if listing requires compliance review
 */
const ESA_CITES_OVERLAY_SPECIES = new Set<string>([
  'scimitar_horned_oryx',
  'addax',
  'dama_gazelle',
  'bongo',
  'sitatunga',
]);

export function requiresComplianceReview(category: ListingCategory, attributes: ListingAttributes): boolean {
  if (category === 'whitetail_breeder') {
    // Always requires review for whitetail breeder
    return true;
  }
  
  if (category === 'wildlife_exotics') {
    const exoticsAttrs = attributes as WildlifeAttributes;
    // Requires review if species is 'other_exotic' or ESA/CITES overlay list (policy).
    return exoticsAttrs.speciesId === 'other_exotic' || ESA_CITES_OVERLAY_SPECIES.has(exoticsAttrs.speciesId);
  }

  if (category === 'horse_equestrian') {
    // No admin review by default for horses (requirements engine can tighten this later).
    return false;
  }

  if (category === 'sporting_working_dogs') {
    // No admin review by default (can tighten later).
    return false;
  }
  
  // Cattle and equipment don't require review by default
  return false;
}
