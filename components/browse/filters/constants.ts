import type { ListingCategory, ListingType } from '@/lib/types';
import { EXOTIC_SPECIES_OPTIONS } from '@/lib/taxonomy/exotic-species';

export const BROWSE_CATEGORIES: { value: ListingCategory; label: string }[] = [
  { value: 'whitetail_breeder', label: 'Whitetail Breeder' },
  { value: 'wildlife_exotics', label: 'Registered & Specialty Livestock' },
  { value: 'cattle_livestock', label: 'Cattle & Livestock' },
  { value: 'horse_equestrian', label: 'Horse & Equestrian' },
  { value: 'sporting_working_dogs', label: 'Sporting & Working Dogs' },
  { value: 'hunting_outfitter_assets', label: 'Hunting & Outfitter Assets' },
  { value: 'ranch_equipment', label: 'Ranch Equipment & Attachments' },
  { value: 'ranch_vehicles', label: 'Ranch Vehicles & Trailers' },
];

/** Categories to show in Browse by Category / filters (hides dog-related for Stripe review). */
export const BROWSE_CATEGORIES_FOR_DISPLAY = BROWSE_CATEGORIES.filter(
  (c) => !/dog/i.test((c.label || '') + (c.value || ''))
);

export const BROWSE_TYPES: { value: ListingType; label: string }[] = [
  { value: 'auction', label: 'Auction' },
  { value: 'fixed', label: 'Fixed Price' },
  { value: 'classified', label: 'Classified' },
];

// IMPORTANT: These values should match real stored `attributes.speciesId` values.
export const BROWSE_SPECIES: { value: string; label: string }[] = [
  // Whitetail breeder is fixed to this ID
  { value: 'whitetail_deer', label: 'Whitetail Deer' },
  // Wildlife & exotics (source-of-truth: `EXOTIC_SPECIES` in `lib/types.ts`)
  ...EXOTIC_SPECIES_OPTIONS,
];

export const BROWSE_STATES: { value: string; label: string }[] = [
  // Full US state list for better filtering + saved searches.
  { value: 'AL', label: 'Alabama' },
  { value: 'AK', label: 'Alaska' },
  { value: 'AZ', label: 'Arizona' },
  { value: 'AR', label: 'Arkansas' },
  { value: 'CA', label: 'California' },
  { value: 'CO', label: 'Colorado' },
  { value: 'CT', label: 'Connecticut' },
  { value: 'DE', label: 'Delaware' },
  { value: 'DC', label: 'District of Columbia' },
  { value: 'FL', label: 'Florida' },
  { value: 'GA', label: 'Georgia' },
  { value: 'HI', label: 'Hawaii' },
  { value: 'ID', label: 'Idaho' },
  { value: 'IL', label: 'Illinois' },
  { value: 'IN', label: 'Indiana' },
  { value: 'IA', label: 'Iowa' },
  { value: 'KS', label: 'Kansas' },
  { value: 'KY', label: 'Kentucky' },
  { value: 'LA', label: 'Louisiana' },
  { value: 'ME', label: 'Maine' },
  { value: 'MD', label: 'Maryland' },
  { value: 'MA', label: 'Massachusetts' },
  { value: 'MI', label: 'Michigan' },
  { value: 'MN', label: 'Minnesota' },
  { value: 'MS', label: 'Mississippi' },
  { value: 'MO', label: 'Missouri' },
  { value: 'MT', label: 'Montana' },
  { value: 'NE', label: 'Nebraska' },
  { value: 'NV', label: 'Nevada' },
  { value: 'NH', label: 'New Hampshire' },
  { value: 'NJ', label: 'New Jersey' },
  { value: 'NM', label: 'New Mexico' },
  { value: 'NY', label: 'New York' },
  { value: 'NC', label: 'North Carolina' },
  { value: 'ND', label: 'North Dakota' },
  { value: 'OH', label: 'Ohio' },
  { value: 'OK', label: 'Oklahoma' },
  { value: 'OR', label: 'Oregon' },
  { value: 'PA', label: 'Pennsylvania' },
  { value: 'RI', label: 'Rhode Island' },
  { value: 'SC', label: 'South Carolina' },
  { value: 'SD', label: 'South Dakota' },
  { value: 'TN', label: 'Tennessee' },
  { value: 'TX', label: 'Texas' },
  { value: 'UT', label: 'Utah' },
  { value: 'VT', label: 'Vermont' },
  { value: 'VA', label: 'Virginia' },
  { value: 'WA', label: 'Washington' },
  { value: 'WV', label: 'West Virginia' },
  { value: 'WI', label: 'Wisconsin' },
  { value: 'WY', label: 'Wyoming' },
];

export const BROWSE_QUANTITY_OPTIONS: {
  value: 'single' | 'pair' | 'small-group' | 'large-group' | 'lot';
  label: string;
}[] = [
  { value: 'single', label: 'Single (1)' },
  { value: 'pair', label: 'Pair (2)' },
  { value: 'small-group', label: 'Small Group (3-5)' },
  { value: 'large-group', label: 'Large Group (6-10)' },
  { value: 'lot', label: 'Lot (11+)' },
];

export const BROWSE_HEALTH_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'excellent', label: 'Excellent' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'recovering', label: 'Recovering' },
];

// Ranch equipment-specific condition options (stored in `attributes.condition`)
export const BROWSE_EQUIPMENT_CONDITION_OPTIONS: { value: string; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'excellent', label: 'Excellent' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'for_parts', label: 'For parts' },
];

