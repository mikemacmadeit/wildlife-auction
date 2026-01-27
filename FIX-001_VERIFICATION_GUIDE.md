# FIX-001 Verification Guide
**Double-Submit Protection on Checkout**

---

## 1) Manual Test Script

### Test 1: Rapid-Click Test (10 clicks in 1 second)
**Purpose:** Verify client-side guard prevents duplicate requests

**Steps:**
1. Open browser DevTools → Console tab
2. Navigate to any active fixed-price listing (e.g., `/listing/[some-listing-id]`)
3. Click "Buy Now" button
4. In payment dialog, select "Card" payment method
5. **Rapidly click the payment method button 10 times within 1 second**
6. Observe console logs and browser behavior

**Expected Results:**
- ✅ Only 1 checkout session created
- ✅ Only 1 Stripe checkout window opens (or redirects to Stripe)
- ✅ Console shows: "FIX-001: Setting checkoutInFlight=true" (once)
- ✅ Console shows: "FIX-001: checkoutInFlight guard blocked duplicate request" (9 times)
- ✅ Button shows "Processing..." and is disabled during checkout
- ✅ Check debug.log for client-side logs

**If FAILS:**
- Check `app/listing/[id]/page.tsx:726` - early return guard
- Check `app/listing/[id]/page.tsx:729` - state set before async
- Check `app/listing/[id]/page.tsx:774` - state reset in finally

---

### Test 2: Normal Checkout Test
**Purpose:** Verify normal checkout flow still works

**Steps:**
1. Navigate to any active fixed-price listing
2. Click "Buy Now" button once
3. Select payment method
4. Complete checkout normally

**Expected Results:**
- ✅ Checkout proceeds normally
- ✅ Stripe checkout opens
- ✅ No errors in console
- ✅ Button enables after checkout starts

**If FAILS:**
- Check `app/listing/[id]/page.tsx:774` - ensure finally block always resets state

---

### Test 3: Wait 6 Seconds → Confirm New Session Allowed
**Purpose:** Verify idempotency window expires correctly

