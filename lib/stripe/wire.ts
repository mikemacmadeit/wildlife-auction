import type Stripe from 'stripe';

export type WirePaymentMethod = 'wire';

export interface WireTransferInstructions {
  /** Stripe-provided reference the buyer must include with the transfer */
  reference: string;
  /** Stripe-provided financial addresses (routing/account/etc depending on type) */
  financialAddresses: Array<{
    type: string;
    /** Raw address object from Stripe (shape varies by type) */
    address: any;
  }>;
}

export interface CreateWireIntentResponse {
  orderId: string;
  paymentIntentId: string;
  paymentMethod: WirePaymentMethod;
  status: 'awaiting_wire';
  instructions: WireTransferInstructions;
}

export function formatWireInstructionsFromPaymentIntent(pi: Stripe.PaymentIntent): WireTransferInstructions {
  const anyPi: any = pi as any;
  const nextAction = anyPi?.next_action;
  const display = nextAction?.display_bank_transfer_instructions;

  const reference = String(display?.reference || '');
  const financialAddressesRaw = Array.isArray(display?.financial_addresses) ? display.financial_addresses : [];

  return {
    reference,
    financialAddresses: financialAddressesRaw.map((fa: any) => ({
      type: String(fa?.type || ''),
      address: fa?.[String(fa?.type || '')] ?? fa ?? null,
    })),
  };
}

