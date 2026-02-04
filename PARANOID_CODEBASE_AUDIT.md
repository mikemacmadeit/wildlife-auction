# Paranoid Codebase Audit Report

**Date:** February 1, 2026  
**Scope:** Full codebase scan; priorities: Auth, Data/Listeners, Payments, Background Jobs, Email/Notifications, File Uploads, Timezones, UI State, Error Handling, Security.

---

## 1. Executive Summary — Top 5 Risks

| # | Risk | Severity | Location | Impact |
|---|------|----------|----------|--------|
| 1 | **Empty `catch` blocks swallow errors in money/notification paths** | P1 | `MessageThread.tsx`, `dispatchEmailJobs.ts`, `processNotificationEvents.ts`, `bids-offers/page.tsx` | Silent failures; hard to debug; refund rollback lock may not clear |
| 2 | **Watchlist `useEffect` captures stale subscriptions ref on cleanup** | P1 | `app/dashboard/watchlist/page.tsx` L267–272 | Subscriptions added in one run may not be cleaned up if deps change before unmount |
| 3 | **MessageThread `onSnapshot` error callback ignores errors** | P2 | `components/messaging/MessageThread.tsx` L204–206 | Typing/read receipt sync failures are silent; UX may appear broken |
| 4 | **Checkout idempotency record failure is non-blocking** | P2 | `app/api/stripe/checkout/create-session/route.ts` L968–976 | On Firestore failure, duplicate sessions possible within 5s window; mitigated by Stripe idempotency |
| 5 | **`parseDateTimeLocal` fallback uses `new Date(s)` — implicit timezone** | P2 | `lib/datetime/datetimeLocal.ts` L29–30 | Non-matching input parses as UTC/ local unpredictably; schedule drift for users in different TZ |

---

## 2. High Severity Issues (P0/P1)

### P1-1: Empty catch blocks in money/notification paths

**Where:** Multiple files

| File | Line | Context |
|------|------|---------|
| `app/api/stripe/refunds/process/route.ts` | 205 | `orderRef.update({ refundInProgressAt: FieldValue.delete() }).catch(() => {})` — if update fails, lock stays; next refund attempt returns 409 |
| `netlify/functions/dispatchEmailJobs.ts` | 185 | `ref.set({ status: 'queued', ... }).catch(() => {})` — requeue write failure is silent |
| `netlify/functions/processNotificationEvents.ts` | 138 | `ref.set({ status: 'failed', ... }).catch(() => {})` — failure status write is silent; retries may not see updated state |
| `components/messaging/MessageThread.tsx` | 366, 379, 480, 835 | `catch {}` or `.catch(() => {})` — typing indicator, send, loadOlder, file revoke all swallow errors |
| `app/dashboard/bids-offers/page.tsx` | 208, 335, 470 | `catch {}` — localStorage, listing fetch, dismiss save; benign but masks issues |

**Why it's a risk:** Refund lock not cleared → 5-minute block on legitimate refunds. Email/notification jobs can get stuck without visibility.

**Minimal fix (refunds):**
```diff
- await orderRef.update({ refundInProgressAt: FieldValue.delete(), updatedAt: new Date() }).catch(() => {});
+ await orderRef.update({ refundInProgressAt: FieldValue.delete(), updatedAt: new Date() }).catch((e) => {
+   logError('Refund: failed to clear refundInProgressAt after Stripe error', e, { orderId });
+ });
```

**Tests:** Trigger Stripe refund failure (invalid PI), verify `refundInProgressAt` is cleared and logs show error.

---

### P1-2: Watchlist subscriptions leak when unmount/deps change before fetchListings completes

**Where:** `app/dashboard/watchlist/page.tsx` L210–272

**Evidence:** `fetchListings` is async. Subscriptions are added inside `enriched.forEach(...)` after `await getListingsByIds`. The cleanup runs when the effect tears down (unmount or deps change). If the user navigates away or `favoriteIds` changes *before* `fetchListings` completes, cleanup runs with an empty or partial map. Then `fetchListings` completes and calls `subscriptionsRef.current.set(listing.id, unsubscribe)` — adding subscriptions that are never cleaned up.

**Why it's a risk:** Firestore listeners accumulate on rapid navigation or favoriteId churn. Memory leak and unnecessary Firestore read/write traffic.

