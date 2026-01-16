export type PaymentMethod = 'card' | 'bank_transfer' | 'wire';

export function getRecommendedPaymentMethod(amountDollars: number): PaymentMethod {
  const amt = Number(amountDollars);
  if (!Number.isFinite(amt) || amt <= 0) return 'card';
  if (amt < 20_000) return 'card';
  if (amt < 50_000) return 'bank_transfer';
  return 'wire';
}

export function getRecommendationCopy(method: PaymentMethod, amountDollars: number): string {
  const rec = getRecommendedPaymentMethod(amountDollars);
  const isRec = method === rec;

  if (method === 'card') {
    return isRec ? 'Recommended for smaller purchases.' : 'Fast, but some banks may limit large charges.';
  }
  if (method === 'bank_transfer') {
    return isRec ? 'Recommended for large purchases to reduce card declines.' : 'Asynchronous settlement; instructions shown at checkout.';
  }
  return isRec ? 'Recommended for very large purchases.' : 'Asynchronous settlement; instructions shown at checkout.';
}

