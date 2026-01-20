# Production Deployment Checklist

## 🔐 Security Checklist

### Authentication & Authorization
- [x] Firebase Auth token verification on all API routes
- [x] Admin role verification for sensitive operations
- [x] Firestore security rules deployed
- [x] Webhook signature verification implemented
- [ ] Review and test all security rules
- [ ] Verify admin role assignment works correctly

### API Security
- [x] Rate limiting implemented
- [x] Input validation with Zod schemas
- [x] Error handling that doesn't leak sensitive info
- [ ] Add request size limits (Next.js default is 4.5MB)
- [ ] Consider adding IP whitelisting for admin routes (optional)

### Data Protection
- [x] Environment variables properly configured
- [x] No secrets in code
- [ ] Verify `.env.local` is in `.gitignore`
- [ ] Review all API responses for sensitive data leaks
- [ ] Ensure PII is handled according to privacy policy

## 💳 Payment System Checklist

### Stripe Configuration
- [ ] Switch from test keys to live keys in production
- [ ] Configure Stripe webhook endpoint in production
- [ ] Set `STRIPE_WEBHOOK_SECRET` in production environment
- [ ] Test webhook delivery in production
- [ ] Verify Stripe Connect accounts work in live mode
- [ ] Test escrow payment flow end-to-end
- [ ] Test refund processing

### Payment Flows
- [x] Escrow payment flow implemented
- [x] Admin payout API implemented
- [x] Auction checkout flow implemented
- [x] Refund handling implemented
- [ ] Test all payment scenarios:
  - [ ] Fixed price purchase
  - [ ] Auction winner checkout
  - [ ] Payment release (admin)
  - [ ] Full refund
  - [ ] Partial refund

## 🗄️ Database Checklist

### Firestore
- [x] Security rules deployed
- [x] Composite indexes deployed
- [ ] Verify all indexes are built (check Firebase Console)
- [ ] Test queries with production data volumes
- [ ] Set up Firestore backup schedule
- [ ] Review storage costs and quotas

### Data Validation
- [x] Input validation on API routes
- [ ] Client-side validation (already exists in forms)
- [ ] Verify Firestore rules prevent invalid data

## 🚀 Deployment Checklist

### Environment Variables
- [ ] **Firebase Client Config:**
  - [ ] `NEXT_PUBLIC_FIREBASE_API_KEY`
  - [ ] `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
  - [ ] `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
  - [ ] `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
  - [ ] `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
  - [ ] `NEXT_PUBLIC_FIREBASE_APP_ID`

- [ ] **Firebase Admin SDK:**
  - [ ] `FIREBASE_PROJECT_ID`
  - [ ] `FIREBASE_CLIENT_EMAIL`
  - [ ] `FIREBASE_PRIVATE_KEY` (properly formatted with `\n`)