**Steps:**
1. Navigate to any active fixed-price listing
2. Click "Buy Now" → Select payment method → **Cancel/close Stripe checkout** (don't complete)
3. **Wait exactly 6 seconds** (use browser console: `setTimeout(() => console.log('6s elapsed'), 6000)`)
4. Click "Buy Now" again → Select payment method

**Expected Results:**
- ✅ New checkout session created (idempotency window expired)
- ✅ Check Firestore: 2 documents in `checkoutSessions` collection (different idempotency keys)
- ✅ Console shows: "FIX-001: New checkout session created" (twice, with different sessionIds)

**If FAILS:**
- Check `app/api/stripe/checkout/create-session/route.ts:180` - window calculation
- Check `app/api/stripe/checkout/create-session/route.ts:198` - window age check

---

## 2) Exact Verification Locations

### Firestore Verification

**Collection:** `checkoutSessions`

**Query to Run:**
```javascript
// In Firebase Console → Firestore Database → checkoutSessions collection
// Filter by: listingId == "[your-test-listing-id]"
// Sort by: createdAt DESC
```

**What to Check:**
1. **Rapid-click test:** Should see only 1 document with:
   - `idempotencyKey`: `checkout_session:[listingId]:[buyerId]:[windowNumber]`
   - `stripeSessionId`: Single Stripe session ID
   - `createdAt`: Timestamp from first click
   - `windowAge`: Should be < 5000ms if checked within 5 seconds

2. **6-second test:** Should see 2 documents with:
   - Different `idempotencyKey` values (different window numbers)
   - Different `stripeSessionId` values
   - `createdAt` timestamps ~6 seconds apart

**Document Structure:**
```json
{
  "stripeSessionId": "cs_test_...",
  "listingId": "...",
  "buyerId": "...",
  "orderId": "...",
  "createdAt": Timestamp,
  "expiresAt": Timestamp
}
```

**Document ID Format:**
```
checkout_session:[listingId]:[buyerId]:[windowNumber]
```
Where `windowNumber = Math.floor(Date.now() / 5000)`

---

### Stripe Dashboard Verification

**Location:** Stripe Dashboard → Developers → Events

**What to Check:**
1. **Rapid-click test:**
   - Filter: `checkout.session.created`
   - Should see only 1 event for that listing+buyer combination
   - Event timestamp should match first click time

2. **6-second test:**
   - Should see 2 `checkout.session.created` events
   - Timestamps ~6 seconds apart
   - Different session IDs

**Alternative:** Stripe Dashboard → Payments → Checkout Sessions
- Filter by customer email or listing metadata
- Count sessions created within test window

---

### Debug Log Verification

**File:** `.cursor/debug.log` (in project root)

**What to Look For:**

**Client-Side Logs:**
```json
{"location":"app/listing/[id]/page.tsx:729","message":"FIX-001: Setting checkoutInFlight=true",...}
{"location":"app/listing/[id]/page.tsx:726","message":"FIX-001: checkoutInFlight guard blocked duplicate request",...}
{"location":"app/listing/[id]/page.tsx:774","message":"FIX-001: Resetting checkoutInFlight=false",...}
```

**Server-Side Logs:**
```json
{"location":"app/api/stripe/checkout/create-session/route.ts:185","message":"FIX-001: Idempotency check performed",...}
{"location":"app/api/stripe/checkout/create-session/route.ts:198","message":"FIX-001: Reusing existing session (idempotent)",...}
{"location":"app/api/stripe/checkout/create-session/route.ts:1091","message":"FIX-001: New checkout session created",...}
```

**Expected Pattern (Rapid-Click Test):**
1. One "Setting checkoutInFlight=true"
2. Multiple "checkoutInFlight guard blocked" (9 times)
3. One "Idempotency check performed"
4. One "New checkout session created" OR "Reusing existing session"
5. One "Resetting checkoutInFlight=false"

---

## 3) Failure Analysis & Fixes

### Issue: Multiple Sessions Created Despite Guard

**Symptoms:**
- Firestore shows 2+ documents for rapid-click test
- Multiple Stripe checkout windows open

**Root Cause Analysis:**
1. Check debug.log for "checkoutInFlight guard blocked" - if missing, guard not working
2. Check if `checkoutInFlight` state is being reset too early
3. Check if multiple payment dialogs can be opened simultaneously

**Exact Lines to Check:**
- `app/listing/[id]/page.tsx:726` - Early return guard
- `app/listing/[id]/page.tsx:729` - State set
- `app/listing/[id]/page.tsx:774` - State reset (should be in finally)

**Minimal Fix:**
```typescript
// If guard not working, verify state is declared:
const [checkoutInFlight, setCheckoutInFlight] = useState(false);

// If state resets too early, move reset to finally block only
```

---

### Issue: Idempotency Window Not Working

**Symptoms:**
- Rapid clicks create multiple Firestore documents
- Different `idempotencyKey` values for same listing+buyer

**Root Cause Analysis:**
1. Check `app/api/stripe/checkout/create-session/route.ts:180` - window calculation
2. Verify: `Math.floor(Date.now() / 5000)` produces same number for clicks within 5s
3. Check if `existingSessionDoc.exists` check is working

**Exact Lines to Check:**
- `app/api/stripe/checkout/create-session/route.ts:180` - Window calculation
- `app/api/stripe/checkout/create-session/route.ts:185` - Document read
- `app/api/stripe/checkout/create-session/route.ts:198` - Window age check

**Minimal Fix:**
```typescript
// If window calculation wrong:
const idempotencyWindow = Math.floor(Date.now() / 5000); // Must be 5000, not 60000

// If age check wrong:
if (existingSessionId && windowAge < 5000) { // Must be 5000, not 60000
```

---

### Issue: Button Not Disabled During Checkout

**Symptoms:**
- Button remains clickable during checkout
- User can click multiple times

**Root Cause Analysis:**
1. Check button `disabled` prop includes `checkoutInFlight`
2. Verify state is set before async operation starts

**Exact Lines to Check:**
- `app/listing/[id]/page.tsx:1104` - Mobile "Buy Now" button
- `app/listing/[id]/page.tsx:1527` - Auction "Complete Purchase" button
- `app/listing/[id]/page.tsx:1716` - Desktop "Buy Now" button

**Minimal Fix:**
```typescript
// Ensure all buttons have:
disabled={isPlacingBid || checkoutInFlight || ...other conditions}
```

---

### Issue: State Never Resets (Button Stuck Disabled)

**Symptoms:**
- Button stays disabled after checkout
- Cannot start new checkout

**Root Cause Analysis:**
1. Check if `finally` block executes
2. Check if early return resets state (animal ack case)

**Exact Lines to Check:**
- `app/listing/[id]/page.tsx:735` - Early return reset
- `app/listing/[id]/page.tsx:774` - Finally block reset

**Minimal Fix:**
```typescript
// Ensure finally block always runs:
} finally {
  setCheckoutInFlight(false); // Must be here
}
```

---

## 4) Quick Verification Checklist

- [ ] Rapid-click test: Only 1 session created
- [ ] Rapid-click test: Only 1 Stripe window opens
- [ ] Rapid-click test: Console shows guard blocking (9 times)
- [ ] Normal checkout: Works as expected
- [ ] 6-second test: New session allowed after window expires
- [ ] Firestore: Correct document count and structure
- [ ] Stripe Dashboard: Correct session count
- [ ] Debug log: Shows expected log pattern
- [ ] Button: Disabled during checkout, enabled after

---

## 5) Expected Debug Log Pattern

**Successful Rapid-Click Test:**
```
[Client] FIX-001: Setting checkoutInFlight=true (1x)
[Client] FIX-001: checkoutInFlight guard blocked duplicate request (9x)
[Server] FIX-001: Idempotency check performed (1x)
[Server] FIX-001: New checkout session created (1x) OR Reusing existing session (1x)
[Client] FIX-001: Resetting checkoutInFlight=false (1x)
```

**Successful 6-Second Test:**
```
[First Click]
[Client] FIX-001: Setting checkoutInFlight=true
[Server] FIX-001: Idempotency check performed
[Server] FIX-001: New checkout session created
[Client] FIX-001: Resetting checkoutInFlight=false

[Wait 6 seconds]

[Second Click]
[Client] FIX-001: Setting checkoutInFlight=true
[Server] FIX-001: Idempotency check performed
[Server] FIX-001: New checkout session created (different sessionId)
[Client] FIX-001: Resetting checkoutInFlight=false
```
