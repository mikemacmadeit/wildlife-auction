import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  BILL_OF_SALE_DOC_ID,
  getBillOfSaleStoragePath,
  renderBillOfSaleHtml,
  renderBillOfSalePdfBuffer,
  validateBillOfSaleInputs,
} from '../../lib/orders/billOfSale';

function sha256Hex(buf: Buffer | string) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

test('bill of sale: deterministic doc id + storage path', () => {
  assert.equal(BILL_OF_SALE_DOC_ID, 'bill_of_sale');
  assert.equal(getBillOfSaleStoragePath('order_123').includes('orders/order_123/documents/'), true);
});

test('bill of sale: HTML is stable for same inputs', () => {
  const data: any = {
    orderId: 'order_123',
    saleDateIso: '2026-01-19',
    purchasePriceUsd: 1234.5,
    seller: { uid: 's1', fullName: 'Seller Name', email: 'seller@example.com', phoneNumber: null, location: { city: 'Austin', state: 'TX', zip: '78701' } },
    buyer: { uid: 'b1', fullName: 'Buyer Name', email: 'buyer@example.com', phoneNumber: null, location: { city: 'Austin', state: 'TX', zip: '78701' } },
    horse: {
      listingId: 'listing_1',
      listingTitle: 'Test Horse',
      sex: 'mare',
      age: 5,
      registrationOrg: 'AQHA',
      registrationNumber: 'A123',
      identifiers: { microchip: 'M123', brand: null, tattoo: null, markings: 'Star' },
    },
    lienDisclosureText: 'Lien disclosure',
    asIsDisclaimerText: 'As-is',
    possessionText: 'Possession terms',
  };

  validateBillOfSaleInputs(data);
  const html1 = renderBillOfSaleHtml(data);
  const html2 = renderBillOfSaleHtml(data);
  assert.equal(sha256Hex(html1), sha256Hex(html2));
});

test('bill of sale: PDF is stable for same inputs', async () => {
  const data: any = {
    orderId: 'order_123',
    saleDateIso: '2026-01-19',
    purchasePriceUsd: 1234.5,
    seller: { uid: 's1', fullName: 'Seller Name', email: 'seller@example.com', phoneNumber: null, location: { city: 'Austin', state: 'TX', zip: '78701' } },
    buyer: { uid: 'b1', fullName: 'Buyer Name', email: 'buyer@example.com', phoneNumber: null, location: { city: 'Austin', state: 'TX', zip: '78701' } },
    horse: {
      listingId: 'listing_1',
      listingTitle: 'Test Horse',
      sex: 'mare',
      age: 5,
      registrationOrg: 'AQHA',
      registrationNumber: 'A123',
      identifiers: { microchip: 'M123', brand: null, tattoo: null, markings: 'Star' },
    },
    lienDisclosureText: 'Lien disclosure',
    asIsDisclaimerText: 'As-is',
    possessionText: 'Possession terms',
  };

  validateBillOfSaleInputs(data);
  const pdf1 = await renderBillOfSalePdfBuffer(data);
  const pdf2 = await renderBillOfSalePdfBuffer(data);
  assert.equal(sha256Hex(pdf1), sha256Hex(pdf2));
});