**Minimal fix:** Use AbortController to cancel in-flight work. In `fetchListings`, pass `signal` to fetch (if applicable) and check `signal.aborted` before `setListings` and before adding subscriptions. In cleanup, call `abortController.abort()` and then unsubscribe/clear:
```javascript
useEffect(() => {
  const ac = new AbortController();
  const fetchListings = async () => {
    // ... existing logic ...
    if (ac.signal.aborted) return;
    const enriched = validListings.map(enrichListing);
    if (ac.signal.aborted) return;
    setListings(enriched);
    enriched.forEach((listing) => {
      if (ac.signal.aborted) return;
      // ... subscribe ...
    });
  };
  fetchListings();
  return () => {
    ac.abort();
    subscriptionsRef.current.forEach((u) => u());
    subscriptionsRef.current.clear();
  };
}, [favoriteIds, user, authLoading, enrichListing]);
```

---

### P1-3: MessageThread onSnapshot error callback is empty

**Where:** `components/messaging/MessageThread.tsx` L204–206

**Evidence:**
```javascript
() => {
  // ignore
}
```

**Why it's a risk:** Thread metadata (typing, read receipts) subscription failures are invisible. User sees stale "typing..." or "Seen" state.

**Minimal fix:**
```diff
- () => {
-   // ignore
- }
+ (err) => {
+   console.warn('[MessageThread] thread metadata snapshot error', err);
+ }
```

---

### P1-4: lib/firebase/messages.ts — subscribeToAllUserThreads cleanup catches and swallows

**Where:** `lib/firebase/messages.ts` L510–516

**Evidence:**
```javascript
return () => {
  try {
    unsubBuyer();
  } catch {}
  try {
    unsubSeller();
  } catch {}
};
```

**Why it's a risk:** If unsubscribe throws (e.g. Firestore SDK bug), error is swallowed. Low likelihood but can mask SDK issues.

**Minimal fix:** Log the error:
```diff
  return () => {
    try {
      unsubBuyer();
    } catch (e) {
+     console.warn('[subscribeToAllUserThreads] unsubBuyer error', e);
    }
    try {
      unsubSeller();
    } catch (e) {
+     console.warn('[subscribeToAllUserThreads] unsubSeller error', e);
    }
  };
```

---

## 3. Medium Severity Issues (P2)

### P2-1: Checkout idempotency record persistence failure is non-blocking

**Where:** `app/api/stripe/checkout/create-session/route.ts` L959–976

**Evidence:** `idempotencyRef.set(...)` failure is logged but does not block the response. Stripe idempotency key still protects at Stripe level. Within the 5s window, a second request could create a different Stripe session if the first idempotency doc write failed.

**Risk:** Duplicate checkout sessions in edge case (Firestore write failure). Low frequency.

**Minimal fix:** Consider failing the request if idempotency write fails (conservative), or document the trade-off and add a metric for idempotency write failures.

---

### P2-2: parseDateTimeLocal fallback uses `new Date(s)` — timezone ambiguity

**Where:** `lib/datetime/datetimeLocal.ts` L27–31

**Evidence:**
```javascript
const m = s.match(...);
if (!m) {
  const fallback = new Date(s);
  return Number.isFinite(fallback.getTime()) ? fallback : null;
}
```

**Why it's a risk:** ISO strings without `Z` or offset are parsed as local time in some engines; with `Z` as UTC. Inconsistent behavior across inputs. For `datetime-local` we explicitly want local time.

**Minimal fix:** Reject non-matching formats instead of fallback, or document that fallback is best-effort and may be wrong for non-standard input.

---

### P2-3: Listing effectiveStatus / duration use `Date.now()` — server vs client clock skew

**Where:** `lib/listings/effectiveStatus.ts`, `lib/listings/duration.ts`

**Evidence:** `nowMs = Date.now()` is passed or used. FinalizeAuctions uses `Timestamp.now()` (server). Listing pages use client `Date.now()`. If client clock is wrong, auction can show as "ended" or "active" incorrectly.

**Risk:** Rare; affects users with bad system time. DST transitions are handled by `Date` natively.

**Recommendation:** Accept for now; add monitoring for listing view vs. actual end time mismatches if seen in production.

---

### P2-4: use-favorites — favoriteIdsArray useMemo has empty deps

**Where:** `hooks/use-favorites.ts` L387–389

**Evidence:**
```javascript
const favoriteIdsArray = useMemo(() => {
  return Array.from(favoriteIdsRef.current).sort();
}, []);
```

