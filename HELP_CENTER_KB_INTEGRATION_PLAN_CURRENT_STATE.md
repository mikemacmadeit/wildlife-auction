# HELP CENTER + KB INTEGRATION PLAN (CURRENT STATE)

## Audit Date
January 2025

## Executive Summary
This document audits the current Support Ticket system and Help infrastructure to plan the integration of a Knowledge Base (KB) system with AI Help Chat. The existing system has a solid foundation with admin and user-facing support pages, but lacks a Knowledge Base, AI chat, and structural enforcement of KB updates.

---

## 1. EXISTING SUPPORT TICKET SYSTEM

### 1.1 Firestore Collections & Schema

**Primary Collection: `supportTickets/{ticketId}`**

**Ticket Document Fields:**
- `ticketId: string` - Document ID (also stored as field)
- `status: 'open' | 'resolved'` - Current ticket status
- `source: 'in_app' | 'contact_form'` - Where ticket originated
- `category: string` - Optional category (e.g., 'orders', 'payments', 'listings', 'offers', 'messages', 'compliance', 'technical', 'other')
- `name: string` - User's name
- `email: string` - User's email (required)
- `subject: string` - Ticket subject (max 160 chars)
- `message: string` - Original message (max 5000 chars)
- `userId: string | null` - Firebase Auth UID (if authenticated)
- `listingId: string | null` - Optional related listing ID
- `orderId: string | null` - Optional related order ID
- `createdAt: Timestamp` - When ticket was created
- `updatedAt: Timestamp` - Last update timestamp
- `lastPublicReplyAt: Timestamp` - Last reply timestamp
- `lastPublicReplyBy: 'user' | 'admin'` - Who last replied
- `adminLastRepliedAt: Timestamp | null` - Admin reply timestamp
- `adminLastRepliedBy: string | null` - Admin UID who last replied
- `resolvedAt: Timestamp | null` - When ticket was resolved
- `resolvedBy: string | null` - Admin UID who resolved
- `adminNote: string | null` - Internal admin notes (max 2000 chars)
- `meta: object` - Metadata (hasAuth, emailVerified, ipPresent, userAgent)
- `aiDraftResponse: string | null` - AI-generated draft (admin-only, optional)
- `aiDraftGeneratedAt: Timestamp | null` - When draft was generated
- `aiDraftModel: string | null` - OpenAI model used

**Subcollection: `supportTickets/{ticketId}/messages/{messageId}`**

**Message Document Fields:**
- `kind: 'user' | 'admin'` - Message sender type
- `by: string` - UID of sender (user or admin)
- `body: string` - Message text
- `createdAt: Timestamp` - When message was sent

**File References:**
- Schema inferred from: `app/api/support/tickets/route.ts` (lines 165-191)
- Schema inferred from: `app/api/admin/support/tickets/[ticketId]/reply/route.ts` (lines 45-48)
- Schema inferred from: `app/api/admin/support/tickets/[ticketId]/status/route.ts` (lines 45-55)

---

## 2. ADMIN SUPPORT INTERFACE

### 2.1 Admin Support Page
**File:** `app/dashboard/admin/support/page.tsx`
**Route:** `/dashboard/admin/support`
**Access:** Admin-only (gated by `useAdmin()` hook)

**Current Features:**
- Tabbed view: "Open" and "Resolved" tickets
- Search by: ticketId, email, subject, userId, listingId, orderId
- Ticket list displays: subject, name, email, status badge, created date
- Click "Open" to view ticket details in dialog
- Reply dialog with:
  - Original message preview
  - Reply textarea
  - AI draft generation (if enabled)
  - Send button
- Mark as resolved/reopen buttons
- Status filtering (open/resolved tabs)

**Current Limitations:**
- No priority field
- No assignment to specific admins
- No advanced filtering (date range, category, priority)
- No sorting options (only by creation date desc)
- No pagination (loads up to 100 tickets)
- No internal admin notes section in detail view
- No context links to related listings/orders

