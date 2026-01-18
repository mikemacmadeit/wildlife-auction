import test from 'node:test';
import assert from 'node:assert/strict';

// Import the route handler directly (unit-style).
import { GET } from '../../app/api/stripe/checkout/verify-session/route';

function makeReq(url: string, headers?: Record<string, string>) {
  return new Request(url, { headers: headers || {} });
}

test('verify-session: invalid session_id -> 400 (no crash)', async () => {
  const res = await GET(makeReq('http://localhost:3000/api/stripe/checkout/verify-session?session_id=not-a-session'));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.equal(body.reason, 'invalid_input');
});

test('verify-session: missing Stripe key -> ok:false (no 500)', async () => {
  const prev = process.env.STRIPE_SECRET_KEY;
  try {
    delete process.env.STRIPE_SECRET_KEY;
    const res = await GET(makeReq('http://localhost:3000/api/stripe/checkout/verify-session?session_id=cs_test_123'));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.equal(body.reason, 'not_configured');
  } finally {
    if (prev) process.env.STRIPE_SECRET_KEY = prev;
  }
});

