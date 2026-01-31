# Live Delivery Tracking (Uber-style)

In-app live delivery tracking for SELLER_TRANSPORT orders. Seller starts tracking from the order page; buyer sees a live map with driver position.

## Architecture

- **Firestore**: Source of truth for order state and `deliveryTracking` metadata (`enabled`, `driverUid`, `startedAt`, `endedAt`, `lastLocationAt`).
- **Firebase Realtime Database (RTDB)**: Live location stream. Only the latest point is stored (no breadcrumb history).
  - `liveLocations/{orderId}`: `{ lat, lng, heading?, speed?, accuracy?, updatedAt }` (overwritten on each update).
  - `trackingAccess/{orderId}`: `{ buyerUid, sellerUid, driverUid, enabled }` — written by server only; used by RTDB rules to gate read/write.
- **Google Maps**: Renders the map and moving marker (buyer) or mini-map (seller, optional).

## Environment

- **Client**: `NEXT_PUBLIC_FIREBASE_DATABASE_URL` — Realtime Database URL, e.g. `https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com`.
- **Server**: Same URL is derived from `FIREBASE_DATABASE_URL`, `NEXT_PUBLIC_FIREBASE_DATABASE_URL`, or default `https://{projectId}-default-rtdb.firebaseio.com`.

If `NEXT_PUBLIC_FIREBASE_DATABASE_URL` is not set, delivery tracking UI is hidden and API routes still update Firestore but skip RTDB.

## Firebase Console

1. **Create Realtime Database** (if not already): Firebase Console → Build → Realtime Database → Create database (choose region).
2. Copy the database URL into `.env.local` as `NEXT_PUBLIC_FIREBASE_DATABASE_URL`.

## Deploy RTDB rules

From project root:

```bash
firebase deploy --only database
```

Or deploy everything:

```bash
firebase deploy
```

Rules are in `database.rules.json`. Only buyers/sellers/drivers of an order can read `liveLocations/{orderId}` when `trackingAccess/{orderId}.enabled` is true. Only the driver can write `liveLocations/{orderId}` when enabled. `trackingAccess` is server-only (write: false for clients).

## API

- **POST /api/orders/[orderId]/start-delivery-tracking** — Seller/driver starts tracking. Auth required. Sets Firestore `deliveryTracking.enabled`, writes RTDB `trackingAccess`, notifies buyer.
- **POST /api/orders/[orderId]/stop-delivery-tracking** — Body: `{ mode: 'DELIVERED' | 'STOP_ONLY' }`. Disables tracking; if `DELIVERED`, marks order delivered.

## Testing

- Seller starts tracking → buyer sees marker and “Last updated Xs ago”.
- Seller denies location permission → UI shows “Location permission required”; do not enable tracking.
- Buyer opens order before first point → “Waiting for location…”.
- Seller stops tracking or marks delivered → buyer sees “Delivery completed” / “Tracking ended”; map hides.
