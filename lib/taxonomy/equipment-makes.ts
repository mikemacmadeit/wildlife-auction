import type { SearchableSelectOption } from '@/components/ui/searchable-select';
import type { ListingCategory } from '@/lib/types';

function withOther(options: SearchableSelectOption[]): SearchableSelectOption[] {
  const hasOther = options.some((o) => o.value === 'other');
  return hasOther ? options : [...options, { value: 'other', label: 'Other (not listed)' }];
}

/**
 * Per-category / per-selection make options.
 *
 * NOTE: We intentionally keep makes as a *curated* list for UX + filtering,
 * and always include an "Other" escape hatch for back-compat + long tail.
 */
const RANCH_EQUIPMENT_MAKES: SearchableSelectOption[] = [
  { value: 'john_deere', label: 'John Deere' },
  { value: 'kubota', label: 'Kubota' },
  { value: 'case_ih', label: 'Case IH' },
  { value: 'new_holland', label: 'New Holland' },
  { value: 'mahindra', label: 'Mahindra' },
  { value: 'massey_ferguson', label: 'Massey Ferguson' },
  { value: 'claas', label: 'CLAAS' },
  { value: 'fendt', label: 'Fendt' },
  { value: 'deutz_fahr', label: 'Deutz-Fahr' },
  { value: 'kioti', label: 'KIOTI' },
  { value: 'ls_tractor', label: 'LS Tractor' },
  { value: 'tym', label: 'TYM' },
  { value: 'bobcat', label: 'Bobcat' },
  { value: 'caterpillar', label: 'Caterpillar' },
  { value: 'komatsu', label: 'Komatsu' },
  { value: 'takeuchi', label: 'Takeuchi' },
  { value: 'jcb', label: 'JCB' },
  { value: 'vermeer', label: 'Vermeer' },
  { value: 'bush_hog', label: 'Bush Hog' },
  { value: 'land_pride', label: 'Land Pride' },
  { value: 'woods', label: 'Woods' },
  { value: 'frontier', label: 'Frontier' },
  { value: 'toro', label: 'Toro' },
  { value: 'stihl', label: 'STIHL' },
  { value: 'husqvarna', label: 'Husqvarna' },
];

const FEEDER_MAKES: SearchableSelectOption[] = [
  { value: 'texas_hunter', label: 'Texas Hunter' },
  { value: 'all_seasons_feeders', label: 'All Seasons Feeders' },
  { value: 'boss_buck', label: 'Boss Buck' },
  { value: 'moultrie', label: 'Moultrie' },
  { value: 'mfi', label: 'MFI (Metal Fabricating Inc.)' },
  { value: 'lamco', label: 'Lamco' },
  { value: 'game_feeder', label: 'Game Feeder' },
];

const FENCING_MAKES: SearchableSelectOption[] = [
  { value: 'priefert', label: 'Priefert' },
  { value: 'powder_river', label: 'Powder River' },
  { value: 'behlen_country', label: 'Behlen Country' },
  { value: 'sioux_steel', label: 'Sioux Steel' },
  { value: 'tarter', label: 'Tarter' },
  { value: 'stay_tuff', label: 'Stay-Tuff' },
];

const TRUCK_MAKES: SearchableSelectOption[] = [
  { value: 'ford', label: 'Ford' },
  { value: 'chevrolet', label: 'Chevrolet' },
  { value: 'gmc', label: 'GMC' },
  { value: 'ram', label: 'Ram' },
  { value: 'toyota', label: 'Toyota' },
  { value: 'nissan', label: 'Nissan' },
  { value: 'jeep', label: 'Jeep' },
];

const UTV_MAKES: SearchableSelectOption[] = [
  { value: 'polaris', label: 'Polaris' },
  { value: 'can_am', label: 'Can-Am' },
  { value: 'kawasaki', label: 'Kawasaki' },
  { value: 'honda', label: 'Honda' },
  { value: 'yamaha', label: 'Yamaha' },
  { value: 'john_deere', label: 'John Deere' },
  { value: 'kubota', label: 'Kubota' },
  { value: 'arctic_cat', label: 'Arctic Cat' },
  { value: 'cfmoto', label: 'CFMOTO' },
  { value: 'textron', label: 'Textron Off Road' },
  { value: 'hisun', label: 'Hisun' },
  { value: 'kymco', label: 'Kymco' },
  { value: 'segway', label: 'Segway Powersports' },
  { value: 'intimidator', label: 'Intimidator' },
  { value: 'massimo', label: 'Massimo' },
  { value: 'tracker_off_road', label: 'Tracker Off Road' },
];

