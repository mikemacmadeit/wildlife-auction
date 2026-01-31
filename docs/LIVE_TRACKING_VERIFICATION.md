# Live Delivery Tracking — Verification Summary

**Status: Code path verified.** No further code changes required for live tracking to work. Behavior depends on **env config** and **seller keeping the order page open**.

---

## 1. Server: Start tracking (API)

| File | Verified |
|------|----------|
| `app/api/orders/[orderId]/start-delivery-tracking/route.ts` | ✅ Updates Firestore (`deliveryTracking.enabled`, `transactionStatus: OUT_FOR_DELIVERY`). When RTDB is configured, writes `trackingAccess/{orderId}` with `buyerUid`, `sellerUid`, `driverUid`, `enabled: true`. Logs a warning when RTDB is not configured. |

---

## 2. Server: Stop tracking (API)

| File | Verified |
|------|----------|
| `app/api/orders/[orderId]/stop-delivery-tracking/route.ts` | ✅ Updates Firestore and, when RTDB is configured, sets `trackingAccess/{orderId}.enabled = false` and removes `liveLocations/{orderId}`. |

---

## 3. Realtime Database rules

| File | Verified |
|------|----------|
| `database.rules.json` | ✅ `liveLocations/{orderId}`: read allowed when `trackingAccess/{orderId}.enabled === true` and auth.uid is buyer/seller/driver; write allowed when enabled and auth.uid === driverUid. `trackingAccess`: read for buyer/seller/driver; write false (server-only). |

---

## 4. Client: RTDB helpers

| File | Verified |
|------|----------|
| `lib/firebase/rtdb.ts` | ✅ `getDatabase()` returns RTDB when `databaseURL` is set. `set(path, value)` and `onValue(path, callback, errorCallback)` with optional error callback. |
| `lib/firebase/config.ts` | ✅ `databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL`; RTDB initialized when `databaseURL` is present. |
| `lib/firebase/admin.ts` | ✅ `databaseURL` from `FIREBASE_DATABASE_URL` or `NEXT_PUBLIC_FIREBASE_DATABASE_URL` or default `https://{projectId}-default-rtdb.firebaseio.com`. `getAdminDatabase()` returns null if not configured. |

---

## 5. Seller: Publish location

| File | Verified |
|------|----------|
| `hooks/useDeliveryLocationPublisher.ts` | ✅ When order has `deliveryTracking.enabled` and current user is driver, uses `navigator.geolocation.watchPosition` and writes to `liveLocations/{orderId}` (lat, lng, updatedAt, etc.) via `set()`. Throttled (5s or 25m). |

---

## 6. Buyer: Subscribe to location

| File | Verified |
|------|----------|
| `hooks/useLiveLocationSubscriber.ts` | ✅ When `enabled && role === 'buyer'`, subscribes to `liveLocations/{orderId}` via `onValue()`. Parses lat, lng, updatedAt into `LiveLocationPoint`. Error callback sets user-friendly error (e.g. permission denied). |

---

## 7. UI: Card and map

| File | Verified |
|------|----------|
| `components/orders/DeliveryTrackingCard.tsx` | ✅ Buyer: uses `useLiveLocationSubscriber(order.id, enabled && role === 'buyer')` and `locationError`. Renders map when `destination` exists; shows `locationError`, “Last updated Xs ago”, “Signal lost”, or “Waiting for driver’s location… The seller must have the order page open while delivering.” Seller: uses `useDeliveryLocationPublisher` when enabled and is driver. Card only shown for seller when status is DELIVERY_SCHEDULED / OUT_FOR_DELIVERY / DELIVERED_PENDING_CONFIRMATION. |
| `components/orders/DeliveryTrackingMap.tsx` | ✅ Takes `driverLocation` and `destination`; initializes Google Map, destination marker, driver marker; updates driver marker when `driverLocation` changes. |
| `app/dashboard/orders/[orderId]/page.tsx` | ✅ Renders `<DeliveryTrackingCard order={order} role="buyer" ... />`. |
| `app/seller/orders/[orderId]/page.tsx` | ✅ Renders `<DeliveryTrackingCard order={order} role="seller" ... />`. |

---

## 8. Data flow summary

1. **Seller** clicks “Start delivery” → API updates Firestore and writes RTDB `trackingAccess/{orderId}` (if server has RTDB URL).
2. **Seller** keeps **seller order page** open → `useDeliveryLocationPublisher` writes `liveLocations/{orderId}` (lat, lng, updatedAt).
3. **Buyer** opens **buyer order page** → `useLiveLocationSubscriber` reads `liveLocations/{orderId}` (allowed by rules when `trackingAccess` exists and enabled). Map shows driver when data exists; error/waiting message when not.
4. **Seller** stops or marks delivered → API sets `trackingAccess.enabled = false` and removes `liveLocations/{orderId}`.

---

## 9. What you must have (not code)

| Requirement | Action |
|-------------|--------|
| Realtime Database created | Firebase Console → Realtime Database → Create (if needed). Note URL, e.g. `https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com`. |
| Rules deployed | `firebase deploy --only database` (so `database.rules.json` is active). |
| Client env | Set `NEXT_PUBLIC_FIREBASE_DATABASE_URL` to the RTDB URL (e.g. in `.env.local` and in host env for the frontend). |
| Server env | Set `FIREBASE_DATABASE_URL` (or same URL) in the environment where the API runs (e.g. Netlify) so `start-delivery-tracking` can write `trackingAccess`. |
| Seller behavior | Seller must **keep the seller order page open** while delivering so the browser can publish location. |

---

**Conclusion:** The implementation is complete and consistent. If the buyer map stays on “Waiting for location…” or shows the permission error, the usual cause is missing RTDB URL on the server (so `trackingAccess` is never written) or the seller not keeping the order page open. Set the env vars above and redeploy; then have the seller keep the order tab open during delivery.
