import type { SearchableSelectOption } from '@/components/ui/searchable-select';
import { EXOTIC_SPECIES } from '@/lib/types';

const LABELS: Record<string, string> = {
  addax: 'Addax',
  american_bison: 'American Bison',
  ankole_watusi: 'Ankole-Watusi (Watusi Cattle)',
  arabian_gazelle: 'Arabian Gazelle',
  arabian_oryx: 'Arabian Oryx',
  arabian_tahr: 'Arabian Tahr',
  aoudad: 'Aoudad (Barbary Sheep)',
  axis: 'Axis Deer',
  barasingha: 'Barasingha (Swamp Deer)',
  beisa_oryx: 'Beisa Oryx',
  black_wildebeest: 'Black Wildebeest',
  blackbuck: 'Blackbuck Antelope',
  blesbok: 'Blesbok',
  blue_wildebeest: 'Blue Wildebeest',
  bongo: 'Bongo',
  bontebok: 'Bontebok',
  bushbuck: 'Bushbuck',
  cape_buffalo: 'Cape Buffalo',
  corsican_sheep: 'Corsican Sheep',
  dama_gazelle: 'Dama Gazelle',
  elds_deer: "Eld's Deer",
  eland: 'Eland',
  elk: 'Elk',
  emu: 'Emu',
  fallow: 'Fallow Deer',
  four_horned_ram: 'Four-Horned Ram',
  fringe_eared_oryx: 'Fringe-Eared Oryx',
  gemsbok: 'Gemsbok',
  grants_gazelle: "Grant's Gazelle",
  hartebeest: "Hartebeest (Plains / Lichtenstein's)",
  himalayan_tahr: 'Himalayan Tahr',
  ibex: 'Ibex',
  impala: 'Impala',
  kangaroo: 'Kangaroo',
  greater_kudu: 'Kudu (Greater)',
  lesser_kudu: 'Kudu (Lesser)',
  lechwe: 'Lechwe (Red / Nile Varieties)',
  markhor: 'Markhor',
  mouflon: 'Mouflon Sheep',
  muntjac: 'Muntjac Deer',
  nilgai: 'Nilgai Antelope',
  nyala: 'Nyala',
  ostrich: 'Ostrich',
  painted_desert_sheep: 'Painted Desert Sheep',
  pere_davids_deer: "Père David's Deer",
  plains_zebra: 'Plains Zebra',
  red_deer: 'Red Deer (Red Stag)',
  red_sheep: 'Red Sheep',
  roan_antelope: 'Roan Antelope',
  rusa: 'Rusa Deer',
  sable_antelope: 'Sable Antelope',
  scimitar_horned_oryx: 'Scimitar-Horned Oryx',
  sika: 'Sika Deer',
  sitatunga: 'Sitatunga',
  springbok: 'Springbok',
  texas_longhorn: 'Texas Longhorns',
  thomsons_gazelle: "Thomson's Gazelle",
  urial: 'Urial',
  water_buffalo: 'Water Buffalo',
  waterbuck: 'Waterbuck',
  other_exotic: 'Other Exotic (Requires Admin Review)',
};

function titleCaseFromId(id: string): string {
  return id
    .replaceAll('_', ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Searchable options for exotics, using `EXOTIC_SPECIES` as the source of truth for allowed values.
 * NOTE: Values must match stored `attributes.speciesId`.
 * Alphabetically sorted by label for better UX.
 */
export const EXOTIC_SPECIES_OPTIONS: SearchableSelectOption[] = EXOTIC_SPECIES.map((id) => ({
  value: id,
  label: LABELS[id] || titleCaseFromId(id),
})).sort((a, b) => a.label.localeCompare(b.label));