const ATV_MAKES: SearchableSelectOption[] = [
  { value: 'polaris', label: 'Polaris' },
  { value: 'can_am', label: 'Can-Am' },
  { value: 'kawasaki', label: 'Kawasaki' },
  { value: 'honda', label: 'Honda' },
  { value: 'yamaha', label: 'Yamaha' },
  { value: 'suzuki', label: 'Suzuki' },
  { value: 'cfmoto', label: 'CFMOTO' },
  { value: 'kymco', label: 'Kymco' },
  { value: 'hisun', label: 'Hisun' },
  { value: 'segway', label: 'Segway Powersports' },
];

const TRAILER_MAKES: SearchableSelectOption[] = [
  { value: 'big_tex', label: 'Big Tex' },
  { value: 'pj', label: 'PJ' },
  { value: 'diamond_c', label: 'Diamond C' },
  { value: 'load_trail', label: 'Load Trail' },
  { value: 'lamar', label: 'Lamar' },
  { value: 'delco', label: 'Delco' },
  { value: 'trailers_plus', label: 'TrailersPlus' },
  { value: 'sure_trac', label: 'Sure-Trac' },
  { value: 'carry_on', label: 'Carry-On' },
  { value: 'bwise', label: 'Bwise' },
  { value: 'wells_cargo', label: 'Wells Cargo' },
  { value: 'continental_cargo', label: 'Continental Cargo' },
];

const HORSE_TRAILER_MAKES: SearchableSelectOption[] = [
  { value: 'sundowner', label: 'Sundowner' },
  { value: 'featherlite', label: 'Featherlite' },
  { value: 'four_star', label: '4-Star' },
  { value: 'platinum', label: 'Platinum Coach' },
  { value: 'exiss', label: 'Exiss' },
  { value: 'hawk', label: 'Hawk' },
  { value: 'hart', label: 'Hart' },
  { value: 'cm', label: 'CM Trailers' },
];

const STOCK_TRAILER_MAKES: SearchableSelectOption[] = [
  { value: 'wilson', label: 'Wilson' },
  { value: 'ww', label: 'W.W. Trailer' },
  { value: 'eastern', label: 'Eastern' },
  { value: 'cm', label: 'CM Trailers' },
  { value: 'trail_rite', label: 'Trail-Rite' },
  { value: 'titan', label: 'Titan' },
];

const BLIND_MAKES: SearchableSelectOption[] = [
  { value: 'redneck_blinds', label: 'Redneck Blinds' },
  { value: 'banks_outdoors', label: 'Banks Outdoors' },
  { value: 'muddy', label: 'Muddy' },
  { value: 'primal', label: 'Primal' },
  { value: 'millennium', label: 'Millennium' },
  { value: 'big_game', label: 'Big Game' },
  { value: 'shadow_hunter', label: 'Shadow Hunter' },
  { value: 'boss_buck', label: 'Boss Buck' },
];

const CAMERA_MAKES: SearchableSelectOption[] = [
  { value: 'reconyx', label: 'Reconyx' },
  { value: 'browning', label: 'Browning' },
  { value: 'spypoint', label: 'SPYPOINT' },
  { value: 'tactacam', label: 'Tactacam' },
  { value: 'moultrie', label: 'Moultrie' },
  { value: 'stealth_cam', label: 'Stealth Cam' },
  { value: 'bushnell', label: 'Bushnell' },
];

const SURVEILLANCE_MAKES: SearchableSelectOption[] = [
  { value: 'ubiquiti', label: 'Ubiquiti (UniFi)' },
  { value: 'reolink', label: 'Reolink' },
  { value: 'arlo', label: 'Arlo' },
  { value: 'hikvision', label: 'Hikvision' },
  { value: 'dahua', label: 'Dahua' },
  { value: 'ring', label: 'Ring' },
];

const THERMAL_MAKES: SearchableSelectOption[] = [
  { value: 'pulsar', label: 'Pulsar' },
  { value: 'atn', label: 'ATN' },
  { value: 'flir', label: 'FLIR' },
  { value: 'trijicon', label: 'Trijicon' },
  { value: 'agm', label: 'AGM' },
  { value: 'leupold', label: 'Leupold' },
];

const WATER_SYSTEM_MAKES: SearchableSelectOption[] = [
  { value: 'grundfos', label: 'Grundfos' },
  { value: 'goulds', label: 'Goulds' },
  { value: 'franklin_electric', label: 'Franklin Electric' },
  { value: 'lorentz', label: 'Lorentz' },
  { value: 'rps', label: 'RPS Solar Pumps' },
];

