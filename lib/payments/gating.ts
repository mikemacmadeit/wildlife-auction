export type SupportedPaymentMethod = 'card' | 'ach_debit' | 'wire';

const MIN_ACH_USD = 2500;
const MIN_WIRE_USD = 10000;

export function getEligiblePaymentMethods(input: {
  totalUsd: number;
  isAuthenticated: boolean;
  isEmailVerified: boolean;
}): SupportedPaymentMethod[] {
  const methods: SupportedPaymentMethod[] = ['card'];

  const canUseBankRails = input.isAuthenticated === true && input.isEmailVerified === true;

  if (canUseBankRails) {
    // Product policy:
    // - Card always available
    // - ACH is for mid/high ticket where bank rails make sense
    // - Wire is for high ticket
    if (Number(input.totalUsd) >= MIN_ACH_USD) methods.push('ach_debit');
    if (Number(input.totalUsd) >= MIN_WIRE_USD) methods.push('wire');
  }

  return methods;
}

export function isPaymentMethodEligible(method: SupportedPaymentMethod, input: {
  totalUsd: number;
  isAuthenticated: boolean;
  isEmailVerified: boolean;
}): boolean {
  return getEligiblePaymentMethods(input).includes(method);
}