**API Endpoints:**
- `GET /api/admin/support/tickets` - List tickets (admin-only)
- `POST /api/admin/support/tickets/[ticketId]/reply` - Send admin reply
- `POST /api/admin/support/tickets/[ticketId]/status` - Update status
- `POST /api/admin/support/tickets/[ticketId]/ai-draft` - Generate AI draft

**File:** `app/api/admin/support/tickets/route.ts`
**File:** `app/api/admin/support/tickets/[ticketId]/reply/route.ts`
**File:** `app/api/admin/support/tickets/[ticketId]/status/route.ts`
**File:** `app/api/admin/support/tickets/[ticketId]/ai-draft/route.ts`

---

## 3. USER SUPPORT INTERFACE

### 3.1 User Support Page
**File:** `app/dashboard/support/page.tsx`
**Route:** `/dashboard/support`
**Access:** Authenticated users only

**Current Features:**
- Tabbed view: "New ticket" and "My tickets"
- Create ticket form:
  - Subject (required)
  - Message (required, min 10 chars)
  - Listing ID (optional)
  - Order ID (optional)
  - Category (defaults to 'other')
- View own tickets:
  - List of user's tickets
  - Status badges
  - Created/updated dates
  - Last reply indicator
  - Related listing/order IDs

**Current Limitations:**
- No ticket detail view with message thread
- No ability to reply to tickets from UI (only via email)
- No issue type dropdown (category is hardcoded to 'other')
- No auto-attached context (listingId/orderId must be manually entered)

**API Endpoints:**
- `GET /api/support/tickets` - List user's tickets
- `POST /api/support/tickets` - Create new ticket
- `POST /api/support/tickets/[ticketId]/reply` - User reply (exists but not used in UI)

**File:** `app/api/support/tickets/route.ts`
**File:** `app/api/support/tickets/[ticketId]/reply/route.ts`

---

## 4. PUBLIC CONTACT FORM

### 4.1 Contact Form Component
**File:** `components/support/ContactForm.tsx`
**Route:** `/contact` (assumed, not verified)

**Current Features:**
- Public form (no auth required)
- Fields: name, email, subject, message, listingId, orderId
- Honeypot spam protection
- Creates support ticket via `/api/support/contact`
- Success confirmation with ticket ID

**API Endpoint:**
- `POST /api/support/contact` - Public contact form submission

**File:** `app/api/support/contact/route.ts`

---

## 5. AUTHENTICATION & AUTHORIZATION

### 5.1 Admin Access Control
**Pattern:** `requireAdmin()` utility function
**File:** `app/api/admin/_util.ts` (inferred from imports)

**Admin Endpoints:**
- All `/api/admin/support/*` routes require admin role
- Uses Firebase Admin Auth token verification
- Returns 401/403 if not admin

### 5.2 User Access Control
**Pattern:** `requireUser()` function in support routes
**File:** `app/api/support/tickets/route.ts` (lines 31-53)

**User Endpoints:**
- `/api/support/tickets` - Requires authenticated user
- Users can only see their own tickets (filtered by `userId`)

### 5.3 Public Access
**Pattern:** Rate-limited, no auth required
**Endpoints:**
- `/api/support/contact` - Public contact form (rate-limited)

---

## 6. EXISTING HELP INFRASTRUCTURE

### 6.1 HelpLauncher Component
**File:** `components/help/HelpLauncher.tsx`
**Location in Layout:** `app/layout.tsx` (line 128)
**Current Position:** Fixed top-right (not bottom-right as requested)

**Current Features:**
- Floating help button (top-right)
- Opens right-side slideover panel (`HelpPanel`)
- Contextual help content based on current route
- First-time tour banners
- Tour overlay system

**Current Limitations:**
- No AI chat integration
- No Knowledge Base integration
- No support ticket creation from help panel
- Position is top-right (requested: bottom-right)

### 6.2 HelpPanel Component
**File:** `components/help/HelpPanel.tsx`
**Type:** Right-side slideover (Sheet component)

**Current Features:**
- Displays contextual help content
- "Start tour" button
- Links to external resources
- Checklist and common mistakes sections

