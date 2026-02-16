# SendGrid Email (Transactional) Setup

This app sends transactional/notification emails via a provider router in `lib/email/sender.ts`.

## Environment variables

- `EMAIL_PROVIDER=sendgrid`
- `EMAIL_DISABLED=true` to **noop** all sends (emergency kill switch)

### SendGrid credentials

- `SENDGRID_API_KEY` (server-side only)

### Sender identity

- `EMAIL_FROM` (example: `notify@wildlife.exchange`) — use an address on a **verified** domain in SendGrid to avoid spam; see [Email deliverability](EMAIL_DELIVERABILITY.md).
- `EMAIL_FROM_NAME` (example: `Wildlife Exchange`)
- `EMAIL_REPLY_TO` (optional)

> Backwards compatible: if `EMAIL_FROM` / `EMAIL_FROM_NAME` are missing, the app falls back to `FROM_EMAIL` / `FROM_NAME`.

## How to test (local or Netlify)

1) Set the env vars above
2) Call the admin endpoint:

`POST /api/admin/test-email`

Body (optional):

```json
{ "to": "you@example.com", "template": "auction_winner" }
```

Requires admin auth (`Authorization: Bearer <admin-id-token>`).

## Rollback

- Set `EMAIL_DISABLED=true` to immediately stop sending (noop)
- Or set `EMAIL_PROVIDER=brevo` / `EMAIL_PROVIDER=resend` if configured