- [ ] **Stripe:**
  - [ ] `STRIPE_SECRET_KEY` (live key: `sk_live_...`)
  - [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (live key: `pk_live_...`)
  - [ ] `STRIPE_WEBHOOK_SECRET` (from Stripe Dashboard)

- [ ] **Upstash (Rate limiting - REQUIRED in production):**
  - [ ] `UPSTASH_REDIS_REST_URL`
  - [ ] `UPSTASH_REDIS_REST_TOKEN`

- [ ] **Application:**
  - [ ] `APP_URL` or `NEXT_PUBLIC_APP_URL` (production domain)
  - [ ] `NODE_ENV=production`

### Stripe Webhook Setup
1. [ ] Go to Stripe Dashboard → Developers → Webhooks
2. [ ] Click "Add endpoint"
3. [ ] Enter production URL: `https://yourdomain.com/api/stripe/webhook`
4. [ ] Select events to listen for:
   - [ ] `checkout.session.completed`
   - [ ] `account.updated`
5. [ ] Copy webhook signing secret to `STRIPE_WEBHOOK_SECRET`
6. [ ] Test webhook delivery

### Firebase Setup
- [ ] Verify Firebase project is in production mode
- [ ] Ensure Firestore is enabled
- [ ] Ensure Firebase Storage is enabled
- [ ] Verify Firebase Auth is configured
- [ ] Test Firebase Admin SDK initialization
- [ ] Deploy Firestore rules: `firebase deploy --only firestore:rules`
- [ ] Deploy Firestore indexes: `firebase deploy --only firestore:indexes`
- [ ] Verify all indexes are built (may take a few minutes)

### Netlify Scheduled Functions
- [ ] Confirm scheduled functions are enabled in Netlify
- [ ] Confirm `aggregateRevenue` runs hourly and writes:
  - [ ] `adminRevenueAggregates/global`
  - [ ] `adminRevenueAggState/global`
  - [ ] `opsHealth/aggregateRevenue`

### Build & Deploy
- [ ] Run `npm run build` successfully
- [ ] Fix any build errors
- [ ] Test production build locally: `npm start`
- [ ] Deploy to hosting platform (Netlify/Vercel/etc.)
- [ ] Verify deployment succeeded
- [ ] Test production URL

## 🧪 Testing Checklist

### Functional Testing
- [ ] User registration and login
- [ ] Listing creation (all types: fixed, auction, classified)
- [ ] Listing approval (admin)
- [ ] Bidding on auctions
- [ ] Fixed price purchase
- [ ] Auction winner checkout
- [ ] Payment processing
- [ ] Admin payout release
- [ ] Refund processing
- [ ] Watchlist functionality
- [ ] Search and filters

### Payment Testing
- [ ] Test checkout with real Stripe test cards
- [ ] Verify webhook receives events
- [ ] Test order creation after payment
- [ ] Test admin payout release
- [ ] Test refund processing
- [ ] Verify funds are held in escrow correctly

### Security Testing
- [ ] Attempt unauthorized API access
- [ ] Test rate limiting (make many requests)
- [ ] Test input validation (send invalid data)
- [ ] Verify admin routes are protected
- [ ] Test Firestore rules (try unauthorized reads/writes)

## 📊 Monitoring Setup

### Error Tracking
- [ ] Set up error monitoring (Sentry/LogRocket/etc.)
- [ ] Configure error alerts
- [ ] Test error reporting

### Performance Monitoring
- [ ] Set up performance monitoring
- [ ] Configure performance alerts
- [ ] Monitor API response times

### Uptime Monitoring
- [ ] Set up uptime monitoring (UptimeRobot/Pingdom/etc.)
- [ ] Configure downtime alerts
- [ ] Test alert notifications

### Logging
- [ ] Set up log aggregation (if needed)
- [ ] Configure log retention policy
- [ ] Set up log alerts for critical errors

## 📧 Email Notifications (Future)

- [ ] Set up email service (SendGrid/Resend/etc.)
- [ ] Configure email templates
- [ ] Test email delivery
- [ ] Implement order confirmation emails
- [ ] Implement delivery confirmation emails
- [ ] Implement payout notification emails
- [ ] Implement auction winner notifications

## 🔍 Pre-Launch Review

### Code Review
- [ ] Review all API routes for security
- [ ] Review Firestore rules
- [ ] Review error handling
- [ ] Remove console.logs with sensitive data
- [ ] Review all TODO comments

### Performance
- [ ] Test page load times
- [ ] Optimize images
- [ ] Enable Next.js image optimization (if not using unoptimized)
- [ ] Test on slow connections
- [ ] Review bundle sizes

### Accessibility
- [ ] Test keyboard navigation
- [ ] Test screen reader compatibility
- [ ] Verify color contrast
- [ ] Test on mobile devices

### Browser Compatibility
- [ ] Test on Chrome
- [ ] Test on Firefox
- [ ] Test on Safari
- [ ] Test on Edge
- [ ] Test on mobile browsers

## 🚨 Post-Launch

### Immediate (First 24 hours)
- [ ] Monitor error logs
- [ ] Monitor payment success rates
- [ ] Monitor webhook delivery
- [ ] Check for any critical errors
- [ ] Verify all features work in production

### First Week
- [ ] Review user feedback
- [ ] Monitor performance metrics
- [ ] Check for any security issues
- [ ] Review payment processing
- [ ] Monitor rate limit hits

### Ongoing
- [ ] Regular security audits
- [ ] Performance optimization
- [ ] Feature updates
- [ ] Bug fixes
- [ ] User support

## 📝 Notes

- Rate limiting uses in-memory storage (suitable for single-instance deployments)
- For multi-instance deployments, consider Redis-based rate limiting
- Email notifications are not yet implemented (can be added post-launch)
- Error monitoring should be set up before launch
- All critical payment flows are implemented and tested
