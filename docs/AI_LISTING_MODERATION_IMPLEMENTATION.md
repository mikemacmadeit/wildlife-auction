# AI Listing Moderation + Auto-Approve Implementation

## Summary

A secure, fail-closed AI auto-approve lane for listings, controlled by a runtime admin toggle, with full audit visibility. When enabled, low-risk listings that would otherwise go to manual review can be auto-approved and published immediately. Whitetail breeder listings and unverified sellers always require manual review by default.

## What Changed

### New Files
- `lib/compliance/aiModeration/types.ts` – Type definitions for config, moderation result, and auto-approve decision
- `lib/compliance/aiModeration/config.ts` – Loads `adminConfig/listingModeration` from Firestore with safe defaults
- `lib/compliance/aiModeration/listingTextModeration.ts` – Text-based AI moderation using GPT-4o-mini with structured JSON output and zod validation
- `lib/compliance/aiModeration/evaluateAutoApprove.ts` – Deterministic gate that evaluates whether a listing can be auto-approved
- `app/api/admin/listings/[id]/revert-to-pending/route.ts` – Admin API to revert an AI-approved listing back to pending
- `app/api/admin/listing-moderation-config/route.ts` – GET/PATCH API for the AI moderation config
- `tests/unit/evaluateAutoApprove.test.ts` – Unit tests for the auto-approve gate

### Modified Files
- `lib/audit/logger.ts` – Added `listing_ai_auto_approved` and `listing_ai_override_revert_to_pending` audit action types
- `lib/types.ts` – Added `aiModeration` optional field on Listing
- `lib/types/firestore.ts` – Added `aiModeration` to ListingDoc
- `app/api/listings/publish/route.ts` – Integrated AI auto-approve lane before the pending update; on success, sets `status: 'active'`, `complianceStatus: 'approved'`, writes `aiModeration`, and creates audit log
- `app/dashboard/admin/listings/page.tsx` – Added AI Moderation Config toggle card, "AI Approved" filter, load of AI-approved listings, Revert button, and display of AI scores/flags
- `firestore.indexes.json` – Added composite index for `status` + `aiModeration.decision` + `createdAt` (for AI Approved filter query)

### Insertion Point in Publish Route

The AI auto-approve logic runs **inside** the `if (needsReview)` block, **before** the listing is updated to `pending`. Flow:

1. All existing publish validations run unchanged.
2. When `needsReview` is true, the route loads `adminConfig/listingModeration`.
3. If AI is enabled, it runs text moderation (15s timeout) and `evaluateAutoApprove`.
4. If `canAutoApprove` is true: updates listing to `active`, `complianceStatus: 'approved'`, writes `aiModeration`, creates audit log, notifies seller, returns early.
5. Otherwise: builds `aiModeration` for audit (manual_required, skipped_ai_disabled, or error_fallback_manual), then proceeds with the existing pending flow (update to `pending`, AI summary, admin notifications).

### Default manualOnlyCategories

- `whitetail_breeder` (always requires manual review)

## Admin Usage

### Toggle AI Auto-Approve

1. Go to **Dashboard → Admin → Approve Listings**
2. Use the **AI Auto-Approve** card: click **Turn On** or **Turn Off**
3. The state is stored in Firestore at `adminConfig/listingModeration`
4. Changing the toggle takes effect immediately; no redeploy needed

### View AI-Approved Listings

1. In Approve Listings, open the filter dropdown
2. Select **AI Approved**
3. Listings that were auto-approved by AI are shown with scores, flags, and reasons

### Revert an AI Approval

1. Switch to the **AI Approved** filter
2. Find the listing to revert
3. Click **Revert to Manual Review**
4. The listing returns to `pending` with `complianceStatus: 'pending_review'` for manual review

### Rollback Plan

- Set the toggle to **Off** in the admin dashboard → all new listings go through the existing manual review flow
- No code changes required for rollback

## Firestore

### adminConfig/listingModeration

Created/updated by the admin config API. Shape:

- `aiAutoApproveEnabled`: boolean (default: false)
- `minTextConfidence`: number (default: 0.85)
- `maxRiskScore`: number (default: 0.2)
- `disallowedFlags`: string[]
- `manualOnlyCategories`: ListingCategory[] (default: `['whitetail_breeder']`)
- `manualOnlySellerUnverified`: boolean (default: true)
- `policyVersion`: number
- `updatedAt`: Timestamp
- `updatedBy`: string (admin uid)

### aiModeration on Listings

Written only by the server during publish (or revert). Shape:

- `decision`: `'auto_approved' | 'manual_required' | 'skipped_ai_disabled' | 'error_fallback_manual'`
- `policyVersion`: number
- `evaluatedAt`: Timestamp
- `evaluatedBy`: `'system'`
- `scores`: `{ textConfidence?: number; riskScore?: number }`
- `flags`: string[]
- `reasons`: string[]
- `evidence`: `Array<{ flag: string; snippet: string }>`
- `model`: string

## Security

- Sellers cannot set `status: 'active'` or `complianceStatus: 'approved'/'rejected'` (unchanged)
- Sellers cannot write `aiModeration`; only the server does
- Auto-approve is server-only and fail-closed: any error or missing data → manual review
- Admin toggle and revert require admin auth

## Index

Add this composite index for the AI Approved filter (already in `firestore.indexes.json`):

```
listings: status (ASC), aiModeration.decision (ASC), createdAt (DESC)
```

Deploy with: `firebase deploy --only firestore:indexes` (or your usual index deployment flow).
