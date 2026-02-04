# Paranoid Audit Fix Report

**Branch:** `fix/paranoid-audit-pack`  
**Date:** February 1, 2026  
**Source:** `PARANOID_CODEBASE_AUDIT.md`

---

## Summary of Changes

| # | Fix | Files | Risk Prevented | Commit |
|---|-----|-------|----------------|--------|
| 1 | Watchlist listener leak | `app/dashboard/watchlist/page.tsx` | Firestore listener accumulation on rapid nav | ca93bcc |
| 2 | Refund lock clear logging | `app/api/stripe/refunds/process/route.ts` | Invisible stuck refund lock; aids debugging | f08a5a5 |
| 3 | Email/notification job empty catches | 5 files (see below) | Silent requeue/failure writes; job stuck without visibility | 5ce7684 |
| 4 | Messaging swallowed errors | `MessageThread.tsx`, `lib/firebase/messages.ts` | Silent snapshot/typing/send failures | 316e7d7, c6cb799 |
| 5 | parseDateTimeLocal fallback | `lib/datetime/datetimeLocal.ts` | Timezone ambiguity visibility in dev | 69920cb |
| 6 | Checkout idempotency log | `app/api/stripe/checkout/create-session/route.ts` | Better traceability when idempotency write fails | 657d61e |
| 7 | use-favorites stale memo | `hooks/use-favorites.ts` | Documented why stale favoriteIdsArray is safe | 757b70c |
| 8 | P3 empty catches | `lib/content/field-notes.ts` | Dev visibility when field-note file not found | 6274f2b |

---

## Fix 1 — Watchlist Listener Leak (P1)

**File:** `app/dashboard/watchlist/page.tsx`

**Change:** Added `cancelled` flag. Check `cancelled` before `setListings`, before adding subscriptions, and in catch/finally. Cleanup: set `cancelled = true`, then `subscriptionsRef.current.forEach(u => u())`, `subscriptionsRef.current.clear()`.

**Bug prevented:** When user navigates away (or `favoriteIds` changes) before `fetchListings` completes, the async callback could add subscriptions after cleanup. Those listeners were never unsubscribed → Firestore listener accumulation and memory leak.

**How to verify:**
- Manual: Open watchlist, quickly navigate away before listings load. Repeat 10x. Check Firestore usage / no listener growth.
- DevTools: Use React DevTools profiler; confirm no lingering Firestore listeners after unmount.
- Automated: `npx tsc --noEmit` passes.

---

## Fix 2 — Refund Lock Clear Logging (P1)

**File:** `app/api/stripe/refunds/process/route.ts`

**Change:** Replaced `.catch(() => {})` with `.catch((e) => logError('Refund: failed to clear refundInProgressAt after Stripe error', e, { route, orderId }))` on the `orderRef.update` that clears `refundInProgressAt` when Stripe refund fails.

**Bug prevented:** If Firestore update fails, `refundInProgressAt` stays set. Next refund attempt returns 409. Previously this was silent; now we log for debugging and monitoring.

**How to verify:**
- Simulate Stripe refund failure (e.g. invalid payment intent). Confirm log appears with orderId.
- `npx tsc --noEmit` passes.

---

## Fix 3 — Email/Notification Job Empty Catches (P1)

**Files:**
- `netlify/functions/dispatchEmailJobs.ts` — requeue write failure
- `netlify/functions/processNotificationEvents.ts` — status=failed write, dead letter write
- `netlify/functions/dispatchSmsJobs.ts` — requeue write failure
- `lib/email/dispatchEmailJobNow.ts` — requeue write failure
- `app/api/admin/notifications/run/route.ts` — requeue write failure

**Change:** Replaced empty `catch {}` with `logError` (or `console.warn`/`console.error` where no logger) including jobId/eventId context.

**Bug prevented:** When Firestore write fails (requeue, status=failed, dead letter), failures were invisible. Jobs could get stuck without trace.

**How to verify:**
- Trigger Firestore write failure (e.g. permission/network) during job processing. Confirm logs appear.
- `npx tsc --noEmit` passes.

---

## Fix 4 — Messaging Swallowed Errors (P1/P2)

