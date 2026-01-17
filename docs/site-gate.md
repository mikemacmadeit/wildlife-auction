## Site Gate (Coming Soon + Password)

This repo supports an optional **site-wide access gate** for production testing.

### Behavior
- When enabled, the UI is replaced with a **Coming Soon** password screen until the user enters the password.
- A successful password entry sets an **httpOnly cookie** so subsequent requests can access the full site.
- `POST /api/site-gate/logout` clears the cookie.
- Stripe webhooks are **not** blocked by this UI gate (API routes are separate).

### Environment variables
Set these in your hosting provider (e.g. Netlify) environment:

- `SITE_GATE_ENABLED=true`
- `SITE_GATE_PASSWORD=your-password-here`
- `SITE_GATE_TOKEN=some-random-long-token` (recommended)

If `SITE_GATE_TOKEN` is not set, the system will fall back to a token derived from the password (works, but less ideal).

### Notes
- This is meant for “private beta” testing on a real deploy.
- If you enable this on your production URL, regular users will not be able to browse the site without the password.

