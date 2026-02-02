# Delivery Session + QR Signature

Public driver and buyer flows for delivery confirmation without login.

## Env var (required)

Add to `.env.local` (local dev) and Netlify (production):

```
DELIVERY_TOKEN_SECRET=<at least 32 chars>
```

If missing, `/api/delivery/create-session` returns 503. Used to sign/verify JWT-style tokens for driver and buyer links. Generate with:

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Flow

1. **Buyer confirms delivery date** → Order becomes `DELIVERY_SCHEDULED`
2. **Seller** (or system) creates a delivery session via `POST /api/delivery/create-session`
3. Seller receives:
   - Driver link (`/delivery/driver?token=...`)
   - Buyer confirm link (`/delivery/confirm?token=...`) + QR code
4. **Driver** opens driver link (no login):
   - Can Start/Stop tracking (pings location to server)
   - Can show QR for buyer to scan
5. **Buyer** scans QR → opens confirm page (no login):
   - Signs with finger
   - Submits → signature saved, order marked delivered

## API routes

| Route | Auth | Purpose |
|-------|------|---------|
| `POST /api/delivery/create-session` | Seller (Bearer) | Create session, returns links |
| `POST /api/delivery/verify-token` | Public | Validate token, return minimal order info |
| `POST /api/delivery/buyer-link` | Public (driver token) | Return buyer link for QR |
| `POST /api/delivery/submit-signature` | Public (buyer token) | Upload signature, mark delivered |
| `POST /api/delivery/start-tracking` | Public (driver token) | Enable tracking |
| `POST /api/delivery/stop-tracking` | Public (driver token) | Disable tracking |
| `POST /api/delivery/ping-location` | Public (driver token) | Update driver location |

## Firestore

- `deliverySessions/{sessionId}` — session state, signature, tracking
- Order `delivery.sessionId`, `delivery.signatureUrl`, `delivery.confirmedMethod: "qr_public"`

## Public pages

- `/delivery/driver?token=...` — driver: start/stop tracking, show QR
- `/delivery/confirm?token=...` — buyer: sign and submit
