# Production Environment Setup Guide

## Overview
This guide covers all steps needed to deploy Wildlife Exchange to production.

## Prerequisites
- Production domain name configured
- Stripe production account
- Firebase production project
- Netlify/Vercel account (or your hosting provider)

---

## 1. Environment Variables

### Required Environment Variables

Create a `.env.production` file or set these in your hosting provider:

```bash
# Firebase Client Config
NEXT_PUBLIC_FIREBASE_API_KEY=your_production_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-production-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Firebase Admin SDK
FIREBASE_PROJECT_ID=your-production-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Stripe Production
STRIPE_SECRET_KEY=sk_live_xxxxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx

# Escrow Settings
ESCROW_DISPUTE_WINDOW_HOURS=72

# Email Service (if using)
RESEND_API_KEY=re_xxxxx
# OR
SENDGRID_API_KEY=SG.xxxxx

# Error Monitoring (if using)
SENTRY_DSN=https://xxxxx@sentry.io/xxxxx
NEXT_PUBLIC_SENTRY_DSN=https://xxxxx@sentry.io/xxxxx
```

### Verification Checklist
- [ ] All Firebase variables match production project
- [ ] Stripe keys are from production account (not test mode)
- [ ] Webhook secret is from production webhook endpoint
- [ ] Private key is properly escaped (newlines as `\n`)
- [ ] No test/development keys in production

---

## 2. Stripe Webhook Configuration

### Create Webhook Endpoint

1. Go to Stripe Dashboard → Developers → Webhooks
2. Click "Add endpoint"
3. Endpoint URL: `https://yourdomain.com/api/stripe/webhook`
4. Select events to listen for:
   - `checkout.session.completed`
   - `account.updated`
   - `payment_intent.succeeded` (optional, for additional tracking)
   - `transfer.created` (optional, for tracking payouts)

5. Copy the **Signing secret** (starts with `whsec_`)
6. Add to environment variables as `STRIPE_WEBHOOK_SECRET`

### Test Webhook
```bash
# Use Stripe CLI to test
stripe listen --forward-to localhost:3000/api/stripe/webhook
stripe trigger checkout.session.completed
```

---

## 3. Firebase Production Setup

### Firestore Security Rules

1. Deploy production rules:
```bash
firebase deploy --only firestore:rules
```

2. Verify rules are active in Firebase Console → Firestore → Rules

### Firestore Indexes

1. Deploy indexes:
```bash
firebase deploy --only firestore:indexes
```

2. Verify all composite indexes are created in Firebase Console → Firestore → Indexes

### Storage Rules

1. Deploy storage rules:
```bash
firebase deploy --only storage
```

### Firebase Admin SDK

1. Download service account key from Firebase Console → Project Settings → Service Accounts
2. Extract:
   - `project_id` → `FIREBASE_PROJECT_ID`
   - `client_email` → `FIREBASE_CLIENT_EMAIL`
   - `private_key` → `FIREBASE_PRIVATE_KEY` (escape newlines)

---

## 4. Hosting Configuration

### Netlify

1. **Build Settings:**
   - Build command: `cd project && npm run build`
   - Publish directory: `project/.next`
   - Node version: `18.x` or `20.x`

2. **Environment Variables:**
   - Add all required env vars in Netlify Dashboard → Site Settings → Environment Variables
   - Mark sensitive vars as "Encrypted"

3. **Functions (if using):**
   - Ensure Netlify Functions are configured for API routes

4. **Redirects:**
   - Add `netlify.toml` with redirect rules if needed

### Vercel

1. **Project Settings:**
   - Framework Preset: Next.js
   - Root Directory: `project`
   - Build Command: `npm run build`
   - Output Directory: `.next`

2. **Environment Variables:**
   - Add all required vars in Vercel Dashboard → Settings → Environment Variables
   - Set for Production, Preview, and Development

---

## 5. CDN and Caching

### Next.js Image Optimization

- Configure `next.config.js` with image domains:
```javascript
images: {
  domains: ['firebasestorage.googleapis.com', 'your-cdn-domain.com'],
}
```

### Static Asset Caching

- Configure headers for static assets (handled by hosting provider)
- Cache-Control headers for images, fonts, etc.

---

## 6. Monitoring and Logging

### Error Tracking

1. **Sentry Setup:**
   - Create Sentry project
   - Install: `npm install @sentry/nextjs`
   - Configure `sentry.client.config.ts` and `sentry.server.config.ts`
   - Add DSN to environment variables

2. **Logging:**
   - Set up log aggregation (e.g., LogRocket, Datadog)
   - Configure console.log levels for production

### Performance Monitoring

- Enable Next.js Analytics (if using Vercel)
- Set up uptime monitoring (e.g., UptimeRobot, Pingdom)
- Configure alerts for:
  - API response times > 2s
  - Error rate > 1%
  - Uptime < 99.9%

---

## 7. Security Checklist

### Before Launch

- [ ] All API routes have authentication
- [ ] Admin routes verify admin role server-side
- [ ] Rate limiting enabled on all API routes
- [ ] CORS configured (if needed)
- [ ] HTTPS enforced (automatic on Netlify/Vercel)
- [ ] Firestore security rules deployed
- [ ] Storage security rules deployed
- [ ] Stripe webhook signature verification enabled
- [ ] No sensitive data in client-side code
- [ ] Environment variables not exposed to client
- [ ] Content Security Policy configured

### Post-Launch

- [ ] Monitor error logs daily
- [ ] Review Stripe webhook delivery
- [ ] Check Firestore usage/quota
- [ ] Monitor API rate limits
- [ ] Review security alerts

---

## 8. Testing Checklist

### Pre-Launch Testing

- [ ] Test user registration/login
- [ ] Test listing creation
- [ ] Test payment flow (use Stripe test mode first)
- [ ] Test admin payout release
- [ ] Test refund processing
- [ ] Test dispute workflow
- [ ] Test protected transactions
- [ ] Test email notifications (if implemented)
- [ ] Test on mobile devices
- [ ] Test on different browsers
- [ ] Load test critical endpoints

### Post-Launch Monitoring

- [ ] Monitor first 10 transactions
- [ ] Verify webhook delivery
- [ ] Check error rates
- [ ] Monitor performance metrics
- [ ] Review user feedback

---

## 9. Rollback Plan

### If Issues Occur

1. **Immediate Actions:**
   - Disable new registrations (if needed)
   - Pause new listings (if needed)
   - Review error logs

2. **Rollback Steps:**
   - Revert to previous deployment
   - Restore database backup (if needed)
   - Notify users of temporary issues

3. **Communication:**
   - Update status page
   - Notify affected users via email
   - Post on social media (if applicable)

---

## 10. Post-Launch Tasks

### Week 1

- [ ] Monitor all transactions
- [ ] Review error logs daily
- [ ] Check Stripe dashboard daily
- [ ] Verify Firebase usage
- [ ] Collect user feedback

### Month 1

- [ ] Performance optimization
- [ ] Security audit review
- [ ] User analytics review
- [ ] Feature usage analysis
- [ ] Cost optimization review

---

## Support Contacts

- **Stripe Support:** https://support.stripe.com
- **Firebase Support:** https://firebase.google.com/support
- **Hosting Support:** Check your provider's documentation

---

## Additional Resources

- [Next.js Deployment Docs](https://nextjs.org/docs/deployment)
- [Stripe Production Checklist](https://stripe.com/docs/keys)
- [Firebase Production Best Practices](https://firebase.google.com/docs/projects/best-practices)
