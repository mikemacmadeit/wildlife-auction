# Notifications "Needs action" (red) – why you might not see what another user sees

## How "red" / Needs action works

- **Red** = "Action required". Shown for specific notification types that need a response:
  - **Pay now** (`order_final_payment_due`)
  - **Accept delivery date** (`order_delivery_scheduled`)
  - **Outbid** (`bid_outbid`, `auction_outbid`)
  - **Offer countered / accepted** (`offer_countered`, `offer_accepted`)

- Notifications are **per user**. Data comes from Firestore: `users/{uid}/notifications`. Each account only sees its own notifications.

## Why you might not see red when another user does

1. **Different account**  
   If you're on your own account (e.g. support/admin), you will not see the same notifications as the customer. Red items appear only for the user who has those action-required notifications.

2. **Different notifications**  
   Even on the same account, two people might be looking at different tabs (e.g. "All" vs "Needs action") or the list may have changed (e.g. they acted and the item is no longer action-required).

3. **Caching (less common)**  
   If the *same user* sees red on one device but not on another, or after a deploy things look wrong:
   - **Hard refresh:** Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac).
   - **Check "Synced" at the bottom** of the notifications Inbox – it updates when Firestore sends new data (e.g. "Synced 5 seconds ago"). If it’s updating, data is live.
   - Try an incognito/private window or another browser to rule out cache.

## What we did to reduce cache issues

- **`/dashboard/notifications`** is forced dynamic (`force-dynamic`, `revalidate = 0`) so the route is not cached.
- **"Synced"** at the bottom of the Inbox shows when the list was last updated from Firestore so users can confirm they’re on live data.

## Quick check for support

Ask the user who *does* see red:

- "Do you see **Synced just now** (or a few seconds ago) at the bottom of the notifications list?"  
  - If yes, their data is live; the difference is almost certainly account or tab.

Ask the user who *doesn’t* see red:

- "Are you logged in as the same account as the person who sees the red items?"  
  - If no, that explains it – each account has its own notifications.
