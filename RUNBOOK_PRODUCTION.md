# Production Runbook - Wildlife Exchange

## Overview

This runbook provides procedures for common production operations, incident response, and maintenance tasks.

## Table of Contents

1. [Backup Strategy](#backup-strategy)
2. [Restore Procedures](#restore-procedures)
3. [Stripe Reconciliation](#stripe-reconciliation)
4. [Webhook Failure Triage](#webhook-failure-triage)
5. [AutoRelease Triage](#autorelease-triage)
6. [Revenue Aggregation Triage](#revenue-aggregation-triage)
7. [Sentry Triage](#sentry-triage)

---

## Backup Strategy

### Firestore Backup

**Recommended Approach**: GCP Export to Google Cloud Storage (GCS)

#### Automated Backup (Recommended)

Use Firebase Admin SDK or `gcloud` CLI to export Firestore data:

```bash
# Using gcloud CLI (requires gcloud installed and authenticated)
gcloud firestore export gs://[BUCKET_NAME]/[EXPORT_PATH] \
  --project=[PROJECT_ID] \
  --collection-ids=users,listings,orders,messages,auditLogs,stripeEvents,chargebacks
```

#### Manual Backup via Firebase Console

1. Navigate to Firebase Console → Firestore Database
2. Click "Export" button
3. Select collections to export
4. Choose GCS bucket destination
5. Start export

#### Backup Frequency

- **Daily**: Automated exports (recommended via Cloud Scheduler)
- **Before major deployments**: Manual export
- **After critical data changes**: On-demand export

#### Backup Retention

- Keep daily backups for 30 days
- Keep weekly backups for 12 weeks
- Keep monthly backups for 12 months

### Stripe Data Backup

Stripe data is automatically backed up by Stripe. However, ensure:

1. **Webhook events are logged**: Check `stripeEvents` collection in Firestore
2. **Reconciliation runs regularly**: Use Admin Reconciliation page
3. **Export Stripe data periodically**: Use Stripe Dashboard → Data Exports

---

## Restore Procedures

### Firestore Restore

**⚠️ WARNING**: Restore operations can overwrite existing data. Always verify backup integrity before restoring.

#### High-Level Restore Steps

1. **Verify backup integrity**:
   ```bash
   gsutil ls gs://[BUCKET_NAME]/[EXPORT_PATH]
   ```

2. **Import from GCS**:
   ```bash
   gcloud firestore import gs://[BUCKET_NAME]/[EXPORT_PATH] \
     --project=[PROJECT_ID]
   ```

3. **Verify data**:
   - Check critical collections (orders, users, listings)
   - Verify order counts match expectations
   - Check recent transactions

#### Partial Restore (Collection-Level)

To restore a specific collection:

```bash
gcloud firestore import gs://[BUCKET_NAME]/[EXPORT_PATH] \
  --project=[PROJECT_ID] \
  --collection-ids=orders
```

**⚠️ Note**: Partial restores may cause data inconsistencies. Prefer full restores when possible.

### Rollback Strategy

1. **Code rollback**: Revert deployment via Netlify/Vercel dashboard
2. **Data rollback**: Use Firestore restore (see above)
3. **Stripe rollback**: Contact Stripe support for payment reversals (if needed)

---

## Stripe Reconciliation

### When to Run Reconciliation

- **Daily**: Automated check (recommended)
- **After webhook failures**: Verify no missing orders
- **Before payout releases**: Ensure data consistency
- **After manual interventions**: Verify changes are reflected

### How to Run Reconciliation

1. Navigate to Admin Dashboard → Reconciliation
2. Enter filters (optional):
   - Order ID
   - Listing ID
   - Buyer/Seller email
   - Payment Intent ID
3. Click "Run Reconciliation"
4. Review results:
   - **Errors**: Critical mismatches requiring immediate attention
   - **Warnings**: Minor discrepancies that may be expected

### Handling Reconciliation Issues

#### Issue: Stripe Paid but No Firestore Order

**Severity**: CRITICAL

**Steps**:
1. Check webhook logs in Sentry
2. Verify webhook endpoint is receiving events
3. Manually create order if webhook failed (use Stripe Dashboard data)
4. Update `stripeEvents` collection to prevent duplicate processing

#### Issue: Firestore Paid but Stripe Missing

**Severity**: HIGH

**Steps**:
1. Verify order was actually paid (check Stripe Dashboard)
2. If payment exists, update Firestore with correct `stripePaymentIntentId`
3. If payment doesn't exist, mark order as `cancelled` or `refunded`

#### Issue: Transfer Exists but Order Not Completed

**Severity**: MEDIUM

**Steps**:
1. Verify transfer was successful in Stripe
2. Update order status to `completed` with `stripeTransferId`
3. Create audit log entry documenting the fix

---

## Webhook Failure Triage

### Symptoms

- Orders not created after payment
- User accounts not updated after Stripe Connect onboarding
- Chargebacks not recorded

### Diagnostic Steps

1. **Check Sentry**:
   - Filter by route: `/api/stripe/webhook`
   - Look for errors in last 24 hours
   - Check for signature verification failures

2. **Check Firestore**:
   - Query `stripeEvents` collection
   - Look for missing event IDs
   - Check `opsHealth/stripeWebhook` for last webhook time

3. **Check Stripe Dashboard**:
   - Webhooks → Events
   - Look for failed delivery attempts
   - Check webhook endpoint status

### Common Issues

#### Issue: Signature Verification Failed

**Cause**: Webhook secret mismatch or request tampering

**Fix**:
1. Verify `STRIPE_WEBHOOK_SECRET` matches Stripe Dashboard
2. Check webhook endpoint URL is correct
3. Ensure raw body is used for signature verification

#### Issue: Event Already Processed (Idempotent)

**Status**: NORMAL - This is expected behavior

**Action**: No action needed. Event was processed successfully on first attempt.

#### Issue: Webhook Not Receiving Events

**Cause**: Endpoint down, network issues, or Stripe configuration

**Fix**:
1. Verify webhook endpoint is accessible
2. Check Netlify/Vercel deployment status
3. Re-send failed events from Stripe Dashboard
4. Update webhook endpoint URL if changed

### Recovery Procedure

1. **Identify failed events**: Check Stripe Dashboard → Webhooks → Failed events
2. **Re-send events**: Use Stripe Dashboard to re-send failed events
3. **Verify processing**: Check `stripeEvents` collection for event IDs
4. **Manual fix if needed**: Create missing orders/updates manually

---

## AutoRelease Triage

### Symptoms

- Funds stuck in payout hold after protection window expired
- Orders eligible for release not being released automatically

### Diagnostic Steps

1. **Check Ops Health Page**:
   - View last `autoReleaseProtected` execution time
   - Check `scannedCount`, `releasedCount`, `errorsCount`
   - Review `lastError` if present

2. **Check Firestore**:
   - Query `opsHealth/autoReleaseProtected` document
   - Verify cron is running (should execute every 10 minutes)

3. **Check Netlify Functions**:
   - Netlify Dashboard → Functions → `autoReleaseProtected`
   - Check execution logs
   - Verify scheduled function is enabled

### Common Issues

#### Issue: Cron Not Running

**Cause**: Netlify scheduled function disabled or misconfigured

**Fix**:
1. Check `netlify.toml` for scheduled function configuration
2. Verify function is deployed
3. Check Netlify Dashboard → Functions → Scheduled Functions

#### Issue: Orders Not Eligible

---

## Revenue Aggregation Triage

### What it does

The scheduled Netlify function `aggregateRevenue` writes admin-only aggregate docs so the admin revenue dashboard can avoid expensive all-time scans.

### Where to look

- Firestore:
  - `adminRevenueAggregates/global`
  - `adminRevenueAggState/global`
  - `opsHealth/aggregateRevenue`

### Common issues

#### Issue: aggregates missing / revenue endpoint falls back to live scans

**Steps**:
1. Confirm Netlify scheduled functions are enabled and the site is deployed with the latest build.
2. Confirm Firestore indexes are deployed/built (especially the `orders(paidAt, __name__)` composite index).
3. Check `opsHealth/aggregateRevenue.lastRunAt` for the last run time.
4. Check Netlify function logs for `aggregateRevenue`.

**Cause**: Orders don't meet release criteria

**Check**:
- `adminHold` is false
- `disputeStatus` is not open
- `protectionEndsAt` has passed (if protected transaction)
- `deliveryConfirmedAt` exists (if protected transaction)

**Fix**: Review order eligibility logic in `autoReleaseProtected.ts`

#### Issue: Stripe Transfer Failures

**Cause**: Seller account issues, insufficient funds, or Stripe API errors

**Fix**:
1. Check Stripe Dashboard for transfer errors
2. Verify seller's Stripe Connect account is active
3. Manually release via Admin Ops Dashboard if needed

### Manual Release Procedure

If auto-release is not working:

1. Navigate to Admin Ops Dashboard → Ready to Release
2. Review eligible orders
3. Use "Bulk Release" or individual "Release" buttons
4. Verify transfers in Stripe Dashboard
5. Check audit logs for release records

---

## Sentry Triage

### Accessing Sentry

1. Navigate to Sentry Dashboard
2. Select Wildlife Exchange project
3. Filter by environment (production/staging/development)

### Common Alert Types

#### High Error Rate

**Symptoms**: Sudden spike in error count

**Steps**:
1. Check error grouping to identify common errors
2. Review stack traces
3. Check recent deployments
4. Review affected users/orders

#### Payment-Related Errors

**Severity**: CRITICAL

**Steps**:
1. Filter by route: `/api/stripe/*`
2. Check for webhook failures
3. Verify Stripe API status
4. Review reconciliation for missing orders

#### Authentication Errors

**Severity**: HIGH

**Steps**:
1. Check Firebase Auth status
2. Verify environment variables
3. Review affected user accounts
4. Check for token expiration issues

### Error Response Procedure

1. **Triage**: Assess severity and impact
2. **Investigate**: Review error details, stack traces, context
3. **Fix**: Deploy hotfix or rollback if needed
4. **Verify**: Confirm fix resolves issue
5. **Monitor**: Watch Sentry for recurrence

### Alert Configuration

Recommended Sentry alerts:

- **Error rate > 10/min**: Notify on-call engineer
- **Payment errors > 1**: Immediate notification
- **Webhook failures > 5**: Immediate notification
- **AutoRelease errors > 3**: Notify within 1 hour

---

## Emergency Contacts

- **Stripe Support**: https://support.stripe.com
- **Firebase Support**: https://firebase.google.com/support
- **Netlify Support**: https://www.netlify.com/support/

---

## Maintenance Windows

- **Weekly**: Review reconciliation results
- **Monthly**: Review backup integrity
- **Quarterly**: Review and update runbook procedures

---

**Last Updated**: [Date]
**Maintained By**: Engineering Team
