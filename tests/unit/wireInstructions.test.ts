import test from 'node:test';
import assert from 'node:assert/strict';

import { formatWireInstructionsFromPaymentIntent } from '../../lib/stripe/wire';

test('wire instructions formatter: extracts reference + financial addresses', () => {
  const pi: any = {
    id: 'pi_test_123',
    next_action: {
      display_bank_transfer_instructions: {
        reference: 'REF-ABC-123',
        financial_addresses: [
          {
            type: 'aba',
            aba: {
              account_number: '000123456789',
              routing_number: '110000000',
              bank_name: 'TEST BANK',
            },
          },
        ],
      },
    },
  };

  const out = formatWireInstructionsFromPaymentIntent(pi);
  assert.equal(out.reference, 'REF-ABC-123');
  assert.equal(out.financialAddresses.length, 1);
  assert.equal(out.financialAddresses[0]!.type, 'aba');
  assert.deepEqual(out.financialAddresses[0]!.address, pi.next_action.display_bank_transfer_instructions.financial_addresses[0].aba);
});

