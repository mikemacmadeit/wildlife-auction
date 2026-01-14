# Airtight Compliance - Manual QA Checklist

**Date:** 2024-12-19  
**Purpose:** Step-by-step manual testing to verify all compliance gates are airtight

---

## PRE-TEST SETUP

1. **Test Accounts:**
   - TX Seller (profile.state = "TX")
   - TX Buyer (profile.state = "TX")
   - Non-TX Buyer (profile.state = "OK" or "CA")
   - Admin account

2. **Test Stripe:**
   - Use Stripe test mode
   - Have test cards ready
   - Monitor Stripe dashboard for refunds/transfers

3. **Test Data:**
   - Create whitetail_breeder listing (with TPWD permit doc)
   - Create wildlife_exotics listing
   - Create cattle_livestock listing
   - Create ranch_equipment listing

---

## TEST 1: Stripe-Hard TX-Only Enforcement (P0)

### Scenario: Non-TX Buyer Attempts Animal Purchase

**Steps:**
1. ✅ Create whitetail_breeder listing as TX seller
2. ✅ Admin approves listing (goes active)
3. ✅ Login as Non-TX buyer (profile.state = "OK")
4. ✅ Navigate to listing page
5. ✅ Click "Buy Now"
6. ✅ Complete Stripe Checkout:
   - Use billing address with state = "OK" (non-TX)
   - Complete payment
7. ✅ Wait for webhook to process

**Expected Results:**
- [ ] Stripe Checkout collects billing address (required)
- [ ] Payment completes successfully
- [ ] Webhook detects non-TX address
- [ ] Stripe refund is created automatically
- [ ] Order created with `status='refunded'`
- [ ] Order has `complianceViolation=true`
- [ ] Order has `complianceViolationReason` explaining TX violation
- [ ] Listing remains `status='active'` (NOT 'sold')
- [ ] Audit log created: `order_refunded_tx_violation`
- [ ] Buyer receives refund notification

**Verification Commands:**
```bash
# Check Firestore order
db.collection('orders').where('stripeCheckoutSessionId', '==', '<session_id>').get()

# Check audit logs
db.collection('auditLogs').where('actionType', '==', 'order_refunded_tx_violation').get()

# Check Stripe refund
# (via Stripe dashboard or API)
```

**Pass Criteria:** ✅ All checks pass, refund created, listing not sold

---

## TEST 2: TX Buyer Passes Verification (P0)

### Scenario: TX Buyer Purchases Animal Listing

**Steps:**
1. ✅ Create wildlife_exotics listing as TX seller
2. ✅ Login as TX buyer (profile.state = "TX")
3. ✅ Navigate to listing page
4. ✅ Click "Buy Now"
5. ✅ Complete Stripe Checkout:
   - Use billing address with state = "TX"
   - Complete payment
6. ✅ Wait for webhook to process

**Expected Results:**
- [ ] Stripe Checkout collects billing address
- [ ] Payment completes successfully
- [ ] Webhook verifies TX address
- [ ] Order created with `status='paid'`
- [ ] Listing marked `status='sold'`
- [ ] NO refund created
- [ ] Audit log: `order_created` (normal flow)

**Pass Criteria:** ✅ Order created normally, no refund

---

## TEST 3: Dispute Resolution TPWD Gating (P0)

### Scenario: Admin Tries to Release Payout Without Transfer Approval

**Steps:**
1. ✅ Complete whitetail_breeder purchase (TX buyer, TX address)
2. ✅ Order created with `transferPermitRequired=true`
3. ✅ Open dispute on order (buyer)
4. ✅ Login as Admin
5. ✅ Navigate to dispute resolution page
6. ✅ Try to resolve dispute with "release" resolution
7. ✅ **Expected:** Error before transfer creation

**Expected Results:**
- [ ] Error returned: "TPWD Transfer Approval document must be uploaded and verified"
- [ ] NO Stripe transfer created
- [ ] Order remains in dispute state

**Steps (Continue):**
8. ✅ Seller uploads TPWD_TRANSFER_APPROVAL document
9. ✅ Admin verifies document (status = 'verified')
10. ✅ Retry dispute resolution with "release"
11. ✅ **Expected:** Transfer succeeds

**Expected Results:**
- [ ] Transfer created successfully
- [ ] Order status updated to 'completed'
- [ ] Dispute resolved

**Pass Criteria:** ✅ Gating works, transfer blocked until document verified

---

## TEST 4: Non-Active Listing Blocked (P0)

### Scenario A: Pending Review Listing