export function getEquipmentMakeOptions(args: {
  category: ListingCategory;
  equipmentType?: string | null;
}): SearchableSelectOption[] {
  const category = args.category;
  const t = String(args.equipmentType || '').trim().toLowerCase();

  // Vehicles are strongly typed: show vehicle-specific makes.
  if (category === 'ranch_vehicles') {
    if (t === 'truck') return withOther(TRUCK_MAKES);
    if (t === 'utv') return withOther(UTV_MAKES);
    if (t === 'atv') return withOther(ATV_MAKES);
    if (t === 'horse_trailer') return withOther(HORSE_TRAILER_MAKES);
    if (t === 'stock_trailer') return withOther(STOCK_TRAILER_MAKES);
    if (t.includes('trailer')) return withOther(TRAILER_MAKES);
    return withOther(TRUCK_MAKES);
  }

  // Hunting/outfitter assets are not tractors: show asset-specific brands.
  if (category === 'hunting_outfitter_assets') {
    if (t === 'blind') return withOther(BLIND_MAKES);
    if (t === 'camera_system') return withOther(CAMERA_MAKES);
    if (t === 'surveillance_system') return withOther(SURVEILLANCE_MAKES);
    if (t === 'thermal_optics') return withOther(THERMAL_MAKES);
    if (t === 'water_system') return withOther(WATER_SYSTEM_MAKES);
    return withOther(CAMERA_MAKES);
  }

  // Ranch equipment: default tractor/implement makes, but override for certain equipment types.
  if (category === 'ranch_equipment') {
    if (t === 'feeder') return withOther(FEEDER_MAKES);
    if (t === 'fencing') return withOther(FENCING_MAKES);
    return withOther(RANCH_EQUIPMENT_MAKES);
  }

  // Safe fallback
  return withOther(RANCH_EQUIPMENT_MAKES);
}

/**
 * Model suggestions are intentionally lightweight: we keep Model as free-text
 * (for back-compat + long tail), but provide per-selection suggestions where it helps.
 */
export function getEquipmentModelSuggestions(args: {
  category: ListingCategory;
  equipmentType?: string | null;
  make?: string | null;
}): string[] {
  const category = args.category;
  const t = String(args.equipmentType || '').trim().toLowerCase();
  const make = String(args.make || '').trim().toLowerCase();

  if (category === 'ranch_vehicles') {
    if (t === 'truck') {
      if (make === 'ford') return ['F-150', 'F-250', 'F-350', 'Ranger'];
      if (make === 'chevrolet') return ['Silverado 1500', 'Silverado 2500HD', 'Colorado'];
      if (make === 'gmc') return ['Sierra 1500', 'Sierra 2500HD', 'Canyon'];
      if (make === 'ram') return ['1500', '2500', '3500'];
      if (make === 'toyota') return ['Tundra', 'Tacoma'];
      if (make === 'nissan') return ['Titan', 'Frontier'];
    }
    if (t === 'utv') {
      if (make === 'polaris') return ['Ranger', 'RZR', 'General'];
      if (make === 'can_am') return ['Defender', 'Maverick'];
      if (make === 'kawasaki') return ['Mule', 'Teryx'];
      if (make === 'honda') return ['Pioneer', 'Talon'];
      if (make === 'yamaha') return ['Viking', 'Wolverine'];
      if (make === 'john_deere') return ['Gator'];
      if (make === 'kubota') return ['RTV'];
    }
    if (t === 'atv') {
      if (make === 'polaris') return ['Sportsman'];
      if (make === 'can_am') return ['Outlander', 'Renegade'];
      if (make === 'honda') return ['Rancher', 'Foreman', 'Rubicon'];
      if (make === 'yamaha') return ['Grizzly', 'Kodiak'];
      if (make === 'kawasaki') return ['Brute Force'];
    }
  }

  if (category === 'hunting_outfitter_assets') {
    if (t === 'camera_system') {
      if (make === 'spypoint') return ['LINK-MICRO', 'FLEX', 'CELL-LINK'];
      if (make === 'tactacam') return ['REVEAL X', 'REVEAL SK'];
      if (make === 'browning') return ['Dark Ops', 'Strike Force', 'Spec Ops'];
      if (make === 'moultrie') return ['Mobile Edge', 'Delta'];
      if (make === 'reconyx') return ['HyperFire', 'UltraFire'];
    }
    if (t === 'blind') {
      // Keep generic: blind models vary widely; provide a nudge, not a hard taxonomy.
      return ['Box Blind', 'Tower Blind', 'Enclosure Blind'];
    }
  }

  return [];
}

