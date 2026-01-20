export type PaymentMethod = 'card' | 'ach_debit' | 'wire';

export function getRecommendedPaymentMethod(amountDollars: number): PaymentMethod {
  const amt = Number(amountDollars);
  if (!Number.isFinite(amt) || amt <= 0) return 'card';
  if (amt >= 10_000) return 'wire';
  if (amt >= 2_500) return 'ach_debit';
  return 'card';
}

export function getRecommendationCopy(method: PaymentMethod, amountDollars: number): string {
  const rec = getRecommendedPaymentMethod(amountDollars);
  const isRec = method === rec;

  if (method === 'card') {
    return isRec ? 'Card, Apple Pay, Google Pay, and Link.' : 'Fast, but some banks may limit large charges.';
  }
  if (method === 'ach_debit') {
    return isRec
      ? 'Recommended for larger purchases to reduce card declines.'
      : 'Pay via US bank account (ACH). Confirmation can be delayed.';
  }
  return isRec
    ? 'Recommended for very large purchases.'
    : 'Pay by wire/bank transfer. Funds are held for payout release once received.';
}

