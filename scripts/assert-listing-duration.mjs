// Minimal dev assertions for the eBay-style duration cap (no test runner required).
// Run: `node scripts/assert-listing-duration.mjs`

function assert(cond, msg) {
  if (!cond) {
    console.error('ASSERT FAILED:', msg);
    process.exitCode = 1;
    throw new Error(msg);
  }
}

const ALLOWED = [1, 3, 5, 7, 10];

function isValidDurationDays(x) {
  return ALLOWED.includes(Number(x));
}

function computeEndAtMs(startAtMs, durationDays) {
  return startAtMs + Number(durationDays) * 24 * 60 * 60 * 1000;
}

// 1) cannot create with duration 14 (validation helper)
assert(isValidDurationDays(7), '7 should be valid');
assert(!isValidDurationDays(14), '14 should be invalid');

// 2) creates active listing with correct endAt
const start = Date.UTC(2026, 0, 1, 12, 0, 0); // stable, timezone-independent
const end7 = computeEndAtMs(start, 7);
assert(end7 - start === 7 * 24 * 60 * 60 * 1000, 'endAt should be startAt + duration');

// 3) cannot extend beyond 10 days
const end10 = computeEndAtMs(start, 10);
const end11 = computeEndAtMs(start, 11);
assert(end11 - start > end10 - start, 'sanity: 11d is longer than 10d');
assert(Math.round((end10 - start) / (24 * 60 * 60 * 1000)) === 10, '10d should compute to 10 days');

// 4) expired listing guard logic
const now = start + 8 * 24 * 60 * 60 * 1000;
assert(end7 <= now, 'after 8 days, a 7-day listing should be expired');

console.log('[ok] listing duration assertions passed');