**Steps:**
1. ✅ Create whitetail_breeder listing
2. ✅ Upload TPWD permit document (but don't verify yet)
3. ✅ Publish listing
4. ✅ Listing goes to `status='pending'`, `complianceStatus='pending_review'`
5. ✅ Login as TX buyer
6. ✅ Navigate to listing page
7. ✅ Try to bid or checkout

**Expected Results:**
- [ ] Listing page shows "Pending Review" badge
- [ ] Bid/Checkout buttons disabled or show error
- [ ] If checkout attempted: Server error "Listing is not available for purchase"
- [ ] Listing does NOT appear in browse/search results

**Pass Criteria:** ✅ Cannot transact on pending listing

### Scenario B: Draft Listing

**Steps:**
1. ✅ Create listing but don't publish (status='draft')
2. ✅ Try to access listing page directly (if possible)
3. ✅ Try to checkout via API directly

**Expected Results:**
- [ ] Listing not visible in browse/search
- [ ] If accessed directly: Shows draft state
- [ ] Checkout API returns error

**Pass Criteria:** ✅ Draft listings cannot be transacted

---

## TEST 5: Equipment Multi-State Still Works (P0)

### Scenario: Non-TX Buyer Purchases Equipment

**Steps:**
1. ✅ Create ranch_equipment listing
2. ✅ Set location state = "OK" (non-TX)
3. ✅ Login as Non-TX buyer (profile.state = "OK")
4. ✅ Navigate to listing page
5. ✅ Click "Buy Now"
6. ✅ Complete Stripe Checkout with OK address

**Expected Results:**
- [ ] Checkout does NOT require TX address
- [ ] Payment completes successfully
- [ ] Order created normally
- [ ] NO refund triggered
- [ ] Listing marked 'sold'

**Pass Criteria:** ✅ Equipment purchases work multi-state

---

## TEST 6: Whitetail Blocked in Exotics (P0)

### Scenario: Attempt to List Whitetail Under Exotics

**Steps:**
1. ✅ Login as seller
2. ✅ Navigate to create listing
3. ✅ Select category: "Wildlife & Exotics"
4. ✅ Try to select species: "Whitetail" or "Whitetail Deer"

**Expected Results:**
- [ ] Species dropdown does NOT include whitetail options
- [ ] If manually entered: Server validation error on publish
- [ ] Error: "Whitetail deer must be listed under 'Whitetail Breeder' category"

**Pass Criteria:** ✅ Whitetail cannot be listed under exotics

---

## TEST 7: Trust & Compliance Page (P1)

### Scenario: Public Access

**Steps:**
1. ✅ Navigate to `/trust` (not logged in)
2. ✅ Verify page loads
3. ✅ Check navigation link appears
4. ✅ Read all sections

**Expected Results:**
- [ ] Page loads without errors
- [ ] All sections display correctly
- [ ] Badges explained clearly
- [ ] Compliance workflow clear
- [ ] FAQ answers questions
- [ ] Contact links work

**Pass Criteria:** ✅ Page is accessible and informative

---

## TEST 8: Compliance Badges on Listing Page (P1)

### Scenario: View Animal Listing

**Steps:**
1. ✅ Create whitetail_breeder listing
2. ✅ Upload TPWD permit document
3. ✅ Admin verifies permit
4. ✅ Admin approves listing
5. ✅ Navigate to listing page (as any user)

**Expected Results:**
- [ ] Compliance badges section appears
- [ ] Shows "Compliance Approved" badge
- [ ] Shows "TPWD Permit: Verified" badge
- [ ] Shows "Texas-Only" notice

**Pass Criteria:** ✅ Badges display correctly

---

## TEST 9: Idempotent Webhook Refund (P0)

### Scenario: Webhook Retry After Refund

**Steps:**
1. ✅ Complete Test 1 (non-TX buyer, refund triggered)
2. ✅ Manually retry webhook event (simulate Stripe retry)
3. ✅ Check for duplicate refunds

**Expected Results:**
- [ ] Webhook checks for existing refunded order
- [ ] Returns early (idempotent)
- [ ] NO duplicate refund created
- [ ] NO duplicate order created

**Pass Criteria:** ✅ Idempotent handling works

---

## TEST 10: Single-Mode Enforcement (P0)

### Scenario: Attempt Hybrid Auction + Buy Now

**Steps:**
1. ✅ Create listing
2. ✅ Select type: "Auction"
3. ✅ Try to also set a fixed "Buy Now" price

**Expected Results:**
- [ ] UI prevents setting both auction and fixed price
- [ ] If attempted via API: Server validation error
- [ ] Error: "Auction listings cannot have a fixed price"

**Pass Criteria:** ✅ Single-mode enforced

---

## SUMMARY

**Total Tests:** 10  
**P0 Tests:** 8  
**P1 Tests:** 2  

**All tests must pass for production deployment.**

---

## QUICK VERIFICATION COMMANDS

### Check for TX Violations
```javascript
// Firestore Console
db.collection('orders')
  .where('complianceViolation', '==', true)
  .orderBy('createdAt', 'desc')
  .limit(10)
  .get()
```

### Check Audit Logs
```javascript
db.collection('auditLogs')
  .where('actionType', '==', 'order_refunded_tx_violation')
  .orderBy('createdAt', 'desc')
  .limit(10)
  .get()
```

### Check Pending Reviews
```javascript
db.collection('listings')
  .where('complianceStatus', '==', 'pending_review')
  .get()
```

### Check TPWD Transfer Approvals
```javascript
db.collection('orders')
  .where('transferPermitRequired', '==', true)
  .where('transferPermitStatus', '!=', 'approved')
  .get()
```

---

**QA Status:** Ready for Testing  
**Next:** Execute all tests and document results