**Files:** `components/messaging/MessageThread.tsx`, `lib/firebase/messages.ts`

**Change:**
- `MessageThread`: onSnapshot error callback logs; try/catch for metadata subscription logs; URL.revokeObjectURL, setThreadTyping (send, loadOlder, handleTypingPing, onBlur, timeout), markThreadAsRead, file input click — all log on error.
- `messages.ts`: subscribeToAllUserThreads unsubscribe catch logs.

**Bug prevented:** Thread metadata (typing, read receipts) snapshot failures were silent. Same for send/load/revoke failures. Unsubscribe errors in messages.ts were swallowed.

**How to verify:**
- Force offline or permission error while viewing a thread. Confirm `[MessageThread]` snapshot error in console.
- `npx tsc --noEmit` passes.

---

## Fix 5 — parseDateTimeLocal Fallback (P2)

**File:** `lib/datetime/datetimeLocal.ts`

**Change:** Kept fallback (`new Date(s)` when format mismatch). Added `NODE_ENV === 'development'` `console.warn` and a comment documenting timezone ambiguity.

**Decision:** Keep fallback to avoid breaking callsites (NewListingClient, seller edit page) that might pass non-standard strings. Dev warning provides visibility without changing behavior.

**How to verify:**
- In dev, pass a non-datetime-local string to `parseDateTimeLocal`. Confirm warning appears.
- `npx tsc --noEmit` passes.

---

## Fix 6 — Checkout Idempotency Doc Failure (P2)

**File:** `app/api/stripe/checkout/create-session/route.ts`

**Change:** Added `sessionId` to existing `logWarn` when idempotency record write fails. Added comment: "Stripe idempotency key remains primary protection."

**Behavior:** Response unchanged (non-blocking). Log improved for traceability.

**How to verify:**
- Simulate Firestore write failure during checkout. Confirm log includes sessionId.
- `npx tsc --noEmit` passes.

---

## Fix 7 — use-favorites Stale Memo (P2)

**File:** `hooks/use-favorites.ts`

**Change:** Documented that `favoriteIdsArray` is stale by design. Callers use `favoriteIdsRef` + poll (watchlist) or `isFavorite(ref)`. No consumer relies on `favoriteIdsArray` for fresh data.

**Investigation:** Watchlist uses `favoriteIdsRef` and 200ms poll. ListingDetail uses `isFavorite`. No component destructures `favoriteIds` from the hook for display.

**How to verify:**
- Manual: Toggle favorites on watchlist and listing page. Confirm UI updates correctly.
- `npx tsc --noEmit` passes.

---

## Fix 8 — P3 Empty Catches (P3)

**File:** `lib/content/field-notes.ts`

**Change:** Added `NODE_ENV === 'development'` `console.debug` when `fs.readFile` fails for a candidate path (trying .md then .mdx).

**Not changed:** sessionStorage/localStorage catches left silent (known to throw in private mode; logging would spam).

**How to verify:**
- In dev, request a non-existent field-note slug. Confirm debug log for file-not-found.
- `npx tsc --noEmit` passes.

---

## TypeScript Check

Run: `npx tsc --noEmit`

Note: Pre-existing TS errors may exist in the repo (e.g. `lib/firebase/auth.ts`, `NewListingClient.tsx`). The fixes in this branch do not introduce new ones.

---

## Commits in Order

1. `ca93bcc` fix(watchlist): prevent listener leak with cancellation guard (P1)
2. `f08a5a5` fix(refunds): log when refundInProgressAt clear fails after Stripe error (P1)
3. `5ce7684` fix(jobs): replace empty catches with logging (P1)
4. `316e7d7` fix(messaging): replace empty catches with logging (P1/P2)
4b. `c6cb799` fix(messaging): log remaining setThreadTyping catch (P2)
5. `69920cb` fix(datetime): add dev warning for parseDateTimeLocal fallback (P2)
6. `657d61e` fix(checkout): improve idempotency doc failure log (P2)
7. `757b70c` fix(use-favorites): document stale favoriteIdsArray is safe (P2)
8. `6274f2b` fix(field-notes): add dev-only debug when file not found (P3)
