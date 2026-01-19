import test from 'node:test';
import assert from 'node:assert/strict';

const SHOULD_RUN = process.env.RUN_FIRESTORE_EMULATOR_TESTS === '1';

test('horse: bill of sale generation + complianceDocsStatus (Firestore emulator)', { skip: !SHOULD_RUN }, async () => {
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
  process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'wildlife-test';
  process.env.GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;

  const [{ getAdminDb }, { Timestamp }, { ensureBillOfSaleForOrder }, { recomputeOrderComplianceDocsStatus }, { normalizeCategory }] = await Promise.all([
    import('../../lib/firebase/admin'),
    import('firebase-admin/firestore'),
    import('../../lib/orders/billOfSale'),
    import('../../lib/orders/complianceDocsStatus'),
    import('../../lib/listings/normalizeCategory'),
  ]);

  const db = getAdminDb();
  const now = Timestamp.now();

  const buyerId = `buyer_${Date.now()}`;
  const sellerId = `seller_${Date.now()}`;
  const listingId = `listing_${Date.now()}`;
  const orderId = `order_${Date.now()}`;

  await db.collection('users').doc(buyerId).set(
    {
      userId: buyerId,
      email: 'buyer@example.com',
      phoneNumber: '555-0101',
      profile: { fullName: 'Buyer Name', location: { city: 'Austin', state: 'TX', zip: '78701', address: '1 Main St' } },
    },
    { merge: true }
  );
  await db.collection('users').doc(sellerId).set(
    {
      userId: sellerId,
      email: 'seller@example.com',
      phoneNumber: '555-0202',
      profile: { fullName: 'Seller Name', location: { city: 'Austin', state: 'TX', zip: '78701', address: '2 Ranch Rd' } },
    },
    { merge: true }
  );

  // Legacy category stored as "horses" must normalize to horse_equestrian.
  await db.collection('listings').doc(listingId).set(
    {
      title: 'Test Horse',
      category: 'horses',
      type: 'fixed',
      status: 'active',
      sellerId,
      location: { city: 'Austin', state: 'TX' },
      attributes: {
        speciesId: 'horse',
        sex: 'mare',
        registered: true,
        registrationOrg: 'AQHA',
        registrationNumber: 'A123',
        identification: { microchip: 'M123' },
        disclosures: {
          identificationDisclosure: true,
          healthDisclosure: true,
          transportDisclosure: true,
          titleOrLienDisclosure: true,
        },
        quantity: 1,
      },
      createdAt: now,
      updatedAt: now,
      createdBy: sellerId,
    },
    { merge: true }
  );

  await db.collection('orders').doc(orderId).set(
    {
      listingId,
      buyerId,
      sellerId,
      amount: 1234.5,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  const fakeBucket: any = {
    name: 'test-bucket',
    file: (_path: string) => ({
      save: async (_buf: Buffer, _opts: any) => {},
    }),
  };

  const listingSnap = await db.collection('listings').doc(listingId).get();
  const listing = listingSnap.data() as any;
  const category = normalizeCategory(listing.category);
  assert.equal(category, 'horse_equestrian');

  const bos = await ensureBillOfSaleForOrder({
    db: db as any,
    bucket: fakeBucket,
    orderId,
    listing: { id: listingId, title: listing.title, category, attributes: listing.attributes },
    orderAmountUsd: 1234.5,
    buyer: {
      uid: buyerId,
      fullName: 'Buyer Name',
      email: 'buyer@example.com',
      phoneNumber: '555-0101',
      location: { city: 'Austin', state: 'TX', zip: '78701', address: '1 Main St' },
    },
    seller: {
      uid: sellerId,
      fullName: 'Seller Name',
      email: 'seller@example.com',
      phoneNumber: '555-0202',
      location: { city: 'Austin', state: 'TX', zip: '78701', address: '2 Ranch Rd' },
    },
    now,
  });

  assert.equal(bos.ok, true);

  const bosDoc = await db.collection('orders').doc(orderId).collection('documents').doc('bill_of_sale').get();
  assert.equal(bosDoc.exists, true);
  assert.equal(String((bosDoc.data() as any)?.type), 'BILL_OF_SALE');
  assert.ok(String((bosDoc.data() as any)?.documentUrl || '').startsWith('https://'));

  const status = await recomputeOrderComplianceDocsStatus({ db: db as any, orderId });
  assert.deepEqual(status.required, ['BILL_OF_SALE']);
  assert.ok(status.provided.includes('BILL_OF_SALE'));
  assert.equal(status.missing.includes('BILL_OF_SALE'), false);
});

