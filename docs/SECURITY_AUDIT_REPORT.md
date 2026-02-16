# Full Application Security Audit Report

**Date:** February 4, 2026  
**Scope:** Wildlife Auction / Agchange marketplace — authentication, authorization, data access, input validation, secrets, backups, and information disclosure.

---

## Executive Summary

The application uses **Firebase Auth** with server-side token verification, **Firestore** and **Storage** rules that enforce ownership and roles, and **Stripe** webhooks with signature verification. Admin actions are gated by server-side admin checks; order/listing actions verify buyer/seller ownership. **No critical vulnerabilities** were found that would allow unauthorized access to data or document loss. A few **low-severity** improvements are recommended (error message disclosure, rate-limit coverage, and aligning all admin routes with a single helper).

---

## 1. Authentication & API Route Protection

### Findings

| Area | Status | Notes |
|------|--------|--------|
| Firebase Auth | ✅ | Tokens verified server-side via `auth.verifyIdToken()` on protected routes. |
| Admin routes | ✅ | Admin routes use `requireAdmin()` (from `app/api/admin/_util.ts`) or equivalent: token + role/superAdmin claim + Firestore `isAdminUid()` fallback. |
| Order/listing ownership | ✅ | Order and listing mutations verify `buyerId`/`sellerId` or `sellerId` against `decoded.uid` before proceeding. |
| Stripe webhook | ✅ | Uses raw body and `stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)`; rejects missing or invalid signature. |
| Public-by-design endpoints | ✅ | `/api/marketing/newsletter/subscribe`, `/api/support/contact`, `/api/delivery/buyer-link`, `/api/delivery/verify-pin` are intentionally public; contact form and newsletter use Zod + rate limiting; delivery endpoints use signed delivery tokens only. |
| Debug / test endpoints | ✅ | `/api/debug-log` returns 404 in production; `/api/monitoring/test-sentry` returns 403 in production. |

### Recommendation

- Prefer **`requireAdmin()`** from `app/api/admin/_util.ts` for all admin routes so behavior and rate limiting stay consistent. A few admin routes still use inline `verifyIdToken` + `isAdminUid`; migrating them to `requireAdmin()` would reduce drift.

---

## 2. Firestore Security Rules

### Findings

| Collection / Area | Status | Notes |
|-------------------|--------|--------|
| `users` | ✅ | Read/update/delete only by owner or admin; create only own document; client cannot set `role`, billing fields, Stripe IDs, or `legal`. |
| `publicProfiles` | ✅ | Public read; write only by owner with blocked sensitive keys (email, phone, Stripe, role). |
| `listings` | ✅ | Public read for active/sold/expired/ended; draft only by seller/admin; create/update/delete by seller or admin with strict field and status rules; server-only reservation fields and duration lifecycle. |
| `listings/{id}/documents` | ✅ | Read/create by listing owner or admin; documentUrl must match `^https://.*`; update only by admin for verification. |
| `orders` | ✅ | Read by buyer, seller, or admin; create only by server; update by buyer/seller with strict status and field allowlists; payout/payment fields not client-mutable. |
| `orders/{id}/documents` | ✅ | Read/create by order participant or admin; type allowlist; documentUrl must be https. |
| `bids` | ✅ | Read by authenticated; create/update/delete only by server. |
| `offers` | ✅ | Read by buyer/seller/admin; write only by server. |
| `messageThreads` / `messages` | ✅ | Read/write by participants or admin; participant update limited to allowed fields. |
| `reviews` | ✅ | Server-only write; public read only when published. |
| `stripeEvents` | ✅ | No client access. |
| `auditLogs` | ✅ | Admin read only; server write only; no delete. |

No Firestore rules were found that allow unauthorized read/write of sensitive data or documents.

---

## 3. Storage Security Rules

### Findings

| Path | Status | Notes |
|------|--------|--------|
| `listings/{listingId}/images/{imageId}` | ✅ | Public read; write/delete by listing owner or admin. |
| `users/{userId}/uploads/{photoId}/{fileName}` | ✅ | Read/write/delete only by `userId`. |
| `messageThreads/{threadId}/attachments/...` | ✅ | Read public (for img URLs); write by participant only; size &lt; 10MB; contentType `image/*`; delete by participant. |
| `listings/{listingId}/documents/...` | ✅ | Read/write/delete by listing owner or admin only (compliance docs not public). |
| `seller-permits/{sellerId}/...` | ✅ | Read/write/delete by seller or admin only. |
| `orders/{orderId}/documents/...` | ✅ | Read by order buyer/seller/admin; write by buyer/seller; delete by buyer/seller/admin. |
| `users/{userId}/profile/{fileName}` | ✅ | Public read; write/delete by owner only. |
| Catch-all | ✅ | `match /{allPaths=**} { allow read, write: if false; }` denies all other paths. |

Documents and compliance files are not exposed to unauthenticated or unrelated users.

---

## 4. Input Validation, XSS & Injection

### Findings

| Area | Status | Notes |
|------|--------|--------|
| API request bodies | ✅ | Many routes use **Zod** (e.g. compliance-transfer, set-delivery-address, publish listing, offers, support contact, newsletter). |
| Firestore queries | ✅ | No raw user input in query strings; document IDs from route params after auth/ownership checks. |
| documentUrl / links | ✅ | Listing and order document URLs validated as `https` in API and in rules (`documentUrl.matches('^https://.*')`). |
| Field notes (blog) | ✅ | Content from markdown files only; `allowDangerousHtml: false`; **rehype-sanitize** with defaultSchema; comment in code states intent to prevent XSS from inline HTML. |
| Chart component | ✅ | `dangerouslySetInnerHTML` used only for CSS variables built from code (THEMES/colorConfig), not user input. |
| JSON-LD (field notes) | ✅ | Data from post metadata; rendered with `JSON.stringify` (structured data, not raw HTML). |

