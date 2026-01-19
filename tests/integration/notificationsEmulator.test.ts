import test from 'node:test';
import assert from 'node:assert/strict';

const SHOULD_RUN = process.env.RUN_FIRESTORE_EMULATOR_TESTS === '1';

test(
  'notifications pipeline: emit dedupe + processor fan-out (Firestore emulator)',
  { skip: !SHOULD_RUN },
  async () => {
    // Ensure emulator routing BEFORE importing server modules that initialize Admin SDK.
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
    process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'wildlife-test';
    process.env.GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;

    const [{ getAdminDb }, { emitEventForUser }, { processEventDoc }, { stableHash }] = await Promise.all([
      import('../../lib/firebase/admin'),
      import('../../lib/notifications/emitEvent'),
      import('../../lib/notifications/processEvent'),
      import('../../lib/notifications/eventKey'),
    ]);

    const db = getAdminDb();
    const uid = `u_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Seed user + prefs
    await db.collection('users').doc(uid).set(
      {
        userId: uid,
        email: 'test@example.com',
        displayName: 'Test User',
        profile: { fullName: 'Test User' },
      },
      { merge: true }
    );

    await db.collection('users').doc(uid).collection('notificationPreferences').doc('default').set(
      {
        timezone: 'America/Chicago',
        quietHours: { enabled: false, startHour: 21, endHour: 8 },
        channels: { email: true, push: true, sms: false },
        categories: {
          auctions: { watchStarted: true, highBidder: true, outbid: true, endingSoon: true, wonLost: true },
          orders: { confirmed: true, deliveryConfirmed: true, deliveryCheckIn: true, payoutReleased: true },
          onboarding: { welcome: true, profileIncomplete: true },
          marketing: { weeklyDigest: false, savedSearchAlerts: false },
          messages: { messageReceived: true },
          admin: { listingSubmitted: true, complianceReview: true, adminApproval: true, listingApprovedRejected: true, disputes: true },
        },
      },
      { merge: true }
    );

    const fakeToken = `fake-token-${uid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const tokenId = stableHash(fakeToken).slice(0, 32);
    await db.collection('users').doc(uid).collection('pushTokens').doc(tokenId).set({ token: fakeToken, platform: 'web' }, { merge: true });

    // Emit an event twice (dedupe)
    const first = await emitEventForUser({
      type: 'Auction.Outbid',
      actorId: null,
      entityType: 'listing',
      entityId: 'listing_1',
      targetUserId: uid,
      payload: {
        type: 'Auction.Outbid',
        listingId: 'listing_1',
        listingTitle: 'Test listing',
        listingUrl: 'https://example.com/listing/listing_1',
        newHighBidAmount: 123,
      },
      optionalHash: 'bid:123',
      test: true,
    });
    assert.equal(first.ok, true);
    assert.equal(first.created, true);

    const second = await emitEventForUser({
      type: 'Auction.Outbid',
      actorId: null,
      entityType: 'listing',
      entityId: 'listing_1',
      targetUserId: uid,
      payload: {
        type: 'Auction.Outbid',
        listingId: 'listing_1',
        listingTitle: 'Test listing',
        listingUrl: 'https://example.com/listing/listing_1',
        newHighBidAmount: 123,
      },
      optionalHash: 'bid:123',
      test: true,
    });
    assert.equal(second.ok, true);
    assert.equal(second.created, false);
    assert.equal(second.eventId, first.eventId);

    // Process the event doc and verify fan-out writes.
    const eventRef = db.collection('events').doc(first.eventId);
    const eventSnap = await eventRef.get();
    assert.equal(eventSnap.exists, true);

    const res = await processEventDoc({ db: db as any, eventRef: eventRef as any, eventData: eventSnap.data() as any });
    assert.equal(res.ok, true);

    // In-app notification created at deterministic id == eventId for non-collapsed types.
    const notifSnap = await db.collection('users').doc(uid).collection('notifications').doc(first.eventId).get();
    assert.equal(notifSnap.exists, true);

    // Email job created at deterministic id == eventId.
    const emailJobSnap = await db.collection('emailJobs').doc(first.eventId).get();
    assert.equal(emailJobSnap.exists, true);

    // Push job created at deterministic id == eventId + token hash.
    const pushJobId = `${first.eventId}_${stableHash(fakeToken).slice(0, 10)}`;
    const pushJobSnap = await db.collection('pushJobs').doc(pushJobId).get();
    assert.equal(pushJobSnap.exists, true);
  }
);

