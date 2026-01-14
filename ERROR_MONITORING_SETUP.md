# Error Monitoring Setup Guide

## Overview
This guide covers setting up error monitoring with Sentry for Wildlife Exchange.

## Why Error Monitoring?

- **Real-time error tracking**: Know immediately when errors occur
- **Performance monitoring**: Track slow API routes and database queries
- **User session replay**: See exactly what users did before an error
- **Release tracking**: Monitor errors after deployments
- **Alerting**: Get notified of critical errors

---

## Setup Steps

### 1. Install Sentry

```bash
cd project
npm install @sentry/nextjs
```

### 2. Run Sentry Wizard

```bash
npx @sentry/wizard@latest -i nextjs
```

This will:
- Create `sentry.client.config.ts`
- Create `sentry.server.config.ts`
- Create `sentry.edge.config.ts`
- Update `next.config.js` with Sentry plugin
- Create `.sentryclirc` (optional)

### 3. Get Your DSN

1. Go to [sentry.io](https://sentry.io) and create an account
2. Create a new project (select Next.js)
3. Copy your DSN (looks like: `https://xxxxx@sentry.io/xxxxx`)

### 4. Add Environment Variables

Add to `.env.local` (development) and production environment:

```bash
SENTRY_DSN=https://xxxxx@sentry.io/xxxxx
NEXT_PUBLIC_SENTRY_DSN=https://xxxxx@sentry.io/xxxxx
SENTRY_AUTH_TOKEN=your_auth_token  # For releases
SENTRY_ORG=your-org
SENTRY_PROJECT=your-project
```

### 5. Configure Sentry

Edit `sentry.client.config.ts`:

```typescript
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0, // 100% in development, lower in production (e.g., 0.1)
  replaysSessionSampleRate: 0.1, // 10% of sessions
  replaysOnErrorSampleRate: 1.0, // 100% of error sessions
  integrations: [
    new Sentry.BrowserTracing(),
    new Sentry.Replay({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
});
```

### 6. Update Error Reporting

Update `lib/monitoring/reportError.ts` to use Sentry:

```typescript
import * as Sentry from '@sentry/nextjs';

export function reportError(error: Error, context?: Record<string, any>) {
  Sentry.captureException(error, {
    extra: context,
  });
  console.error('Error reported:', error, context);
}
```

---

## Usage

### Client-Side Error Reporting

```typescript
import { reportError } from '@/lib/monitoring/reportError';

try {
  // Your code
} catch (error) {
  reportError(error as Error, { userId: user?.uid, action: 'placeBid' });
}
```

### Server-Side Error Reporting

```typescript
import * as Sentry from '@sentry/nextjs';

try {
  // Your code
} catch (error) {
  Sentry.captureException(error, {
    extra: { orderId, userId },
  });
  throw error;
}
```

### Manual Error Reporting

```typescript
import { reportMessage } from '@/lib/monitoring/sentry';

reportMessage('Payment failed', 'error', { orderId, amount });
```

---

## Performance Monitoring

Sentry automatically tracks:
- API route performance
- Database query times
- Page load times
- Component render times

View in Sentry Dashboard → Performance.

---

## Alerting

### Set Up Alerts

1. Go to Sentry Dashboard → Alerts
2. Create alert rules:
   - **Error Rate**: Alert if error rate > 1% in 5 minutes
   - **Critical Errors**: Alert immediately on 500 errors
   - **Performance**: Alert if p95 latency > 2s

### Notification Channels

- Email
- Slack
- PagerDuty
- Discord
- Webhooks

---

## Best Practices

### 1. Don't Log Sensitive Data

```typescript
// ❌ Bad
Sentry.captureException(error, {
  extra: { password, creditCard },
});

// ✅ Good
Sentry.captureException(error, {
  extra: { userId, orderId },
});
```

### 2. Use Context Tags

```typescript
Sentry.setTag('userRole', user.role);
Sentry.setTag('environment', process.env.NODE_ENV);
```

### 3. Group Related Errors

```typescript
Sentry.setContext('payment', {
  orderId,
  amount,
  currency: 'USD',
});
```

### 4. Filter Out Noise

Configure in Sentry Dashboard → Settings → Inbound Filters:
- Filter out browser extension errors
- Filter out known third-party errors
- Ignore specific error messages

---

## Production Configuration

### Sample Rate

Adjust `tracesSampleRate` based on traffic:
- **Development**: 1.0 (100%)
- **Production**: 0.1 (10%) or 0.01 (1%) for high traffic

### Release Tracking

Add to `next.config.js`:

```javascript
const { withSentryConfig } = require('@sentry/nextjs');

module.exports = withSentryConfig(
  nextConfig,
  {
    silent: true,
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
  },
  {
    widenClientFileUpload: true,
    hideSourceMaps: true,
    disableLogger: true,
  }
);
```

---

## Alternative: LogRocket

If you prefer LogRocket:

1. Install: `npm install logrocket`
2. Initialize in `app/layout.tsx`:

```typescript
import LogRocket from 'logrocket';

if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_LOGROCKET_APP_ID) {
  LogRocket.init(process.env.NEXT_PUBLIC_LOGROCKET_APP_ID);
}
```

---

## Resources

- [Sentry Next.js Docs](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [Sentry Performance Monitoring](https://docs.sentry.io/product/performance/)
- [Sentry Session Replay](https://docs.sentry.io/product/session-replay/)