No critical XSS or injection issues identified. Continuing to use Zod (or similar) on all mutation endpoints and keeping documentUrl/server-stored URLs to https is recommended.

---

## 5. Secrets & Environment

### Findings

| Area | Status | Notes |
|------|--------|--------|
| Server-only secrets | ✅ | Stripe secret, webhook secret, Firebase private key, Brevo, SendGrid, OpenAI, Upstash Redis, delivery token secret are not prefixed with `NEXT_PUBLIC_` in env.example. |
| Client-exposed vars | ✅ | Only appropriate keys are documented as public (Firebase config, Stripe publishable, Sentry DSN, etc.) in env.example. |
| Grep of `.tsx` for server secrets | ✅ | No `process.env` usage of STRIPE_SECRET, OPENAI, BREVO, SENDGRID, FIREBASE_PRIVATE, or UPSTASH in `.tsx` files. |

Secrets appear to be used only in server-side code and are not exposed to the client.

---

## 6. Data Loss Prevention & Backups

### Findings

| Area | Status | Notes |
|------|--------|--------|
| Firestore backups | ✅ | Documented in `FIRESTORE_BACKUP_IMPLEMENTATION_SUMMARY.md` and runbooks; daily backup workflow; verify script; versioning and retention on backup bucket. |
| Storage | ✅ | Storage paths are governed by security rules; no unconstrained delete; listing/order documents and seller-permits are access-controlled. |
| Accidental delete | ✅ | Firestore rules disallow client delete for many collections (e.g. orders, listing documents, reviews, auditLogs, stripeEvents). |

Backup and restore procedures exist; document and upload access is constrained so only authorized parties can delete.

---

## 7. Error Handling & Information Disclosure

### Findings

| Area | Status | Notes |
|------|--------|--------|
| Stack traces | ✅ | No evidence of raw `error.stack` being sent to the client in API responses. |
| error.message in responses | ⚠️ | Some API routes return `message: error.message` or similar in 500/503 responses, which can expose internal paths or implementation details. |
| Fix applied | ✅ | **Delivery create-session** was updated to return generic `{ error: 'Server misconfigured' }` and `{ error: 'Failed to create session' }` without `details` or `message` in 503/500 responses. |

### Recommendation

- Prefer **generic user-facing messages** for 4xx/5xx (e.g. "Something went wrong", "Server misconfigured") and log full `error.message` / stack server-side only. Optionally add a non-guessable `requestId` in the response for support, without exposing internals.

---

## 8. Rate Limiting & Abuse

### Findings

| Area | Status | Notes |
|------|--------|--------|
| Rate limit library | ✅ | `lib/rate-limit.ts` with Upstash Redis and in-memory fallback; Netlify runtime logs when Redis is missing. |
| Applied on routes | ✅ | Many sensitive routes use `rateLimitMiddleware` (e.g. compliance-transfer, set-delivery-address, publish, orders, checkout, support contact, delivery endpoints). |
| Coverage | ⚠️ | Not every API route was verified to have rate limiting; high-value and public endpoints (auth, checkout, support, newsletter, delivery) are covered. |

Recommendation: ensure any remaining high-impact or public endpoints (e.g. login, password reset, bid/offer) are rate limited where applicable.

---

## 9. Dependency & Operational Security

- **Checklist:** Use `SECURITY_AUDIT_CHECKLIST.md` for recurring checks (auth, API, Firestore, Storage, payments, XSS, CSRF, file upload, error handling, dependencies, monitoring).
- **Dependencies:** Run `npm audit` regularly and address high/critical findings; keep Stripe and Firebase SDKs up to date.
- **Audit run (Feb 2026):** `npm audit` reported 4 vulnerabilities (axios high, lodash moderate, next high, qs low). Run `npm audit fix` for non-breaking fixes; for Next.js, evaluate `npm audit fix --force` (can be breaking) or upgrade to a patched 15.x/16.x when available.
- **Incident / key exposure:** See `SECURITY_INCIDENT_PRIVATE_KEY_EXPOSURE.md` and `SECURITY_NOTICE.md` if applicable.

---

## 10. Summary Table

| Category | Result | Critical issues |
|----------|--------|------------------|
| Authentication & API protection | Pass | None |
| Firestore rules | Pass | None |
| Storage rules | Pass | None |
| Input validation & XSS | Pass | None |
| Secrets & env | Pass | None |
| Backups & data loss prevention | Pass | None |
| Error disclosure | Improved | One fix applied (delivery create-session); consider generic errors elsewhere |
| Rate limiting | Pass (with recommendation) | None |

---

## Conclusion

The application is **in a safe state** with respect to the areas audited: authentication and authorization are enforced server-side and in Firestore/Storage rules, sensitive data and documents are not exposed to unauthorized users, and backups and access controls reduce risk of data loss. The only change applied in this audit was to **stop returning raw error messages** in the delivery create-session API responses. Remaining recommendations are **low severity**: standardize admin route protection, avoid leaking `error.message` in other 500/503 responses, and ensure rate limiting on any remaining high-value endpoints.

For ongoing checks, use **SECURITY_AUDIT_CHECKLIST.md** and keep this report in mind when adding new API routes, rules, or file upload flows.
