import type { SearchableSelectOption } from '@/components/ui/searchable-select';
import { EXOTIC_SPECIES } from '@/lib/types';

const LABELS: Record<string, string> = {
  whitetail_deer: 'Whitetail Deer',
  axis: 'Axis Deer',
  chital: 'Chital (Axis Deer)',
  fallow: 'Fallow Deer',
  sika: 'Sika Deer',
  blackbuck: 'Blackbuck',
  aoudad: 'Aoudad (Barbary Sheep)',
  nilgai: 'Nilgai',
  scimitar_horned_oryx: 'Scimitar-Horned Oryx',
  addax: 'Addax',
  greater_kudu: 'Greater Kudu',
  lesser_kudu: 'Lesser Kudu',
  nyala: 'Nyala',
  bongo: 'Bongo',
  eland: 'Eland',
  waterbuck: 'Waterbuck',
  impala: 'Impala',
  springbok: 'Springbok',
  dama_gazelle: 'Dama Gazelle',
  dorcas_gazelle: 'Dorcas Gazelle',
  gemsbok: 'Gemsbok (Oryx)',
  oryx: 'Oryx (Other)',
  zebra: 'Zebra',
  wildebeest: 'Wildebeest',
  black_wildebeest: 'Black Wildebeest',
  blesbok: 'Blesbok',
  hartebeest: 'Hartebeest',
  sitatunga: 'Sitatunga',
  barasingha: 'Barasingha (Swamp Deer)',
  red_stag: 'Red Stag',
  red_deer: 'Red Deer',
  elk: 'Elk',
  sambar: 'Sambar Deer',
  rusa: 'Rusa Deer',
  muntjac: 'Muntjac',
  mouflon: 'Mouflon',
  ibex: 'Ibex',
  markhor: 'Markhor',
  tahr: 'Tahr',
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