**Current Limitations:**
- No "Ask a question" AI chat
- No "Contact support" ticket form
- No Knowledge Base article browsing

### 6.3 Help Content System
**File:** `help/helpContent.ts`
**File:** `lib/help/helpKeys.ts`
**File:** `help/tours.ts`

**Current Structure:**
- Route-based help key mapping
- Static help content per route
- Tour definitions with step-by-step guides
- No dynamic Knowledge Base integration

---

## 7. ROOT LAYOUT & FLOATING WIDGET PLACEMENT

### 7.1 Root Layout File
**File:** `app/layout.tsx`
**Line 128:** `<HelpLauncher />` is already mounted

**Current Structure:**
```tsx
<body>
  <Providers>
    {!gateAllowed ? (
      <SiteGateOverlay />
    ) : (
      <div className="min-h-screen flex flex-col bg-background relative">
        <ConditionalNavbar />
        <PublicEmailCaptureMount />
        <HelpLauncher />  {/* Line 128 - Already exists! */}
        <main>{children}</main>
        <ConditionalFooter />
        <Toaster />
        <SonnerToaster />
      </div>
    )}
  </Providers>
</body>
```

**Safe Placement for Floating Widget:**
- ✅ `HelpLauncher` is already in root layout
- ✅ Positioned outside main content area
- ✅ Uses fixed positioning (z-index 60)
- ⚠️ Currently top-right, needs to be moved to bottom-right for mobile safety

---

## 8. EMAIL NOTIFICATIONS

### 8.1 Support Ticket Reply Email
**File:** `lib/email/templates.ts` (lines 1396-1420)
**Function:** `getSupportTicketReplyEmail()`

**Current Behavior:**
- Admin replies trigger email to user
- Email includes: user name, admin message, ticket link
- Uses `sendEmailHtml()` function

**File:** `lib/email/sender.ts`

---

## 9. MISSING FEATURES (TO BE IMPLEMENTED)

### 9.1 Knowledge Base System
- ❌ No Firestore `knowledgeBaseArticles` collection
- ❌ No KB article schema
- ❌ No KB management UI
- ❌ No KB sync script
- ❌ No KB files in repo

### 9.2 AI Help Chat
- ❌ No AI chat endpoint
- ❌ No KB-grounded AI responses
- ❌ No chat UI in Help panel
- ❌ No "Create ticket from chat" flow

### 9.3 Enhanced Admin Support
- ❌ No priority field
- ❌ No assignment system
- ❌ No advanced filters
- ❌ No sorting options
- ❌ No pagination
- ❌ No internal notes in detail view
- ❌ No context links

### 9.4 Enhanced User Support
- ❌ No ticket detail view with message thread
- ❌ No reply UI (only email)
- ❌ No issue type dropdown
- ❌ No auto-attached context

### 9.5 KB Update Enforcement
- ❌ No CI checks for KB updates
- ❌ No KB sync script
- ❌ No KB files in repo structure

---

## 10. ASSUMPTIONS & CONSTRAINTS

### 10.1 Assumptions
1. **Support tickets are the primary user support channel** - No separate chat system exists
2. **Email is the primary notification method** - Users receive email when admins reply
3. **Admin support page is functional** - Can be enhanced without breaking
4. **User support page is functional** - Can be enhanced without breaking
5. **HelpLauncher is already mounted** - Can be enhanced/modified
6. **Firestore is the source of truth** - All data stored in Firestore
7. **OpenAI API key is server-side only** - Already enforced in existing AI features

### 10.2 Constraints
1. **Must not break existing ticket system** - Backward compatibility required
2. **Must maintain existing API contracts** - Don't break existing integrations
3. **Must respect auth/role gating** - Admin vs user separation
4. **Must be mobile-safe** - Bottom-right positioning for floating widget
5. **Must be performant** - Pagination, indexing, efficient queries

---

## 11. FILE PATHS SUMMARY

