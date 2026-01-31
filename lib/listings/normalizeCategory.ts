import type { ListingCategory } from '@/lib/types';

/**
 * Canonical listing category normalization.
 *
 * Non-negotiables:
 * - Explicitly maps known legacy values (e.g. "horses", "wildlife") to canonical categories.
 * - Fails closed for unknown values (throws).
 *
 * IMPORTANT:
 * - Server routes MUST call this before enforcing compliance checks.
 * - Client-side mappers SHOULD call this and handle missing legacy docs deliberately.
 */
export function normalizeCategory(raw: unknown): ListingCategory {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!s) {
    throw new Error('Missing category');
  }

  // Canonical categories (already stored in Firestore today)
  if (s === 'whitetail_breeder') return 'whitetail_breeder';
  if (s === 'wildlife_exotics') return 'wildlife_exotics';
  if (s === 'cattle_livestock') return 'cattle_livestock';
  if (s === 'farm_animals') return 'farm_animals';
  if (s === 'ranch_equipment') return 'ranch_equipment';
  if (s === 'horse_equestrian') return 'horse_equestrian';
  if (s === 'ranch_vehicles') return 'ranch_vehicles';
  if (s === 'hunting_outfitter_assets') return 'hunting_outfitter_assets';
  if (s === 'sporting_working_dogs') return 'sporting_working_dogs';

  // Legacy categories (historical stored values)
  if (s === 'wildlife') return 'wildlife_exotics';
  if (s === 'horses') return 'horse_equestrian';
  if (s === 'cattle') return 'cattle_livestock';
  if (s === 'livestock') return 'farm_animals';
  if (s === 'equipment') return 'ranch_equipment';

  // Legacy "unknown buckets" observed in older UI mocks. Keep explicit mapping to avoid breaking reads,
  // but DO NOT add new ones silently.
  if (s === 'land') return 'wildlife_exotics';
  if (s === 'other') return 'wildlife_exotics';

  throw new Error(`Unknown category: ${s}`);
}

