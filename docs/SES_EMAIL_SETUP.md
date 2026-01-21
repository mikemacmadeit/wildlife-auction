# SES Email (Transactional) Setup

This app sends transactional/notification emails via a provider router in `lib/email/sender.ts`.

## Environment variables (Netlify-safe)

Netlify blocks `AWS_*` variables, so we use `SES_*`.

- `EMAIL_PROVIDER`: set to `ses` to use Amazon SESv2
- `EMAIL_DISABLED`: set to `true` to **noop** all sends (emergency kill switch)

### SES credentials

- `SES_AWS_REGION` (default `us-east-1`)
- `SES_AWS_ACCESS_KEY_ID`
- `SES_AWS_SECRET_ACCESS_KEY`
- `SES_FROM` (example: `Wildlife Exchange <notify@wildlife.exchange>`)
- `SES_REPLY_TO` (optional)

### SES sandbox safety (recommended until production access)

- `SES_SANDBOX_MODE=true`
- `SES_SANDBOX_TO=michael@redwolfcinema.com` (must be SES-verified while in sandbox)

When sandbox mode is enabled:
- All emails are forced to `SES_SANDBOX_TO`
- The rendered HTML gets a banner showing the original intended recipient(s)

## How to test (local or Netlify)

1. Set `EMAIL_PROVIDER=ses`
2. Set `SES_SANDBOX_MODE=true`
3. Call the admin endpoint:

`POST /api/admin/test-email`

Body (optional):

```json
{ "to": "michael@redwolfcinema.com", "template": "auction_winner" }
```

Requires admin auth (`Authorization: Bearer <admin-id-token>`).

## Rollback

- Set `EMAIL_DISABLED=true` to immediately stop sending (noop)
- Or set `EMAIL_PROVIDER=brevo` / `EMAIL_PROVIDER=resend` to revert providers (if configured)