### 11.1 Admin Support Files
- `app/dashboard/admin/support/page.tsx` - Admin support UI
- `app/api/admin/support/tickets/route.ts` - List tickets (admin)
- `app/api/admin/support/tickets/[ticketId]/reply/route.ts` - Admin reply
- `app/api/admin/support/tickets/[ticketId]/status/route.ts` - Update status
- `app/api/admin/support/tickets/[ticketId]/ai-draft/route.ts` - AI draft generation

### 11.2 User Support Files
- `app/dashboard/support/page.tsx` - User support UI
- `app/api/support/tickets/route.ts` - List/create tickets (user)
- `app/api/support/tickets/[ticketId]/reply/route.ts` - User reply
- `app/api/support/contact/route.ts` - Public contact form

### 11.3 Help System Files
- `components/help/HelpLauncher.tsx` - Floating help button
- `components/help/HelpPanel.tsx` - Right-side help panel
- `components/help/HelpButton.tsx` - Help button component
- `help/helpContent.ts` - Static help content
- `lib/help/helpKeys.ts` - Route-to-help-key mapping

### 11.4 Email & Templates
- `lib/email/templates.ts` - Email templates (including support reply)
- `lib/email/sender.ts` - Email sending function

### 11.5 Root Layout
- `app/layout.tsx` - Root layout (HelpLauncher mounted at line 128)

---

## 12. NEXT STEPS

### Phase 1: Upgrade Admin Support Tab
- Add priority field to ticket schema
- Add assignment system
- Add advanced filters (status, priority, category, date)
- Add sorting options
- Add pagination
- Add internal notes section
- Add context links (listing/order)

### Phase 2: User Help Widget
- Move HelpLauncher to bottom-right
- Add "Ask a question" AI chat to HelpPanel
- Add "Contact support" ticket form to HelpPanel
- Enhance user support page with ticket detail view
- Add message thread UI
- Add reply functionality

### Phase 3: Knowledge Base System
- Create Firestore `knowledgeBaseArticles` collection
- Define KB article schema
- Create KB management UI (admin-only)
- Create KB sync script
- Create KB file structure in repo

### Phase 4: AI Help Chat
- Create server-side AI chat endpoint
- Implement KB article retrieval
- Implement KB-grounded AI responses
- Add chat UI to HelpPanel
- Add "Create ticket from chat" flow

### Phase 5: KB Update Enforcement
- Create KB file structure in repo
- Create KB sync script
- Add CI guardrail checks
- Document KB update requirements

### Phase 6: Seed Initial KB
- Create 60+ starter articles
- Cover all major user-facing features
- Sync to Firestore

---

## 13. TECHNICAL NOTES

### 13.1 Firestore Indexes Required
- `supportTickets`: `status + createdAt` (composite index)
- `supportTickets`: `userId + createdAt` (composite index)
- `knowledgeBaseArticles`: `enabled + audience + category` (to be created)
- `knowledgeBaseArticles`: `tags` (array-contains-any queries)

### 13.2 Rate Limiting
- Support endpoints use `RATE_LIMITS.support`
- Defined in: `lib/rate-limit.ts`
- Uses Upstash Redis in production

### 13.3 AI Integration
- OpenAI API key: `OPENAI_API_KEY` (server-side only)
- Existing AI features: Dispute summaries, Admin drafts
- Pattern: Server-side only, feature flags, safe error handling

---

## 14. RISK ASSESSMENT

### 14.1 Low Risk
- ✅ HelpLauncher already exists and is mounted
- ✅ Support ticket system is functional
- ✅ Auth/role gating is established
- ✅ Email notifications work

### 14.2 Medium Risk
- ⚠️ Moving HelpLauncher position (top-right → bottom-right)
- ⚠️ Adding new fields to ticket schema (backward compatibility)
- ⚠️ Adding KB collection (new Firestore collection)

### 14.3 High Risk
- 🔴 CI guardrail checks (could block legitimate builds)
- 🔴 KB sync script (must be idempotent and safe)
- 🔴 AI chat accuracy (must be KB-grounded, no hallucinations)

---

## END OF AUDIT

This document provides the foundation for implementing the Help Center + KB integration. All phases should maintain backward compatibility with the existing support ticket system.