**Why it's a risk:** Returned `favoriteIds` never updates because the memo never recomputes. Components that depend on `favoriteIds` from this hook may show stale data. The hook was refactored to avoid setState for perf; this makes the returned array permanently stale.

**Impact:** Watchlist page uses `favoriteIds` from `useFavorites()` — but it also uses a 200ms poll (per comment). Need to verify Watchlist actually receives updates. If not, this is a P1 bug.

---

### P2-5: RequireAuth — enforceLegalGate has no cleanup guard on pathname

**Where:** `components/auth/RequireAuth.tsx` L54–74

**Evidence:** `enforceLegalGate` is async; uses `cancelled` flag in cleanup. If `pathname` or `user` changes rapidly, multiple in-flight gate checks could run. The `cancelled` check prevents `router.replace` after unmount, but there's a possible race where two gate checks run and both pass `!cancelled` before either completes.

**Risk:** Low; mostly theoretical. The main risk is setState-after-unmount if `router.replace` triggers a state update — but Next.js router typically handles that.

---

### P2-6: No fetch timeout on client-side API calls

**Where:** All `fetch()` calls in hooks and components (e.g. `use-favorites.ts` L194, `useAuth` token refresh, etc.)

**Evidence:** No `AbortController` + `signal` + `setTimeout` pattern. Long-lived requests can hang indefinitely.

**Recommendation:** Add a shared `fetchWithTimeout(url, opts, ms)` utility and use it for critical paths. Lower priority for internal API routes (same origin, usually fast).

---

## 4. Low Severity / Cleanup (P3)

### P3-1: sessionStorage.removeItem in catch

**Where:** `app/dashboard/orders/page.tsx` L627, 637

**Evidence:** `try { sessionStorage.removeItem('we:pending-checkout:v1'); } catch {}`

**Note:** Benign; sessionStorage can throw in private mode. Safe to leave as-is or add one-line log.

---

### P3-2: InlineEmailCapture, Footer, SaveSellerButton, pricing page — empty catch

**Where:** Various

**Evidence:** Newsletter subscribe, localStorage, etc. Low impact; consider logging in development.

---

### P3-3: app/api/admin/notifications/run — catch {}

**Where:** `app/api/admin/notifications/run/route.ts` L194

**Context:** Admin-run notification job. Log the error for debugging.

---

### P3-4: lib/email/dispatchEmailJobNow — catch {}

**Where:** `lib/email/dispatchEmailJobNow.ts` L102

**Context:** Best-effort email dispatch. Should log failure.

---

### P3-5: lib/content/field-notes — catch {}

**Where:** `lib/content/field-notes.ts` L147

**Context:** Content loading. Log for debugging.

---

## 5. Weird Edge Cases (Rare but Nasty)

### A. Stripe webhook: event recorded but handler throws mid-flight

**Scenario:** Idempotency transaction succeeds (event recorded), then handler throws. We return 500; Stripe retries. On retry, we see event exists, return 200 idempotent. Order may be partially created (e.g. order doc created but listing not updated). Handler should be transactional or fully nullipotent.

**Where:** `app/api/stripe/webhook/handlers.ts` — handlers do multiple Firestore writes. Not wrapped in a single transaction.

**Mitigation:** Handlers check "already processed" at key steps (order exists, listing already sold). Document that handlers must be idempotent at each step.

---

### B. finalizeAuctions: Listing ends between query and finalization

**Scenario:** Cron runs at T. Query returns listings with `endsAt <= nowTs`. Before we process doc N, another process (e.g. manual sell) marks it sold. `finalizeAuctionIfNeeded` should no-op if listing is already sold.

**Where:** `lib/auctions/finalizeAuction.ts`

**Verification needed:** Confirm `finalizeAuctionIfNeeded` checks `status === 'sold'` / `status === 'active'` and skips appropriately.

---

### C. Optimistic favorite toggle: Firestore snapshot delayed

**Scenario:** User toggles favorite. Optimistic update shows removed. Firestore write succeeds but snapshot is delayed (network). After 15s TTL, pending is cleared. Snapshot arrives with old state (still has it). UI flips back to "favorited" then soon to "removed" when next snapshot arrives. Brief flicker.

**Where:** `hooks/use-favorites.ts` — `PENDING_TTL_MS = 15000`

**Mitigation:** Current logic merges pending with snapshot. If snapshot is very late, we may show wrong state briefly. Acceptable UX trade-off.

