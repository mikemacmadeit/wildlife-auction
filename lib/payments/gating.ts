import { ACH_DEBIT_MIN_TOTAL_USD, WIRE_TRANSFER_MIN_TOTAL_USD } from './constants';

export type SupportedPaymentMethod = 'card' | 'ach_debit' | 'wire';

export function getEligiblePaymentMethods(input: {
  totalUsd: number;
  isAuthenticated: boolean;
  isEmailVerified: boolean;
}): SupportedPaymentMethod[] {
  const totalUsd = Number(input.totalUsd);
  const okTotal = Number.isFinite(totalUsd) && totalUsd > 0 ? totalUsd : 0;

  const methods: SupportedPaymentMethod[] = ['card'];

  const canUseBankRails = input.isAuthenticated === true && input.isEmailVerified === true;

  if (canUseBankRails && okTotal >= ACH_DEBIT_MIN_TOTAL_USD) {
    methods.push('ach_debit');
  }
  if (canUseBankRails && okTotal >= WIRE_TRANSFER_MIN_TOTAL_USD) {
    methods.push('wire');
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

