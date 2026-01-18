export type SupportedPaymentMethod = 'card' | 'ach_debit' | 'wire';

export function getEligiblePaymentMethods(input: {
  totalUsd: number;
  isAuthenticated: boolean;
  isEmailVerified: boolean;
}): SupportedPaymentMethod[] {
  const methods: SupportedPaymentMethod[] = ['card'];

  const canUseBankRails = input.isAuthenticated === true && input.isEmailVerified === true;

  // UX rule: always *offer* ACH + Wire for verified users.
  // Server routes remain authoritative for any Stripe-side constraints or product policy changes.
  if (canUseBankRails) methods.push('ach_debit', 'wire');

  return methods;
}

export function isPaymentMethodEligible(method: SupportedPaymentMethod, input: {
  totalUsd: number;
  isAuthenticated: boolean;
  isEmailVerified: boolean;
}): boolean {
  return getEligiblePaymentMethods(input).includes(method);
}

