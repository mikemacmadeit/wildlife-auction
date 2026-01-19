import type { ListingCategory, ListingType } from '@/lib/types';

export const BROWSE_CATEGORIES: { value: ListingCategory; label: string }[] = [
  { value: 'whitetail_breeder', label: 'Whitetail Breeder' },
  { value: 'wildlife_exotics', label: 'Wildlife & Exotics' },
  { value: 'cattle_livestock', label: 'Cattle & Livestock' },
  { value: 'horse_equestrian', label: 'Horse & Equestrian' },
  { value: 'ranch_equipment', label: 'Ranch Equipment' },
];

export const BROWSE_TYPES: { value: ListingType; label: string }[] = [
  { value: 'auction', label: 'Auction' },
  { value: 'fixed', label: 'Fixed Price' },
  { value: 'classified', label: 'Classified' },
];

// IMPORTANT: These values should match real stored `attributes.speciesId` values.
export const BROWSE_SPECIES: { value: string; label: string }[] = [
  { value: 'whitetail_deer', label: 'Whitetail Deer' },
  { value: 'axis', label: 'Axis Deer' },
  { value: 'fallow', label: 'Fallow Deer' },
  { value: 'sika', label: 'Sika Deer' },
  { value: 'blackbuck', label: 'Blackbuck' },
  { value: 'aoudad', label: 'Aoudad (Barbary Sheep)' },
  { value: 'nilgai', label: 'Nilgai' },
  { value: 'scimitar_horned_oryx', label: 'Scimitar-Horned Oryx' },
  { value: 'addax', label: 'Addax' },
  { value: 'greater_kudu', label: 'Greater Kudu' },
  { value: 'red_stag', label: 'Red Stag' },
  { value: 'zebra', label: 'Zebra' },
  { value: 'other_exotic', label: 'Other / Exotic' },
];

export const BROWSE_STATES: { value: string; label: string }[] = [
  { value: 'TX', label: 'Texas' },
  { value: 'OK', label: 'Oklahoma' },
  { value: 'LA', label: 'Louisiana' },
  { value: 'AR', label: 'Arkansas' },
  { value: 'NM', label: 'New Mexico' },
  { value: 'MO', label: 'Missouri' },
  { value: 'KS', label: 'Kansas' },
  { value: 'CO', label: 'Colorado' },
  { value: 'AZ', label: 'Arizona' },
  { value: 'FL', label: 'Florida' },
  { value: 'GA', label: 'Georgia' },
  { value: 'AL', label: 'Alabama' },
  { value: 'MS', label: 'Mississippi' },
  { value: 'TN', label: 'Tennessee' },
  { value: 'KY', label: 'Kentucky' },
  { value: 'other', label: 'Other States' },
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

