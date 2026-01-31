import type { SearchableSelectOption } from '@/components/ui/searchable-select';

/** Farm animal species (legal Texas farm animals) – alphabetical by label, Other last. */
export const FARM_ANIMAL_SPECIES_OPTIONS: SearchableSelectOption[] = [
  { value: 'alpaca', label: 'Alpaca' },
  { value: 'chicken', label: 'Chicken' },
  { value: 'goat', label: 'Goat' },
  { value: 'lamb', label: 'Lamb' },
  { value: 'llama', label: 'Llama' },
  { value: 'pig', label: 'Pig' },
  { value: 'rabbit', label: 'Rabbit (livestock)' },
  { value: 'sheep', label: 'Sheep' },
  { value: 'turtle', label: 'Turtle' },
  { value: 'other_farm', label: 'Other legal Texas farm animal' },
];

export const FARM_ANIMAL_SPECIES_IDS = FARM_ANIMAL_SPECIES_OPTIONS.map((o) => o.value);