---

### D. Seller listings page: "sold" inferred from orders when listing doc not yet updated

**Where:** `app/seller/listings/page.tsx` L619–668

**Evidence:** Fetches orders to infer sold listing IDs when webhook may not have updated the listing doc. Good defensive pattern. Edge case: order exists but listing update fails → we show sold correctly. If order creation fails after payment → we might not show sold. Webhook is source of truth; this is reconciliation only.

---

### E. Notification event processing: claimed but not completed

**Scenario:** `processNotificationEvents` claims an event (sets `processing.claimedAt`), then crashes before updating status. Next run may skip it (if we filter by `processing.claimedAt` within a window) or reprocess. Need to confirm claim TTL and retry behavior.

**Where:** `netlify/functions/processNotificationEvents.ts`

---

## 6. Recommended Guardrails

### Logging

1. **Structured logging for empty catches in money paths**
   - Add `logWarn` or `logError` in every catch that currently swallows, with route/context.
2. **Webhook handler step logging**
   - Log before/after each major step (order create, listing update, etc.) with `eventId`, `orderId`, `listingId`.

### Invariant checks

1. **Order status transitions**
   - Add `assertValidOrderTransition(from, to)` in `lib/orders/status.ts` and call from handlers.
2. **Listing status**
   - Assert `status === 'active'` before finalizing auction.

### Helpers

1. **fetchWithTimeout(url, opts, ms)** — Use for external or critical API calls.
2. **safeClearRefMap(ref)** — Helper that unsubscribes and clears a Map, with try/catch and log.

### Monitoring

1. **Stripe webhook idempotency**
   - Metric: `webhook_idempotent_return` count. Alert if it spikes (could indicate retry storm).
2. **Refund lock**
   - Alert if `refundInProgressAt` exists for > 10 minutes (stuck lock).
3. **Notification dead letters**
   - Dashboard/alert when `notificationDeadLetters` grows.

---

## 7. Fix Order Plan

| Order | Item | Effort | Impact |
|-------|------|--------|--------|
| 1 | P1-2: Watchlist subscription cleanup + AbortController | 1–2 hr | Prevents listener leaks |
| 2 | P1-1: Log in refund `refundInProgressAt` clear catch | 15 min | Debuggability, prevents stuck locks |
| 3 | P1-3: MessageThread onSnapshot error logging | 15 min | Visibility into sync failures |
| 4 | P1-4: subscribeToAllUserThreads unsubscribe logging | 15 min | Low-risk improvement |
| 5 | P2-1: Document or harden checkout idempotency write | 30 min | Reduces duplicate session risk |
| 6 | P2-4: Verify use-favorites favoriteIds freshness for Watchlist | 1 hr | Confirm no stale watchlist |
| 7 | P2-2: parseDateTimeLocal fallback behavior | 30 min | Avoids schedule drift |
| 8 | P3: Add logging to remaining empty catches (batch) | 1 hr | General debuggability |

---

## Appendix: Empty Catch / Silent Error Inventory

| File | Line | Context |
|------|------|---------|
| app/dashboard/orders/page.tsx | 627, 637 | sessionStorage.removeItem |
| app/dashboard/bids-offers/page.tsx | 208, 335, 470 | localStorage, listing fetch, dismiss |
| components/marketing/InlineEmailCapture.tsx | 60 | Newsletter subscribe |
| components/navigation/Footer.tsx | 86 | Newsletter subscribe |
| components/messaging/MessageThread.tsx | 366, 379, 480, 835 | Typing, send, loadOlder, revoke |
| lib/firebase/messages.ts | 513, 516 | subscribeToAllUserThreads cleanup |
| app/api/admin/notifications/run/route.ts | 194 | Notification run |
| lib/email/dispatchEmailJobNow.ts | 102 | Email dispatch |
| netlify/functions/dispatchSmsJobs.ts | 144 | SMS job |
| app/pricing/page.tsx | 127 | Pricing fetch |
| netlify/functions/dispatchEmailJobs.ts | 185 | Email requeue write |
| components/seller/SaveSellerButton.tsx | 55 | Save seller |
| netlify/functions/processNotificationEvents.ts | 138 | Event failure status write |
| lib/content/field-notes.ts | 147 | Field notes load |
| app/api/stripe/refunds/process/route.ts | 205 | refundInProgressAt clear on Stripe error |
