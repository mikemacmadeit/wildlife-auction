import test from 'node:test';
import assert from 'node:assert/strict';

import { buildEventKey, eventDocIdFromKey } from '../../lib/notifications/eventKey';
import { getDefaultNotificationPreferences } from '../../lib/notifications/preferences';
import { decideChannels } from '../../lib/notifications/rules';

test('eventKey/docId is deterministic for same inputs', () => {
  const key = buildEventKey({ type: 'Auction.Outbid', entityId: 'listing_1', targetUserId: 'user_1', optionalHash: 'bid:123' });
  const id1 = eventDocIdFromKey(key);
  const id2 = eventDocIdFromKey(key);
  assert.equal(id1, id2);
  assert.ok(id1.length > 10);
});

test('marketing events are suppressed by default preferences', () => {
  const prefs = getDefaultNotificationPreferences();
  const decision = decideChannels({
    eventType: 'Marketing.WeeklyDigest',
    payload: {
      type: 'Marketing.WeeklyDigest',
      userId: 'u1',
      listings: [],
    },
    prefs,
  });
  assert.equal(decision.allow, false);
});

test('quiet hours delays non-critical push/email events', () => {
  const prefs = getDefaultNotificationPreferences();
  // Force quiet hours all day for test
  prefs.quietHours.enabled = true;
  prefs.quietHours.startHour = 0;
  prefs.quietHours.endHour = 23;
  prefs.channels.email = true;
  prefs.channels.push = true;

  const decision = decideChannels({
    eventType: 'Auction.Outbid',
    payload: {
      type: 'Auction.Outbid',
      listingId: 'l1',
      listingTitle: 'Test listing',
      listingUrl: 'https://example.com/listing/l1',
      newHighBidAmount: 100,
    },
    prefs,
    now: new Date(),
  });

  assert.equal(decision.channels.inApp.enabled, true);
  assert.equal(decision.channels.email.enabled, true);
  assert.equal(decision.channels.push.enabled, true);
  assert.ok(typeof decision.channels.email.deliverAfterMs === 'number');
  assert.ok(typeof decision.channels.push.deliverAfterMs === 'number');
});

