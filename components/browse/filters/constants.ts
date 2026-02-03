import type { ListingCategory, ListingType } from '@/lib/types';
import { EXOTIC_SPECIES_OPTIONS } from '@/lib/taxonomy/exotic-species';
import { FARM_ANIMAL_SPECIES_OPTIONS } from '@/lib/taxonomy/farm-animal-species';

export const BROWSE_CATEGORIES: { value: ListingCategory; label: string }[] = [
  { value: 'whitetail_breeder', label: 'Whitetail Breeder' },
  { value: 'wildlife_exotics', label: 'Specialty Livestock' },
  { value: 'cattle_livestock', label: 'Cattle' },
  { value: 'farm_animals', label: 'Farm Animals' },
  { value: 'horse_equestrian', label: 'Horse & Equestrian' },
  { value: 'sporting_working_dogs', label: 'Sporting & Working Dogs' },
  { value: 'hunting_outfitter_assets', label: 'Hunting & Outfitter Assets' },
  { value: 'ranch_equipment', label: 'Ranch Equipment & Attachments' },
  { value: 'ranch_vehicles', label: 'Ranch Vehicles & Trailers' },
];

/** When true, Sporting & Working Dogs is hidden from new/edit listing category choosers (can be re-enabled later). */
export const HIDE_SPORTING_WORKING_DOGS_AS_OPTION = true;

/** When true, Horse & Equestrian is hidden from new/edit listing category choosers (can be re-enabled later). */
export const HIDE_HORSE_AS_OPTION = true;

/** When true, Hunting & Outfitter Assets is hidden from new/edit listing category choosers (can be re-enabled later). */
export const HIDE_HUNTING_OUTFITTER_AS_OPTION = true;

/** When true, Ranch Equipment & Attachments is hidden from new/edit listing category choosers (can be re-enabled later). */
export const HIDE_RANCH_EQUIPMENT_AS_OPTION = true;

/** When true, Ranch Vehicles & Trailers is hidden from new/edit listing category choosers (can be re-enabled later). */
export const HIDE_RANCH_VEHICLES_AS_OPTION = true;

/** When true, Cattle is hidden from browse filters and new/edit listing category choosers (launch: whitetail + specialty livestock only). */
export const HIDE_CATTLE_AS_OPTION = true;

/** When true, Farm Animals is hidden from browse filters and new/edit listing category choosers (launch: whitetail + specialty livestock only). */
export const HIDE_FARM_ANIMALS_AS_OPTION = true;

/** Categories to show in Browse by Category / filters. Excludes hidden categories. */
export const BROWSE_CATEGORIES_FOR_DISPLAY = BROWSE_CATEGORIES.filter((c) => {
  if (c.value === 'cattle_livestock' && HIDE_CATTLE_AS_OPTION) return false;
  if (c.value === 'farm_animals' && HIDE_FARM_ANIMALS_AS_OPTION) return false;
  return !/dog|horse|equestrian|ranch_equipment|ranch_vehicles|hunting_outfitter/i.test((c.label || '') + (c.value || ''));
});

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

/** Species options when category is farm_animals (for browse filter). */
export const BROWSE_FARM_SPECIES: { value: string; label: string }[] = FARM_ANIMAL_SPECIES_OPTIONS;

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

/** Delivery timeframe options for create listing and browse filter. Use value for storage/filter.
 * All labels use consistent "X days" format for uniform badges across the app. */
export const DELIVERY_TIMEFRAME_OPTIONS: { value: string; label: string }[] = [
  { value: 'next_day', label: 'Next day' },
  { value: '1_3', label: '1-3 days' },
  { value: '3_7', label: '3-7 days' },
  { value: '7_14', label: '7-14 days' },
  { value: '14_30', label: '14-30 days' },
  { value: '30_60', label: '30-60 days' },
];

/** Resolve delivery timeframe value (from listing) to display label for badges. */
export function getDeliveryTimeframeLabel(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  return DELIVERY_TIMEFRAME_OPTIONS.find((o) => o.value === value.trim())?.label;
}