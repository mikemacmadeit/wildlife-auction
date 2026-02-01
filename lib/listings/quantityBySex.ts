/**
 * Format quantity-by-sex for display on listing pages and checkout.
 * When a fixed_group listing has quantityMale/quantityFemale (or cattle's Bull/Cow/etc.),
 * we show the breakdown instead of just total.
 */

import type { ListingAttributes } from '@/lib/types';

export type QuantityBySexDisplay = {
  /** Human-readable breakdown e.g. "5 bulls, 10 heifers" or "3 males, 7 females" */
  breakdown: string;
  /** Total quantity (sum) */
  total: number;
  /** Whether we have a sex breakdown (vs single total) */
  hasBreakdown: boolean;
};

function pluralize(word: string, count: number): string {
  if (count === 1) return word;
  if (word === 'bull') return 'bulls';
  if (word === 'cow') return 'cows';
  if (word === 'heifer') return 'heifers';
  if (word === 'steer') return 'steers';
  if (word === 'male') return 'males';
  if (word === 'female') return 'females';
  if (word === 'horse') return 'horses';
  if (word === 'dog') return 'dogs';
  if (word === 'animal') return 'animals';
  if (word === 'deer') return 'deer';
  return word + 's';
}

/**
 * Format quantity by sex for a listing. Returns breakdown string and total.
 * Use when quantityMode is fixed_group and attrs have quantityMale/Female or cattle sex counts.
 */
export function formatQuantityBySex(
  category: string,
  attrs: ListingAttributes | undefined | null
): QuantityBySexDisplay {
  if (!attrs) return { breakdown: '', total: 0, hasBreakdown: false };

  const q = (attrs as any).quantity;
  const total = typeof q === 'number' && Number.isFinite(q) ? Math.max(0, Math.floor(q)) : 0;

  // Cattle: quantityBull, quantityCow, quantityHeifer, quantitySteer
  if (category === 'cattle_livestock') {
    const bull = Math.max(0, Math.floor((attrs as any).quantityBull ?? 0));
    const cow = Math.max(0, Math.floor((attrs as any).quantityCow ?? 0));
    const heifer = Math.max(0, Math.floor((attrs as any).quantityHeifer ?? 0));
    const steer = Math.max(0, Math.floor((attrs as any).quantitySteer ?? 0));
    const hasBreakdown = bull > 0 || cow > 0 || heifer > 0 || steer > 0;
    if (!hasBreakdown) {
      return {
        breakdown: total > 0 ? `${total} head` : '',
        total,
        hasBreakdown: false,
      };
    }
    const parts: string[] = [];
    if (bull > 0) parts.push(`${bull} ${pluralize('bull', bull)}`);
    if (cow > 0) parts.push(`${cow} ${pluralize('cow', cow)}`);
    if (heifer > 0) parts.push(`${heifer} ${pluralize('heifer', heifer)}`);
    if (steer > 0) parts.push(`${steer} ${pluralize('steer', steer)}`);
    const sum = bull + cow + heifer + steer;
    return {
      breakdown: parts.join(', '),
      total: sum > 0 ? sum : total,
      hasBreakdown: true,
    };
  }

  // Wildlife, Whitetail, Horse, Dogs, Farm: quantityMale, quantityFemale
  const male = Math.max(0, Math.floor((attrs as any).quantityMale ?? 0));
  const female = Math.max(0, Math.floor((attrs as any).quantityFemale ?? 0));
  const hasBreakdown = male > 0 || female > 0;
  if (!hasBreakdown) {
    return {
      breakdown: total > 0 ? `${total}` : '',
      total,
      hasBreakdown: false,
    };
  }

  const parts: string[] = [];
  if (male > 0) parts.push(`${male} ${pluralize('male', male)}`);
  if (female > 0) parts.push(`${female} ${pluralize('female', female)}`);
  const sum = male + female;
  return {
    breakdown: parts.join(', '),
    total: sum > 0 ? sum : total,
    hasBreakdown: true,
  };
}

/**
 * Unit label for category (head, animals, horses, dogs, deer)
 */
export function getQuantityUnitLabel(category: string, total: number): string {
  if (category === 'cattle_livestock') return total === 1 ? 'head' : 'head';
  if (category === 'horse_equestrian') return total === 1 ? 'horse' : 'horses';
  if (category === 'sporting_working_dogs') return total === 1 ? 'dog' : 'dogs';
  if (category === 'whitetail_breeder') return 'deer';
  if (category === 'farm_animals' || category === 'wildlife_exotics') return total === 1 ? 'animal' : 'animals';
  return total === 1 ? 'item' : 'items';
}
